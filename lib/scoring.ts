/**
 * MOTEUR DE SCORING — JEU DES PICKS TENNIS
 *
 * Barème :
 *   - Match gagné ............ 5 pts (tous rounds confondus)
 *   - Net sets ............... (gagnés − perdus) × 3, plancher 0
 *   - Net games .............. somme sur les SETS GAGNÉS UNIQUEMENT
 *                              de (jeux gagnés − jeux perdus)
 *                              un set perdu rapporte 0
 *   - Walkover ............... 5 pts + 3/set incomplet + 2/set incomplet
 *
 * Le perdant conserve ses points. Chaque poste a un plancher à 0.
 * Le tie-break compte pour un seul jeu de net (7-6 → +1).
 *
 * Validé sur 7 cas de référence (voir scoring.test.ts).
 */

import type { Match, MatchStatus, ScoreBreakdown, SetScore } from './types';

export const POINTS_VICTOIRE = 5;
export const POINTS_PAR_NET_SET = 3;
export const WO_POINTS_SET = 3;
export const WO_POINTS_GAMES = 2;

/** Statuts qui ne rapportent aucun point. */
const STATUTS_SANS_POINTS: MatchStatus[] = ['bye', 'scheduled', 'live'];

/** Une paire de jeux (pour le joueur, contre le joueur) sur un set joué. */
export interface SetPair {
  for: number;
  against: number;
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

  const setsToWin = Math.floor(bestOf / 2) + 1;

  let setsWon = 0;
  let setsLost = 0;
  let netGames = 0;

  for (const s of sets) {
    if (s.for > s.against) {
      setsWon += 1;
      // Seuls les sets gagnés rapportent du net games
      netGames += s.for - s.against;
    } else {
      setsLost += 1;
    }
  }

  const match = won ? POINTS_VICTOIRE : 0;
  let netSetsPts = Math.max(0, setsWon - setsLost) * POINTS_PAR_NET_SET;
  let netGamesPts = Math.max(0, netGames);

  // Walkover / abandon : les sets non joués sont crédités au vainqueur
  if ((status === 'walkover' || status === 'retired') && won) {
    const incomplets = Math.max(0, setsToWin - setsWon);
    netSetsPts += incomplets * WO_POINTS_SET;
    netGamesPts += incomplets * WO_POINTS_GAMES;
  }

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
