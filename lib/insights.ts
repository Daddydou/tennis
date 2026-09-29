/* -------------------------------------------------------------------------- */
/*  Insights joueurs (tn_player_insights) — logique PURE, sans Supabase.       */
/*                                                                            */
/*  AFFICHAGE UNIQUEMENT : rien dans le moteur (projections, picks, fantasy)   */
/*  ne lit ces données. Un flag ne masque ni ne désactive jamais un joueur.   */
/*  La lecture en base est dans db/insights.ts (getInsights).                 */
/* -------------------------------------------------------------------------- */

export type ConfianceInsight = 'high' | 'medium' | 'low';

export interface FaitInsight {
  type: string;
  text: string;
  date: string | null;
  confidence: ConfianceInsight | null;
  /** URL de la source — n'est rendue en lien que si http(s), cf. urlSure. */
  source: string | null;
}

export interface PlayerInsight {
  id: string;
  tournamentId: string;
  playerId: string;
  withdrawn: boolean;
  injuryRisk: boolean;
  heavyLoad: boolean;
  surfaceSwitch: boolean;
  homeTournament: boolean;
  summary: string | null;
  facts: FaitInsight[];
  confidence: ConfianceInsight;
  /** Date de l'information (AAAA-MM-JJ). */
  asOf: string;
  createdAt: string;
}

/** Ligne brute telle que renvoyée par Supabase. */
export interface PlayerInsightRow {
  id: string;
  tournament_id: string;
  player_id: string;
  withdrawn: boolean;
  injury_risk: boolean;
  heavy_load: boolean;
  surface_switch: boolean;
  home_tournament: boolean;
  summary: string | null;
  facts: unknown;
  confidence: string;
  as_of: string;
  created_at: string;
}

const confiance = (v: unknown): ConfianceInsight | null =>
  v === 'high' || v === 'medium' || v === 'low' ? v : null;

const texte = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v : null;

/**
 * `facts` est un jsonb écrit par un outil externe : on ne lui fait pas
 * confiance. Tout élément sans texte est ignoré plutôt que de planter l'écran.
 */
function normaliserFaits(brut: unknown): FaitInsight[] {
  if (!Array.isArray(brut)) return [];
  const faits: FaitInsight[] = [];
  for (const f of brut) {
    if (!f || typeof f !== 'object') continue;
    const o = f as Record<string, unknown>;
    const t = texte(o.text);
    if (!t) continue;
    faits.push({
      type: texte(o.type) ?? 'info',
      text: t,
      date: texte(o.date),
      confidence: confiance(o.confidence),
      source: texte(o.source),
    });
  }
  return faits;
}

export function versInsight(r: PlayerInsightRow): PlayerInsight {
  return {
    id: r.id,
    tournamentId: r.tournament_id,
    playerId: r.player_id,
    withdrawn: r.withdrawn === true,
    injuryRisk: r.injury_risk === true,
    heavyLoad: r.heavy_load === true,
    surfaceSwitch: r.surface_switch === true,
    homeTournament: r.home_tournament === true,
    summary: texte(r.summary),
    facts: normaliserFaits(r.facts),
    confidence: confiance(r.confidence) ?? 'medium',
    asOf: r.as_of,
    createdAt: r.created_at,
  };
}

/**
 * Ne garde que l'insight le plus récent de chaque joueur : `as_of` le plus
 * grand, puis `created_at` pour départager (l'ordre d'entrée n'est pas
 * supposé trié).
 */
export function plusRecentParJoueur(
  insights: PlayerInsight[],
): Map<string, PlayerInsight> {
  const parJoueur = new Map<string, PlayerInsight>();
  for (const i of insights) {
    const actuel = parJoueur.get(i.playerId);
    if (
      !actuel ||
      i.asOf > actuel.asOf ||
      (i.asOf === actuel.asOf && i.createdAt > actuel.createdAt)
    ) {
      parJoueur.set(i.playerId, i);
    }
  }
  return parJoueur;
}

export type NiveauBadge = 'forfait' | 'blessure' | 'charge';

/**
 * UN SEUL badge par joueur, par priorité : forfait > blessure > charge.
 * `null` si aucun de ces trois flags (surface_switch et home_tournament ne
 * donnent pas de badge : ils restent visibles dans le détail).
 */
export function niveauBadge(
  i: Pick<PlayerInsight, 'withdrawn' | 'injuryRisk' | 'heavyLoad'> | null | undefined,
): NiveauBadge | null {
  if (!i) return null;
  if (i.withdrawn) return 'forfait';
  if (i.injuryRisk) return 'blessure';
  if (i.heavyLoad) return 'charge';
  return null;
}

/**
 * Seules les URL http(s) deviennent des liens : `source` vient d'une table
 * écrite par un outil externe, un `javascript:` y serait exécuté au clic.
 */
export function urlSure(source: string | null): string | null {
  if (!source) return null;
  try {
    const u = new URL(source);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}
