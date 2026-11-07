/**
 * STATISTIQUES — socle commun des calculs.
 *
 * Module PUR (ni Next ni Supabase) : il décrit les lignes dont les statistiques ont
 * besoin sous forme structurelle minimale, pour que les lignes de la base (db/types.ts)
 * s'y glissent telles quelles, et fournit les petits outils partagés (moyenne, index des
 * matchs, résultat d'un pick...). Rien ici ne réimplémente le barème : les points viennent
 * toujours des colonnes déjà calculées (tn_picks) ou de pointsStock.ts.
 */

import { pVictoire } from '../elo';
import { STATUTS_DECIDES } from '../types';
import type { MatchStatus } from '../types';

/* -------------------------------------------------------------------------- */
/*  Lignes d'entrée (formes minimales)                                         */
/* -------------------------------------------------------------------------- */

/** Moi (id null) ou un participant du groupe. */
export interface StockStat {
  id: string | null;
  nom: string;
}

export interface TournoiStat {
  id: string;
  name: string;
  tour: 'ATP' | 'WTA';
  category: string | null;
  surface: string | null;
  status: string;
  start_date: string | null;
  best_of: number | null;
  rounds: string[] | null;
}

export interface SetStat {
  g1: number | null;
  g2: number | null;
  tb1?: number | null;
  tb2?: number | null;
}

export interface MatchStat {
  tournament_id: string;
  round: string;
  position: number | null;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  sets: SetStat[] | null;
  status: MatchStatus;
}

export interface PickStat {
  tournament_id: string;
  participant_id: string | null;
  round: string;
  half: string | null;
  player_id: string;
  points: number | null;
  points_match: number | null;
  points_sets: number | null;
  points_games: number | null;
  e_points: number | null;
}

export interface BracketPickStat {
  tournament_id: string;
  participant_id: string | null;
  round: string;
  position: number;
  player_id: string;
}

export interface JoueurStat {
  id: string;
  name: string;
  country: string | null;
  tour: 'ATP' | 'WTA';
  rank: number | null;
}

/** Points d'un stock sur un tournoi (mêmes chiffres que le Dashboard : pointsStock.ts). */
export interface PointsTournoiStat {
  tournoiId: string;
  stockId: string | null;
  picks: number;
  /** null : aucun pronostic de bracket sur ce tournoi. */
  bracket: number | null;
}

/** Une capture de cote (tn_odds_historique). */
export interface CoteHistStat {
  tournament_id: string;
  event_id: string;
  player_a_id: string | null;
  player_b_id: string | null;
  proba_a: number | null;
  proba_b: number | null;
  capture_le: string;
}

/**
 * Elo effectif d'un joueur sur une surface, ou null quand il est inconnu (valeur « par
 * défaut » : un remplissage identique pour tous n'est pas un Elo, cf. db/calibration.ts).
 */
export type EloDe = (joueurId: string, surface: string | null) => number | null;

/* -------------------------------------------------------------------------- */
/*  Petits outils                                                              */
/* -------------------------------------------------------------------------- */

export function cleStock(id: string | null): string {
  return id ?? 'moi';
}

export function somme(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0);
}

export function moyenne(xs: number[]): number | null {
  return xs.length === 0 ? null : somme(xs) / xs.length;
}

/** Écart-type de la population (null sous 2 valeurs : un seul point ne dit rien). */
export function ecartType(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = somme(xs) / xs.length;
  return Math.sqrt(somme(xs.map((x) => (x - m) ** 2)) / xs.length);
}

/** Part en [0, 1], ou null quand il n'y a rien à diviser. */
export function part(n: number, total: number): number | null {
  return total === 0 ? null : n / total;
}

