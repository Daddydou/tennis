/**
 * Types partagés du moteur de picks tennis.
 */

export type Tour = 'ATP' | 'WTA';
export type Surface = 'hard' | 'clay' | 'grass' | 'carpet';
export type Half = 'top' | 'bottom';

/**
 * Statut d'un match tel qu'il arrive du bookmarklet.
 *
 * `live` et `in_progress` désignent la même chose — un match en train de se
 * jouer — mais les deux circulent : `in_progress` est ce que produit le
 * bookmarklet sur un tableau en direct, `live` ce que portent les extractions
 * plus anciennes. On accepte les deux plutôt que d'en renommer un à l'import :
 * la valeur stockée reste celle de la source.
 */
export type MatchStatus =
  | 'scheduled'
  | 'live'
  | 'in_progress'
  | 'completed'
  | 'walkover'
  | 'retired'
  | 'bye';

/**
 * Match en train de se jouer. Deux valeurs pour une seule réalité (cf.
 * MatchStatus) : la distinction avec `scheduled` ne sert qu'à l'affichage —
 * pour le scoring et les calculs, seul compte STATUTS_INDECIS.
 */
export const STATUTS_EN_COURS: readonly MatchStatus[] = ['live', 'in_progress'];

/** Ce match est-il en train de se jouer ? */
export function estEnCours(status: MatchStatus | null | undefined): boolean {
  return status !== null && status !== undefined && STATUTS_EN_COURS.includes(status);
}

/**
 * Statuts d'un match SANS issue connue — LISTE DE RÉFÉRENCE.
 *
 * Un match indécis ne rapporte aucun point, n'a pas de vainqueur et n'entre
 * dans aucun score réel (picks comme fantasy). Le tournoi qui en contient un
 * n'est pas terminé.
 *
 * Cette liste était recopiée dans huit modules ; l'apparition d'`in_progress`
 * les aurait tous fait mentir un par un. Elle est désormais ici, et nulle part
 * ailleurs — la faire évoluer est un changement d'une ligne.
 */
export const STATUTS_INDECIS: readonly MatchStatus[] = [
  'scheduled',
  ...STATUTS_EN_COURS,
];

/** Statuts d'un match dont l'issue est connue — complément de STATUTS_INDECIS. */
export const STATUTS_DECIDES: readonly MatchStatus[] = [
  'completed',
  'walkover',
  'retired',
  'bye',
];

/**
 * Ce match reste-t-il à jouer ?
 *
 * Un statut absent (match introuvable en base) compte comme indécis : c'est
 * l'absence de résultat, jamais un résultat acquis.
 */
export function estIndecis(status: MatchStatus | null | undefined): boolean {
  return status === null || status === undefined || STATUTS_INDECIS.includes(status);
}

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
