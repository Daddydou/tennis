import 'server-only';
import { supabaseAdmin } from './server';
import { cleApi } from './importApi';
import { HOTE_API } from '@/lib/extract/matchstat';
import {
  colonnesApp,
  lireScoreTexte,
  majMatch,
  niveauApi,
  nouvelleNote,
  PARAMS_PRODUCTION,
  surfaceApi,
  type MatchElo,
  type NoteElo,
} from '@/lib/eloMaison';
import { normaliserNom } from '@/lib/matching';
import { quotaApi } from '@/externe/tennisApiClient';
import {
  dernierJourComplet,
  jourIso,
  jourNum,
  peutLireJour,
  RETARD_MAX_JOURS,
  retardJours,
} from '@/lib/eloMaisonSuivi';

/**
 * ELO MAISON — mise à jour quotidienne (table tn_elo_maison, migration 0028).
 *
 * Pour chaque circuit, du lendemain du dernier jour traité jusqu'à HIER : les résultats du
 * jour, TOUS NIVEAUX (Grand Chelem → ITF, comme l'historique d'amorçage), lus dans l'API
 * tennis (≈ 1 requête par circuit et par jour), appliqués dans l'ordre avec le moteur de
 * lib/eloMaison.ts, puis les notes modifiées et le suivi sont écrits. Un jour n'est marqué
 * traité qu'une fois toutes ses pages lues : un budget épuisé en cours de journée la laisse
 * pour le passage suivant.
 *
 * Appelé par le passage du cron (db/importAutoFlux.ts), après les tableaux. L'appelant a
 * vérifié l'accès (jeton). Écritures en service role.
 */

const JOUR_MS = 86400000;

interface Ligne {
  ta_slug: string;
  tour: 'atp' | 'wta';
  ta_name: string;
  ta_name_normalized: string;
  country: string | null;
  matchstat_id: string | null;
  note_generale: number;
  note_dur: number;
  note_terre: number;
  note_gazon: number;
  note_moquette: number;
  n: number;
  n_dur: number;
  n_terre: number;
  n_gazon: number;
  n_moquette: number;
  dernier_jour: number;
}

const versNote = (l: Ligne): NoteElo => ({
  general: Number(l.note_generale),
  surface: [Number(l.note_dur), Number(l.note_terre), Number(l.note_gazon), Number(l.note_moquette)],
  n: l.n,
  nSurface: [l.n_dur, l.n_terre, l.n_gazon, l.n_moquette],
  dernierJour: l.dernier_jour,
});

interface MatchApi {
  id: string | number;
  date?: string;
  roundId?: number;
  match_winner?: number;
  result?: string;
  result_type?: string;
  player1?: { id: number; name: string; countryAcr?: string };
  player2?: { id: number; name: string; countryAcr?: string };
  tournament?: { name?: string; rankId?: number; courtId?: number };
}

export interface RapportEloMaison {
  tour: 'atp' | 'wta';
  /** `quota` : budget ou quota API trop bas pour lire un jour, reprise au prochain passage. */
  statut: 'a_jour' | 'mis_a_jour' | 'partiel' | 'quota' | 'non_amorce' | 'en_retard';
  jours: number;
  matchs: number;
  nouveaux: number;
  requetes: number;
  jusquau: string | null;
  /** Jours de retard du suivi sur le dernier jour complet, APRES ce passage (0 = a jour). */
  retard: number;
}

interface Budget {
  reste: number;
  /** Vrai quand la lecture s'est arretee faute de quota (et non faute de jours a lire). */
  limite?: boolean;
}