/** Corrélation de Pearson, ou null (moins de 3 points, ou une série constante). */
export function correlation(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = somme(xs.slice(0, n)) / n;
  const my = somme(ys.slice(0, n)) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/* -------------------------------------------------------------------------- */
/*  Tours                                                                      */
/* -------------------------------------------------------------------------- */

/** Ordre chronologique des tours, du plus précoce à la finale. */
export const ORDRE_TOURS = [
  '1ST_ROUND_QUALIFYING',
  '2ND_ROUND_QUALIFYING',
  'J1',
  'J2',
  'J3',
  'R128',
  'R64',
  'R32',
  'R16',
  'QF',
  'SF',
  'F',
];

export function rangTour(round: string): number {
  return ORDRE_TOURS.indexOf(round);
}

export function comparerTours(a: string, b: string): number {
  return rangTour(a) - rangTour(b) || a.localeCompare(b);
}

/** « Où est sorti le joueur », en distance à la finale (pour comparer des tableaux de tailles différentes). */
export function etapeDepuisFinale(round: string): string {
  if (round === 'F') return 'Finale';
  if (round === 'SF') return 'Demi-finale';
  if (round === 'QF') return 'Quart';
  if (round === 'R16') return 'Huitième';
  return 'Avant les huitièmes';
}

/* -------------------------------------------------------------------------- */
/*  Matchs                                                                     */
/* -------------------------------------------------------------------------- */

/** Issue connue ET jouée sur le court (ou abandon) : celle qui a un vainqueur et un perdant. */
export function matchDecide(m: MatchStat): boolean {
  return (
    m.winner_id !== null &&
    m.player1_id !== null &&
    m.player2_id !== null &&
    STATUTS_DECIDES.includes(m.status) &&
    m.status !== 'bye'
  );
}

/** Match réellement disputé : terminé ou abandonné en cours de match, avec ses sets. */
export function matchJoue(m: MatchStat): boolean {
  return (
    (m.status === 'completed' || m.status === 'retired') &&
    matchDecide(m) &&
    m.sets !== null &&
    m.sets.length > 0
  );
}

export function perdantDe(m: MatchStat): string | null {
  if (!matchDecide(m)) return null;
  return m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
}

export function adversaireDe(m: MatchStat, joueurId: string): string | null {
  if (m.player1_id === joueurId) return m.player2_id;
  if (m.player2_id === joueurId) return m.player1_id;
  return null;
}

/** Index « tournoi | tour | joueur » -> son match (un joueur joue un match par tour). */
export function indexMatchsParJoueur(matchs: MatchStat[]): Map<string, MatchStat> {
  const out = new Map<string, MatchStat>();
  for (const m of matchs) {
    if (m.player1_id) out.set(`${m.tournament_id}|${m.round}|${m.player1_id}`, m);
    if (m.player2_id) out.set(`${m.tournament_id}|${m.round}|${m.player2_id}`, m);
  }
  return out;
}

/** Index « tournoi | tour | position » -> match (la case du tableau). */
export function indexMatchsParCase(matchs: MatchStat[]): Map<string, MatchStat> {
  const out = new Map<string, MatchStat>();
  for (const m of matchs) {
    if (m.position === null) continue;
    out.set(`${m.tournament_id}|${m.round}|${m.position}`, m);
  }
  return out;
}

/** Jeux gagnés par chaque côté, tous sets confondus. */
export function jeuxDuMatch(m: MatchStat): { j1: number; j2: number } {
  let j1 = 0;
  let j2 = 0;
  for (const s of m.sets ?? []) {
    j1 += s.g1 ?? 0;
    j2 += s.g2 ?? 0;
  }
  return { j1, j2 };
}

/** Probabilité de victoire (courbe du moteur) de `joueur` contre `adversaire`, ou null si un Elo manque. */
export function probaElo(
  joueur: string,
  adversaire: string,
  surface: string | null,
  eloDe: EloDe,
): number | null {
  const a = eloDe(joueur, surface);
  const b = eloDe(adversaire, surface);
  if (a === null || b === null) return null;
  return pVictoire(a, b);
}

/* -------------------------------------------------------------------------- */
/*  Cotes                                                                      */
/* -------------------------------------------------------------------------- */

export interface DuelCotes {
  tournoiId: string;
  joueurA: string;
  joueurB: string;
  nbCaptures: number;
  /** Probabilité de A au premier et au dernier relevé. */
  premier: { pA: number; le: string };
  dernier: { pA: number; le: string };
}

export function cleDuelCotes(tournoiId: string, x: string, y: string): string {
  return x < y ? `${tournoiId}|${x}|${y}` : `${tournoiId}|${y}|${x}`;
}

/** Le premier et le dernier relevé de chaque duel (clé « tournoi | A | B », ids triés). */
export function indexerCotesParDuel(lignes: CoteHistStat[]): Map<string, DuelCotes> {
  const groupes = new Map<string, CoteHistStat[]>();
  for (const l of lignes) {
    if (!l.player_a_id || !l.player_b_id || l.proba_a === null) continue;
    const cle = cleDuelCotes(l.tournament_id, l.player_a_id, l.player_b_id);
    const g = groupes.get(cle) ?? [];
    g.push(l);
    groupes.set(cle, g);
  }
  const out = new Map<string, DuelCotes>();
  for (const [cle, g] of groupes) {
    g.sort((x, y) => x.capture_le.localeCompare(y.capture_le));
    const a = g[0].player_a_id!;
    const b = g[0].player_b_id!;
    // On ramène toujours la probabilité au joueur « A » du premier relevé.
    const pourA = (l: CoteHistStat) => (l.player_a_id === a ? l.proba_a! : 1 - l.proba_a!);
    out.set(cle, {
      tournoiId: g[0].tournament_id,
      joueurA: a,
      joueurB: b,
      nbCaptures: g.length,
      premier: { pA: pourA(g[0]), le: g[0].capture_le },
      dernier: { pA: pourA(g[g.length - 1]), le: g[g.length - 1].capture_le },
    });
  }
  return out;
}

/** Probabilité du marché (dernier relevé) pour `joueur` contre `adversaire`, ou null. */
export function probaMarche(
  index: Map<string, DuelCotes>,
  tournoiId: string,
  joueur: string,
  adversaire: string,
): number | null {
  const d = index.get(cleDuelCotes(tournoiId, joueur, adversaire));
  if (!d) return null;
  return d.joueurA === joueur ? d.dernier.pA : 1 - d.dernier.pA;
}
