/**
 * Types partagés du moteur de picks tennis.
 */

export type Tour = 'ATP' | 'WTA';
export type Surface = 'hard' | 'clay' | 'grass' | 'carpet';
export type Half = 'top' | 'bottom';

export type MatchStatus =
  | 'scheduled'
  | 'live'
  | 'completed'
  | 'walkover'
  | 'retired'
  | 'bye';

/** Un set du point de vue d'un joueur. */
export interface SetScore {
  /** Jeux gagnés. null si le set n'a pas été joué. */
  games: number | null;
  /** Score du tie-break (celui du perdant du TB). null si pas de TB. */
  tiebreak: number | null;
}

/** Un joueur dans le contexte d'un match. */
export interface MatchPlayer {
  /** ID officiel ATP/WTA (ex. 'RE44'). null pour un bye. */
  id: string | null;
  name: string;
  /** Tête de série ('1', '12') ou statut ('Q', 'WC', 'LL', 'PR', 'Alt'). */
  seed: string | null;
  country: string | null;
  isBye: boolean;
  winner: boolean;
  sets: SetScore[];
}

export interface Match {
  matchId: string | null;
  round: string;
  roundLabel: string;
  position: number;
  half: Half;
  status: MatchStatus;
  players: [MatchPlayer, MatchPlayer];
}

/** Sortie brute du bookmarklet. */
export interface DrawExtract {
  extractedAt: string;
  sourceUrl: string;
  tournament: {
    slug: string | null;
    /** ID officiel du tournoi sur son circuit (ATP ou WTA). */
    externalId: string | null;
    year: number;
  };
  tour: Tour;
  roundsFound: string[];
  matchCount: number;
  matches: Match[];
}

export interface Player {
  id: string;
  tour: Tour;
  name: string;
  country: string | null;
  rank: number | null;
  /** Numéro de tête de série sur le tournoi en cours. */
  seed: number | null;
  half: Half;
  eloOverall: number;
  eloHard: number;
  eloClay: number;
  eloGrass: number;
}

export interface Tournament {
  id: string;
  externalId: string | null;
  slug: string | null;
  name: string;
  tour: Tour;
  surface: Surface;
  drawSize: number;
  bestOf: 3 | 5;
  year: number;
  rounds: string[];
}

/** Un emplacement de pick : un tour + une moitié de tableau. */
export interface Slot {
  round: string;
  /** null pour les tours où il ne reste qu'un match par moitié (SF, F). */
  half: Half | null;
}

export interface Pick {
  round: string;
  half: Half | null;
  playerId: string;
  playerName: string;
  /** Espérance de points au moment du pick. */
  ePoints?: number;
  /** Points réellement marqués, une fois le match joué. */
  points?: number;
}

export interface ScoreBreakdown {
  match: number;
  netSets: number;
  netGames: number;
  total: number;
}
