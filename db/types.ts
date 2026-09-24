import type { Half, MatchStatus, Surface, Tour } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Types des lignes DB (tables tn_*)                                          */
/* -------------------------------------------------------------------------- */

export interface TournamentRow {
  id: string;
  external_id: string | null;
  slug: string | null;
  name: string;
  tour: Tour;
  category: string | null;
  surface: Surface | null;
  draw_size: number | null;
  best_of: number | null;
  year: number;
  start_date: string | null;
  status: 'upcoming' | 'running' | 'completed';
  rounds: string[] | null;
  created_at: string | null;
}

export interface PlayerRow {
  id: string;
  tour: Tour;
  name: string;
  full_name: string | null;
  country: string | null;
  rank: number | null;
  elo_overall: number | null;
  elo_hard: number | null;
  elo_clay: number | null;
  elo_grass: number | null;
}

export interface SetJson {
  g1: number | null;
  g2: number | null;
  tb1?: number | null;
  tb2?: number | null;
}

export interface MatchRow {
  id: string;
  tournament_id: string;
  external_id: string | null;
  round: string;
  round_order: number;
  position: number | null;
  half: Half | null;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  sets: SetJson[] | null;
  status: MatchStatus;
}

export interface PickRow {
  id: string;
  tournament_id: string;
  /** null = mon pick (comportement historique) ; sinon celui d'un participant. */
  participant_id: string | null;
  round: string;
  half: Half | null;
  player_id: string;
  points: number | null;
  points_match: number | null;
  points_sets: number | null;
  points_games: number | null;
  e_points: number | null;
  created_at: string;
}

/** Un participant du groupe (Laki, Thomas...) — configurable, jamais codé en dur. */
export interface ParticipantRow {
  id: string;
  name: string;
  created_at: string;
}

/**
 * Un pronostic de bracket simulé : le vainqueur pronostiqué par un stock
 * pour UN match (round + position) d'UN tour, indépendant des autres tours
 * (cf. tn_picks pour la même convention `participant_id` null = moi). Le
 * barème (2^(tour−1)) et le score se calculent à la volée
 * (lib/bracketSim.ts `scoreDuStock`), jamais stockés.
 */
export interface BracketRoundPickRow {
  id: string;
  tournament_id: string;
  participant_id: string | null;
  round: string;
  position: number;
  player_id: string;
}

/** Un pick hypothétique du bac à sable de picks du simulateur (tn_simulated_picks). */
export interface SimulatedPickRow {
  id: string;
  tournament_id: string;
  participant_id: string | null;
  round: string;
  half: Half | null;
  player_id: string;
}
