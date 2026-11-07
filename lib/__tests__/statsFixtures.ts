/** Petites fabriques de lignes pour les tests de lib/stats/*. */
import type {
  BracketPickStat,
  EloDe,
  JoueurStat,
  MatchStat,
  PickStat,
  TournoiStat,
} from '../stats/commun';

export const tournoi = (id: string, over: Partial<TournoiStat> = {}): TournoiStat => ({
  id,
  name: id,
  tour: 'ATP',
  category: null,
  surface: 'dur',
  status: 'completed',
  start_date: '2026-01-01',
  best_of: 3,
  rounds: null,
  ...over,
});

export const match = (over: Partial<MatchStat> = {}): MatchStat => ({
  tournament_id: 'T1',
  round: 'R16',
  position: 0,
  player1_id: 'A',
  player2_id: 'B',
  winner_id: 'A',
  sets: [
    { g1: 6, g2: 3 },
    { g1: 6, g2: 4 },
  ],
  status: 'completed',
  ...over,
});

export const pick = (over: Partial<PickStat> = {}): PickStat => ({
  tournament_id: 'T1',
  participant_id: null,
  round: 'R16',
  half: null,
  player_id: 'A',
  points: 10,
  points_match: 5,
  points_sets: 3,
  points_games: 2,
  e_points: null,
  ...over,
});

export const bracketPick = (over: Partial<BracketPickStat> = {}): BracketPickStat => ({
  tournament_id: 'T1',
  participant_id: null,
  round: 'R16',
  position: 0,
  player_id: 'A',
  ...over,
});

export const joueur = (id: string, over: Partial<JoueurStat> = {}): JoueurStat => ({
  id,
  name: `Joueur ${id}`,
  country: null,
  tour: 'ATP',
  rank: null,
  ...over,
});

/** Elo fixe par joueur, quelle que soit la surface ; null pour un joueur absent de la table. */
export const eloFixe =
  (table: Record<string, number>): EloDe =>
  (id) =>
    table[id] ?? null;
