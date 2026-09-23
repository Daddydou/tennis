import 'server-only';
import { supabaseAdmin } from './server';
import { supabaseAnon } from './anon';
import { consensusMarche, type CoteBookmaker } from '@/lib/cotes';
import { apparierNom, indexerJoueursTableau } from '@/lib/matching';

/**
 * COTES BOOKMAKERS — RÉCUPÉRATION ET CACHE (The Odds API v4)
 *
 * ⚠ ISOLÉ. Rien de ce module n'est lu par les picks, le fantasy ou la
 * simulation : il n'alimente que l'écran de mesure /calibration/cotes. Le
 * blend n'est PAS branché — on cherche d'abord à savoir s'il vaut le coup.
 *
 * QUOTA. Le palier gratuit plafonne à 500 requêtes par mois, et une requête
 * d'odds coûte [nombre de marchés] × [nombre de régions] crédits. On demande
 * donc un seul marché (h2h) et une seule région : 1 crédit par appel. L'appel
 * n'a lieu QUE sur action explicite (`POST /api/cotes/refresh`) ; l'affichage,
 * lui, ne lit que le cache `tn_odds`.
 *
 * FENÊTRE DE CAPTURE. Le palier gratuit ne sert que les rencontres à venir ou
 * en cours : l'historique est payant. Une cote doit donc être capturée AVANT
 * que le match ne se joue, sinon elle est définitivement hors de portée. C'est
 * la contrainte structurante de cet écran, et la raison pour laquelle le cache
 * est une archive et pas seulement une économie.
 */

/** Un seul marché, une seule région : 1 crédit par appel. */
const MARCHE = 'h2h';
const REGION = 'eu';
const BASE = 'https://api.the-odds-api.com/v4';

/* -------------------------------------------------------------------------- */
/*  Formes renvoyées par l'API                                                 */
/* -------------------------------------------------------------------------- */

interface SportApi {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}

interface EvenementApi {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: {
    key: string;
    title: string;
    markets?: { key: string; outcomes?: { name: string; price: number }[] }[];
  }[];
}

/** Ligne de cache, telle que l'écran la lit. */
export interface LigneCote {
  event_id: string;
  sport_key: string;
  commence_time: string | null;
  nom_a: string;
  nom_b: string;
  player_a_id: string | null;
  player_b_id: string | null;
  proba_a: number | null;
  proba_b: number | null;
  bookmakers: number;
  recupere_le: string;
}

export interface ResumeRafraichissement {
  ok: boolean;
  error?: string;
  /** Rencontres renvoyées par l'API pour ce sport. */
  evenements?: number;
  /** Rencontres dont les DEUX joueurs ont été appariés au tableau. */
  appariees?: number;
  /** Rencontres écrites en cache (appariées ou non). */
  ecrites?: number;
  /** Noms non appariés, à signaler plutôt qu'à taire. */
  nonApparies?: { nom: string; raison: 'absent' | 'ambigu' }[];
  /** Crédits restants sur le quota mensuel, lus dans les en-têtes de réponse. */
  quotaRestant?: number | null;
  quotaUtilise?: number | null;
  coutAppel?: number | null;
}

/** La clé d'API est-elle configurée ? L'écran doit pouvoir le dire sans appeler. */
export function cleCotesConfiguree(): boolean {
  return Boolean(process.env.ODDS_API_KEY);
}

function cle(): string {
  const k = process.env.ODDS_API_KEY;
  if (!k) {
    throw new Error(
      'ODDS_API_KEY absente : la clé The Odds API se configure dans les variables ' +
        "d'environnement (Vercel), jamais dans le code.",
    );
  }
  return k;
}

/**
 * Sports de tennis disponibles, pour choisir la bonne clé (`tennis_atp_…`).
 * Cet endpoint ne compte PAS dans le quota — on peut l'appeler à l'affichage.
 */
export async function listerSportsTennis(): Promise<SportApi[]> {
  const res = await fetch(`${BASE}/sports/?apiKey=${encodeURIComponent(cle())}&all=true`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`The Odds API /sports : HTTP ${res.status} ${res.statusText}`);
  }
  const tous = (await res.json()) as SportApi[];
  return tous
    .filter((s) => s.group === 'Tennis')
    .sort((a, b) => Number(b.active) - Number(a.active) || a.title.localeCompare(b.title));
}

/* -------------------------------------------------------------------------- */
/*  Lecture du cache                                                           */
/* -------------------------------------------------------------------------- */

/** Cotes en cache pour un tournoi. Lecture en clé publique. */
export async function chargerCotes(tournamentId: string): Promise<LigneCote[]> {
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('tn_odds')
    .select(
      'event_id, sport_key, commence_time, nom_a, nom_b, player_a_id, player_b_id, proba_a, proba_b, bookmakers, recupere_le',
    )
    .eq('tournament_id', tournamentId)
    .order('commence_time', { ascending: true });

  // 42P01 : table absente — migration 0008 pas encore jouée. L'écran doit le
  // dire, pas planter.
  if (error) {
    if (error.code === '42P01') return [];
    throw new Error(`tn_odds : ${error.message}`);
  }
  return (data ?? []).map((l) => ({
    ...l,
    proba_a: l.proba_a === null ? null : Number(l.proba_a),
    proba_b: l.proba_b === null ? null : Number(l.proba_b),
  })) as LigneCote[];
}

