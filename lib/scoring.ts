/**
 * MOTEUR DE SCORING — JEU DES PICKS TENNIS
 *
 * Barème :
 *   - Match gagné ............ 5 pts (tous rounds confondus)
 *   - Net sets ............... (gagnés − perdus) × 3, plancher 0
 *   - Net games .............. somme sur les SETS GAGNÉS UNIQUEMENT
 *                              de (jeux gagnés − jeux perdus)
 *                              un set perdu rapporte 0
 *   - Walkover (w/o) ......... le match n'a pas eu lieu : +5 pts de base
 *                              uniquement pour le vainqueur. Aucun bonus
 *                              de set ni de dominance.
 *   - Abandon (ret.) ......... seuls les sets entièrement joués avant
 *                              l'abandon sont comptés ; mêmes règles pour
 *                              le vainqueur et le perdant sur ces sets.
 *                              Aucun crédit pour les sets non joués, ni pour
 *                              le set interrompu en cours de route.
 *
 * Le perdant conserve ses points. Chaque poste a un plancher à 0.
 * Le tie-break compte pour un seul jeu de net (7-6 → +1).
 *
 * Validé sur 7 cas de référence (voir scoring.test.ts).
 */

import { STATUTS_INDECIS } from './types';
import type { Match, MatchStatus, ScoreBreakdown, SetScore } from './types';

export const POINTS_VICTOIRE = 5;
export const POINTS_PAR_NET_SET = 3;

/**
 * Statuts qui ne rapportent aucun point : le bye, et tout match sans issue
 * connue — un match en cours (`live`, `in_progress`) est à cet égard un match
 * pas encore joué, ses sets partiels ne valent rien tant qu'il n'est pas fini.
 */
const STATUTS_SANS_POINTS: MatchStatus[] = [...STATUTS_INDECIS, 'bye'];

/** Une paire de jeux (pour le joueur, contre le joueur) sur un set joué. */
export interface SetPair {
  for: number;
  against: number;
}

/**
 * Un set est-il allé à son terme (6 jeux avec deux d'écart, 7-5, ou 7-6 au
 * jeu décisif) ? Sert à écarter, sur un abandon, le set interrompu en cours
 * de route : `setsPourJoueur` ne filtre que les sets NON JOUÉS (`games` nul),
 * pas ceux entamés puis coupés net par l'abandon (ex. 2-1, ou 0-0 quand
 * l'abandon tombe dès l'entame du set).
 */
function setTermine(a: number, b: number): boolean {
  const haut = Math.max(a, b);
  const bas = Math.min(a, b);
  if (haut < 6) return false;
  return haut - bas >= 2 || (haut === 7 && bas === 6);
}

/**
 * Calcule le score d'un joueur sur un match.
 *
 * @param sets    Sets joués, du point de vue du joueur évalué.
 * @param won     Le joueur a-t-il gagné le match ?
 * @param status  Statut du match.
 * @param bestOf  3 ou 5. Détermine le nombre de sets à gagner.
 */
export function scoreMatch(
  sets: SetPair[],
  won: boolean,
  status: MatchStatus = 'completed',
  bestOf: 3 | 5 = 3
): ScoreBreakdown {
  if (STATUTS_SANS_POINTS.includes(status)) {
    return { match: 0, netSets: 0, netGames: 0, total: 0 };
  }

  let setsWon = 0;
  let setsLost = 0;
  let netGames = 0;

  for (const s of sets) {
    // Abandon : le set en cours au moment de l'abandon n'est pas « entièrement
    // joué » — ni gagné ni perdu, il ne compte pas (cf. règle officielle).
    if (status === 'retired' && !setTermine(s.for, s.against)) continue;
    if (s.for > s.against) {
      setsWon += 1;
      // Seuls les sets gagnés rapportent du net games
      netGames += s.for - s.against;
    } else {
      setsLost += 1;
    }
  }

  const match = won ? POINTS_VICTOIRE : 0;
  const netSetsPts = Math.max(0, setsWon - setsLost) * POINTS_PAR_NET_SET;
  const netGamesPts = Math.max(0, netGames);

  // Walkover : le match n'a pas eu lieu, `sets` est vide, netSetsPts et
  // netGamesPts valent donc déjà 0 — seul le point de match compte.
  // Abandon : le filtre ci-dessus n'a laissé passer que les sets entièrement
  // joués, donc netSetsPts/netGamesPts ne portent déjà que sur ces sets,
  // symétriquement pour le vainqueur et le perdant.

  return {
    match,
    netSets: netSetsPts,
    netGames: netGamesPts,
    total: match + netSetsPts + netGamesPts,
  };
}

/**
 * Extrait les paires de jeux d'un match, du point de vue d'un joueur donné.
 * Ignore les sets non joués.
 */
export function setsPourJoueur(match: Match, playerId: string): SetPair[] {
  const idx = match.players.findIndex((p) => p.id === playerId);
  if (idx === -1) return [];

  const moi = match.players[idx];
  const adv = match.players[1 - idx];
  const pairs: SetPair[] = [];

  for (let i = 0; i < moi.sets.length; i++) {
    const a = moi.sets[i]?.games;
    const b = adv.sets[i]?.games;
    if (a === null || a === undefined) continue;
    if (b === null || b === undefined) continue;
    pairs.push({ for: a, against: b });
  }
  return pairs;
}

/**
 * Score d'un joueur sur un match donné, directement depuis l'objet Match.
 * Retourne null si le joueur ne figure pas dans ce match.
 */
export function scorePlayerInMatch(
  match: Match,
  playerId: string,
  bestOf: 3 | 5 = 3
): ScoreBreakdown | null {
  const idx = match.players.findIndex((p) => p.id === playerId);
  if (idx === -1) return null;

  const sets = setsPourJoueur(match, playerId);
  const won = match.players[idx].winner;
  return scoreMatch(sets, won, match.status, bestOf);
}

/**
 * Points marqués par un joueur à un tour donné.
 * Retourne 0 s'il n'a pas joué ce tour.
 */
export function pointsAtRound(
  matches: Match[],
  playerId: string,
  round: string,
  bestOf: 3 | 5 = 3
): number {
  for (const m of matches) {
    if (m.round !== round) continue;
    const s = scorePlayerInMatch(m, playerId, bestOf);
    if (s) return s.total;
  }
  return 0;
}

/**
 * Score total d'un joueur sur tout un tournoi (utile pour l'analyse,
 * pas pour le jeu lui-même où chaque joueur n'est pické qu'une fois).
 */
export function scoreParcours(
  matches: Match[],
  playerId: string,
  bestOf: 3 | 5 = 3
): { round: string; score: ScoreBreakdown }[] {
  const out: { round: string; score: ScoreBreakdown }[] = [];
  for (const m of matches) {
    const s = scorePlayerInMatch(m, playerId, bestOf);
    if (s) out.push({ round: m.round, score: s });
  }
  return out;
}

/** Formate un score en chaîne lisible : "6-4 7-6". */
export function formatScore(sets: SetPair[]): string {
  return sets.map((s) => `${s.for}-${s.against}`).join(' ');
}
