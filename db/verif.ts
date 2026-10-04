import 'server-only';
import { supabaseAnon } from './anon';
import { loadEngineData } from './queries';
import {
  contexteFantasy,
  equipeEvalueeFigee,
  fantasyEnCache,
  lireEquipeStockee,
  type EquipeEvaluee,
  type EquipeStockee,
  type Fantasy,
} from './fantasy';

/**
 * CONTRÔLES DE PRODUCTION — servis par GET /api/verif/[controle].
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ LECTURE SEULE, LISTE FIXE. Ce module n'importe que `supabaseAnon()` (que │
 * │ la RLS limite à `select`) et des lectures déjà en lecture seule : jamais │
 * │ `supabaseAdmin()`, jamais `getFantasy`/`getProjections` (qui recalculent │
 * │ et écrivent sur cache froid). Pas de requête générique : chaque contrôle │
 * │ est une fonction nommée qui renvoie un résumé, jamais de ligne brute.    │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

export type ResultatControle = { statut: number; corps: Record<string, unknown> };
export type Controle = (params: URLSearchParams) => Promise<ResultatControle>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* -------------------------------------------------------------------------- */
/*  fantasy-equipe                                                            */
/* -------------------------------------------------------------------------- */

export interface EcartEquipe {
  palier: number;
  stocke: string | null;
  affiche: string | null;
}

/**
 * Compare l'équipe stockée dans `tn_fantasy_historique` à celle qu'affiche
 * l'écran Fantasy (`equipeEvalueeFigee`). Pure, sans base.
 *
 * « Identique » = même joueur à chaque palier, mêmes espérances par membre et
 * même `e_predit`. Les points réels ne comptent pas : ils avancent légitimement
 * à chaque import.
 */
export function comparerEquipes(
  stockee: EquipeStockee,
  affichee: EquipeEvaluee,
): { identique: boolean; ecarts: EcartEquipe[]; ePreditStocke: number | null; ePreditAffiche: number } {
  const proche = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  const paliers = new Set([
    ...stockee.equipe.map((s) => s.palier),
    ...affichee.membres.map((m) => m.palier.numero),
  ]);

  const ecarts: EcartEquipe[] = [];
  for (const palier of [...paliers].sort((a, b) => a - b)) {
    const s = stockee.equipe.find((x) => x.palier === palier);
    const a = affichee.membres.find((x) => x.palier.numero === palier);
    const memeJoueur = (s?.playerId ?? null) === (a?.playerId ?? null);
    const memeEsperance = !!s && !!a && proche(s.ePoints, a.eTotal);
    if (!s || !a || !memeJoueur || !memeEsperance) {
      ecarts.push({ palier, stocke: s?.playerId ?? null, affiche: a?.playerId ?? null });
    }
  }

  const memePredit = stockee.ePredit === null || proche(stockee.ePredit, affichee.eTotal);
  return {
    identique: ecarts.length === 0 && memePredit,
    ecarts,
    ePreditStocke: stockee.ePredit,
    ePreditAffiche: affichee.eTotal,
  };
}

const fantasyEquipe: Controle = async (params) => {
  const tournoiId = params.get('tournoi') ?? '';
  if (!UUID.test(tournoiId)) {
    return { statut: 400, corps: { ok: false, error: 'Paramètre « tournoi » (uuid) requis.' } };
  }

  const engine = await loadEngineData(tournoiId);
  if (!engine) return { statut: 404, corps: { ok: false, error: 'Tournoi introuvable.' } };
  const { tournament } = engine;

  const stockee = await lireEquipeStockee(tournament.id);
  // Même repli que l'écran Fantasy sur cache froid, SANS en relancer le calcul.
  const depuisCache = await fantasyEnCache(engine);
  const fantasy: Fantasy =
    depuisCache ??
    { ...contexteFantasy(tournament), tirage: (tournament.rounds ?? [])[0] ?? '', joueurs: {} };
  const affichee = await equipeEvalueeFigee(engine, fantasy);

  const base = {
    ok: true,
    controle: 'fantasy-equipe',
    tournoi: { id: tournament.id, nom: tournament.name, circuit: tournament.tour, annee: tournament.year },
    cache_fantasy: depuisCache ? 'present' : 'absent',
  };
  if (!stockee) {
    return { statut: 200, corps: { ...base, equipe_stockee: false, identique: null } };
  }

  const c = comparerEquipes(stockee, affichee);
  return {
    statut: 200,
    corps: {
      ...base,
      equipe_stockee: true,
      identique: c.identique,
      paliers: stockee.equipe.length,
      e_predit: { stocke: c.ePreditStocke, affiche: c.ePreditAffiche },
      ecarts: c.ecarts,
    },
  };
};

/* -------------------------------------------------------------------------- */
/*  sante                                                                     */
/* -------------------------------------------------------------------------- */

/** Date la plus récente d'une colonne pour un tournoi, `null` si aucune ligne. */
async function derniere(
  table: 'tn_matches' | 'tn_projections' | 'tn_fantasy' | 'tn_fantasy_historique',
  colonne: 'updated_at' | 'computed_at',
  tournoiId: string,
): Promise<string | null> {
  const { data, error } = await supabaseAnon()
    .from(table)
    .select(colonne)
    .eq('tournament_id', tournoiId)
    .not(colonne, 'is', null)
    .order(colonne, { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const ligne = (data?.[0] ?? null) as Record<string, string | null> | null;
  return ligne?.[colonne] ?? null;
}

/**
 * Dernières dates de calcul des tournois en cours. Aucune donnée personnelle :
 * ni participant, ni pick, ni score de jeu — seulement des horodatages.
 */
const sante: Controle = async () => {
  const { data, error } = await supabaseAnon()
    .from('tn_tournaments')
    .select('id, name, tour, year')
    .eq('status', 'running')
    .order('start_date', { ascending: true });
  if (error) throw new Error(error.message);

  const tournois = await Promise.all(
    (data ?? []).map(async (t) => {
      const [matchs, projections, fantasy, historique] = await Promise.all([
        derniere('tn_matches', 'updated_at', t.id),
        derniere('tn_projections', 'computed_at', t.id),
        derniere('tn_fantasy', 'computed_at', t.id),
        derniere('tn_fantasy_historique', 'computed_at', t.id),
      ]);
      return {
        id: t.id as string,
        nom: t.name as string,
        circuit: t.tour as string,
        annee: t.year as number,
        derniers_calculs: { matchs, projections, fantasy, historique },
      };
    }),
  );

  return {
    statut: 200,
    corps: { ok: true, controle: 'sante', genere_le: new Date().toISOString(), tournois },
  };
};

/* -------------------------------------------------------------------------- */
/*  Liste fixe                                                                */
/* -------------------------------------------------------------------------- */

const CONTROLES: Readonly<Record<string, Controle>> = Object.freeze({
  'fantasy-equipe': fantasyEquipe,
  sante,
});

/**
 * Contrôle nommé, ou `null`. `Object.hasOwn` : un nom comme `constructor` ou
 * `__proto__` ne doit jamais résoudre vers une propriété héritée.
 */
export function trouverControle(nom: string): Controle | null {
  return Object.hasOwn(CONTROLES, nom) ? CONTROLES[nom] : null;
}

export const NOMS_CONTROLES = Object.keys(CONTROLES);