/** Nombre de cotes en cache par tournoi — pour la liste de sélection. */
export async function compterCotesParTournoi(): Promise<Record<string, number>> {
  const sb = supabaseAnon();
  const { data, error } = await sb.from('tn_odds').select('tournament_id');
  if (error) {
    if (error.code === '42P01') return {};
    throw new Error(`tn_odds : ${error.message}`);
  }
  const out: Record<string, number> = {};
  for (const l of data ?? []) out[l.tournament_id] = (out[l.tournament_id] ?? 0) + 1;
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Récupération et mise en cache                                              */
/* -------------------------------------------------------------------------- */

/**
 * Appelle The Odds API pour un sport, rapproche les rencontres du tableau, et
 * écrit le résultat dans `tn_odds`.
 *
 * Coûte 1 crédit de quota. À déclencher à la main, tant que le tournoi n'est
 * pas joué — après, les cotes ne sont plus accessibles sur le palier gratuit.
 */
export async function rafraichirCotes(
  tournamentId: string,
  sportKey: string,
  joueurs: { id: string; name: string }[],
): Promise<ResumeRafraichissement> {
  try {
    const url = new URL(`${BASE}/sports/${encodeURIComponent(sportKey)}/odds/`);
    url.searchParams.set('apiKey', cle());
    url.searchParams.set('regions', REGION);
    url.searchParams.set('markets', MARCHE);
    url.searchParams.set('oddsFormat', 'decimal');

    const res = await fetch(url, { cache: 'no-store' });
    const quota = {
      quotaRestant: Number(res.headers.get('x-requests-remaining') ?? NaN),
      quotaUtilise: Number(res.headers.get('x-requests-used') ?? NaN),
      coutAppel: Number(res.headers.get('x-requests-last') ?? NaN),
    };
    const nombreOuNull = (n: number) => (Number.isFinite(n) ? n : null);

    if (!res.ok) {
      const corps = await res.text().catch(() => '');
      return {
        ok: false,
        error: `The Odds API : HTTP ${res.status} ${res.statusText}. ${corps.slice(0, 200)}`,
        quotaRestant: nombreOuNull(quota.quotaRestant),
        quotaUtilise: nombreOuNull(quota.quotaUtilise),
      };
    }

    const evenements = (await res.json()) as EvenementApi[];
    const index = indexerJoueursTableau(joueurs);
    const nonApparies: { nom: string; raison: 'absent' | 'ambigu' }[] = [];

    const apparier = (nom: string): string | null => {
      const { id, echec } = apparierNom(index, nom);
      if (echec) nonApparies.push({ nom: echec.nom, raison: echec.raison });
      return id;
    };

    const lignes = evenements.map((e) => {
      // Cotes des bookmakers sur le marché vainqueur, orientées (domicile,
      // extérieur) — l'API nomme ainsi les deux joueurs d'un match de tennis.
      const cotes: CoteBookmaker[] = [];
      for (const b of e.bookmakers ?? []) {
        const marche = (b.markets ?? []).find((m) => m.key === MARCHE);
        const a = marche?.outcomes?.find((o) => o.name === e.home_team)?.price;
        const c = marche?.outcomes?.find((o) => o.name === e.away_team)?.price;
        if (typeof a === 'number' && typeof c === 'number') {
          cotes.push({ bookmaker: b.key, coteA: a, coteB: c });
        }
      }
      const { probaA, bookmakers } = consensusMarche(cotes);

      return {
        tournament_id: tournamentId,
        event_id: e.id,
        sport_key: e.sport_key,
        commence_time: e.commence_time ?? null,
        nom_a: e.home_team,
        nom_b: e.away_team,
        player_a_id: apparier(e.home_team),
        player_b_id: apparier(e.away_team),
        proba_a: probaA,
        proba_b: probaA === null ? null : 1 - probaA,
        bookmakers,
        recupere_le: new Date().toISOString(),
      };
    });

    if (lignes.length) {
      const sb = supabaseAdmin();
      const { error } = await sb
        .from('tn_odds')
        .upsert(lignes, { onConflict: 'tournament_id,event_id' });
      if (error) throw new Error(`tn_odds : ${error.message}`);
    }

    return {
      ok: true,
      evenements: evenements.length,
      appariees: lignes.filter((l) => l.player_a_id && l.player_b_id).length,
      ecrites: lignes.length,
      // Dédoublonné : un même nom revient à chaque tour du tournoi.
      nonApparies: [...new Map(nonApparies.map((n) => [n.nom, n])).values()],
      quotaRestant: nombreOuNull(quota.quotaRestant),
      quotaUtilise: nombreOuNull(quota.quotaUtilise),
      coutAppel: nombreOuNull(quota.coutAppel),
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