async function lireJour(tour: 'atp' | 'wta', jour: string, budget: Budget, retard: number): Promise<MatchApi[] | null> {
  const out: MatchApi[] = [];
  for (let page = 1; ; page++) {
    // Budget du passage epuise, ou quota de l'API trop bas (reserve pour les tableaux) : on
    // s'arrete SANS marquer le jour traite ; le passage suivant le relit en entier.
    if (budget.reste <= 0 || !peutLireJour(quotaApi.restant, retard)) {
      budget.limite = true;
      return null;
    }
    budget.reste--;
    const res = await fetch(`https://${HOTE_API}/tennis/v2/${tour}/results/${jour}?pageSize=500&pageNo=${page}`, {
      headers: { 'X-RapidAPI-Key': cleApi(), 'X-RapidAPI-Host': HOTE_API },
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    const restant = Number(res.headers.get('x-ratelimit-requests-remaining') ?? NaN);
    if (Number.isFinite(restant)) quotaApi.restant = restant;
    // 429 : quota du jour atteint. Ce n'est pas une panne : l'Elo reprend au prochain passage.
    if (res.status === 429) {
      quotaApi.restant = 0;
      budget.limite = true;
      return null;
    }
    if (!res.ok) throw new Error(`API tennis (résultats ${tour} ${jour}) : HTTP ${res.status}`);
    const j = (await res.json()) as { data?: MatchApi[]; hasNextPage?: boolean };
    out.push(...(j.data ?? []));
    if (!j.hasNextPage) return out;
  }
}

/** Met à jour un circuit ; renvoie ce qui a été fait. */
async function mettreAJourCircuit(tour: 'atp' | 'wta', budget: Budget, maintenant: Date): Promise<RapportEloMaison> {
  const sb = supabaseAdmin();
  const { data: suivi, error } = await sb.from('tn_elo_maison_suivi').select('*').eq('tour', tour).maybeSingle();
  // Migration 0028 pas encore appliquée : rien à faire, sans erreur.
  if (error && (error.code === '42P01' || error.code === 'PGRST205')) {
    return { tour, statut: 'non_amorce', jours: 0, matchs: 0, nouveaux: 0, requetes: 0, jusquau: null, retard: 0 };
  }
  if (error) throw new Error(`Suivi Elo maison : ${error.message}`);
  const rapport: RapportEloMaison = { tour, statut: 'a_jour', jours: 0, matchs: 0, nouveaux: 0, requetes: 0, jusquau: suivi?.dernier_jour_traite ?? null, retard: 0 };
  if (!suivi) return { ...rapport, statut: 'non_amorce' };

  const hier = dernierJourComplet(maintenant);
  let jour = jourIso(new Date(Date.parse(`${suivi.dernier_jour_traite}T00:00:00Z`) + JOUR_MS));
  // Garde-fou quota : plus de 10 jours de retard (amorçage ancien, panne prolongée), on ne
  // rattrape PAS jour par jour (≈ 1 requête par jour et par circuit) — ré-amorcer plutôt
  // (recherche/elo-maison : combler-api.mjs puis amorcer.mts --ecrire).
  const retard0 = retardJours(suivi.dernier_jour_traite, maintenant);
  rapport.retard = retard0;
  if (retard0 > RETARD_MAX_JOURS) return { ...rapport, statut: 'en_retard' };
  let total = suivi.matchs_traites as number;

  while (jour <= hier) {
    const avant = budget.reste;
    const brut = await lireJour(tour, jour, budget, retard0);
    rapport.requetes += avant - budget.reste;
    if (!brut) {
      rapport.retard = retardJours(rapport.jusquau ?? suivi.dernier_jour_traite, maintenant);
      return { ...rapport, statut: rapport.jours ? 'partiel' : 'quota' };
    }

    // Simples seulement (les doubles ont « / » dans le nom), forfaits écartés.
    const matchs = brut
      .filter((m) => m.player1?.id && m.player2?.id && m.match_winner && m.result_type !== 'walkover')
      .filter((m) => !`${m.player1!.name}${m.player2!.name}`.includes('/'))
      .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')) || (a.roundId ?? 0) - (b.roundId ?? 0));

    // Lignes concernées : par identifiant API, sinon par nom normalisé (rattachement).
    const ids = [...new Set(matchs.flatMap((m) => [String(m.player1!.id), String(m.player2!.id)]))];
    const parId = new Map<string, Ligne>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data, error: e } = await sb.from('tn_elo_maison').select('*').eq('tour', tour).in('matchstat_id', ids.slice(i, i + 300));
      if (e) throw new Error(`tn_elo_maison : ${e.message}`);
      for (const l of (data ?? []) as Ligne[]) parId.set(l.matchstat_id!, l);
    }
    const inconnus = matchs.flatMap((m) => [m.player1!, m.player2!]).filter((p) => !parId.has(String(p.id)));
    const noms = [...new Set(inconnus.map((p) => normaliserNom(p.name)))];
    const parNom = new Map<string, Ligne[]>();
    for (let i = 0; i < noms.length; i += 300) {
      const { data, error: e } = await sb.from('tn_elo_maison').select('*').eq('tour', tour).is('matchstat_id', null).in('ta_name_normalized', noms.slice(i, i + 300));
      if (e) throw new Error(`tn_elo_maison : ${e.message}`);
      for (const l of (data ?? []) as Ligne[]) (parNom.get(l.ta_name_normalized) ?? parNom.set(l.ta_name_normalized, []).get(l.ta_name_normalized)!).push(l);
    }

    const modifiees = new Map<string, Ligne>();
    const notes = new Map<string, NoteElo>();
    const ligneDe = (p: { id: number; name: string; countryAcr?: string }): Ligne => {
      const id = String(p.id);
      let l = parId.get(id);
      if (!l) {
        // Rattachement par nom : même nom normalisé, pays compatible, un seul candidat.
        const pays = p.countryAcr && p.countryAcr !== 'N/A' ? p.countryAcr : null;
        const cands = (parNom.get(normaliserNom(p.name)) ?? []).filter((c) => !pays || !c.country || c.country === pays);
        if (cands.length === 1 && !cands[0].matchstat_id) {
          l = { ...cands[0], matchstat_id: id };
          // Un seul joueur de l'API par ligne : la ligne n'est plus candidate pour un homonyme.
          parNom.set(normaliserNom(p.name), (parNom.get(normaliserNom(p.name)) ?? []).filter((c) => c !== cands[0]));
        } else {
          const n = nouvelleNote(1500, jourNum(jour));
          l = {
            ta_slug: `${tour.toUpperCase()}:m${id}`, tour, ta_name: p.name, ta_name_normalized: normaliserNom(p.name), country: pays,
            matchstat_id: id, note_generale: n.general, note_dur: n.surface[0], note_terre: n.surface[1], note_gazon: n.surface[2],
            note_moquette: n.surface[3], n: 0, n_dur: 0, n_terre: 0, n_gazon: 0, n_moquette: 0, dernier_jour: jourNum(jour),
          };
          rapport.nouveaux++;
        }
        parId.set(id, l);
      }
      if (!notes.has(l.ta_slug)) notes.set(l.ta_slug, versNote(l));
      modifiees.set(l.ta_slug, l);
      return l;
    };

    let duJour = 0;
    for (const m of matchs) {
      const g = m.match_winner === m.player1!.id ? m.player1! : m.player2!;
      const p = g === m.player1 ? m.player2! : m.player1!;
      const sc = lireScoreTexte(String(m.result ?? ''));
      if (sc.forfait) continue;
      const lg = ligneDe(g);
      const lp = ligneDe(p);
      const niveau = niveauApi(m.tournament?.rankId, m.roundId, m.tournament?.name ?? '');
      const match: MatchElo = {
        jour: jourNum(jour) + 0.5, niveau, surface: surfaceApi(m.tournament?.courtId),
        bestOf: tour === 'atp' && niveau === 'G' ? 5 : 3, gagnant: lg.ta_slug, perdant: lp.ta_slug,
        jeuxG: sc.jeuxG, jeuxP: sc.jeuxP, abandon: m.result_type === 'retired' || sc.abandon,
      };
      majMatch(notes.get(lg.ta_slug)!, notes.get(lp.ta_slug)!, match, PARAMS_PRODUCTION);
      duJour++;
    }
    rapport.matchs += duJour;

    const lignes = [...modifiees.values()].map((l) => {
      const n = notes.get(l.ta_slug)!;
      return {
        ...l, ...colonnesApp(n), note_generale: n.general, note_dur: n.surface[0], note_terre: n.surface[1], note_gazon: n.surface[2],
        note_moquette: n.surface[3], n: n.n, n_dur: n.nSurface[0], n_terre: n.nSurface[1], n_gazon: n.nSurface[2], n_moquette: n.nSurface[3],
        dernier_jour: Math.floor(n.dernierJour), updated_at: jour,
      };
    });
    for (let i = 0; i < lignes.length; i += 500) {
      const { error: e } = await sb.from('tn_elo_maison').upsert(lignes.slice(i, i + 500), { onConflict: 'ta_slug' });
      if (e) throw new Error(`tn_elo_maison : ${e.message}`);
    }
    total += duJour;
    const { error: eS } = await sb
      .from('tn_elo_maison_suivi')
      .update({ dernier_jour_traite: jour, matchs_traites: total, mis_a_jour: new Date().toISOString() })
      .eq('tour', tour);
    if (eS) throw new Error(`Suivi Elo maison : ${eS.message}`);
    rapport.jours++;
    rapport.jusquau = jour;
    rapport.statut = 'mis_a_jour';
    jour = jourIso(new Date(Date.parse(`${jour}T00:00:00Z`) + JOUR_MS));
  }
  rapport.retard = retardJours(rapport.jusquau ?? suivi.dernier_jour_traite, maintenant);
  return rapport;
}

/**
 * Passage quotidien : ATP puis WTA, `budget` requêtes au plus (quota partagé avec les
 * tableaux). Sans RAPIDAPI_KEY ou sans amorçage, ne fait rien.
 */
export async function mettreAJourEloMaison(budgetMax = 6, maintenant = new Date()): Promise<RapportEloMaison[]> {
  if (!cleApi()) return [];
  const budget: Budget = { reste: budgetMax };
  const out: RapportEloMaison[] = [];
  for (const tour of ['atp', 'wta'] as const) out.push(await mettreAJourCircuit(tour, budget, maintenant));
  return out;
}

/**
 * Retard du suivi (en jours, le pire des deux circuits), SANS requete a l'API : sert au passage
 * a decider si l'Elo doit passer AVANT les tableaux (lib/eloMaisonSuivi.ts). 0 si la table
 * n'est pas amorcee.
 */
export async function retardEloMaison(maintenant = new Date()): Promise<number> {
  const { data, error } = await supabaseAdmin().from('tn_elo_maison_suivi').select('tour, dernier_jour_traite');
  if (error || !data) return 0;
  return Math.max(0, ...data.map((s) => retardJours(s.dernier_jour_traite as string, maintenant)));
}