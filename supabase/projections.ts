import 'server-only';
import { supabaseAdmin } from './server';
import { supabaseAnon } from './anon';
import { surfacePourElo, type TournamentRow } from './queries';
import { simulerDepuis } from '@/lib/montecarlo';
import type { Match, Player } from '@/lib/types';

/** Nombre de simulations Monte Carlo (cf. moteur : 5-10 s sur un tableau de 128). */
const N_SIMULATIONS = 20000;
/** Graine fixe → projections reproductibles. */
const SEED = 42;

export interface Projections {
  /** E[points | joueur pické au tour R]. */
  esperances: Record<string, Record<string, number>>;
  /** P(le joueur atteint ce tour). */
  presence: Record<string, Record<string, number>>;
}

/** Structures minimales du moteur (fournies par loadEngineData). */
export interface EngineInput {
  tournament: TournamentRow;
  matches: Match[];
  players: Record<string, Player>;
}

/**
 * Lance la simulation Monte Carlo À PARTIR DU TOUR `fromRound` (survivants
 * réels de ce tour, cf. simulerDepuis) et met le résultat en cache dans
 * tn_projections, indexé par (tournoi, from_round).
 *
 * Coûteux (plusieurs secondes) : à n'appeler qu'à l'import ou en fallback,
 * jamais à chaque affichage.
 */
export async function computeAndStoreProjections(
  { tournament, matches, players }: EngineInput,
  fromRound: string,
): Promise<Projections> {
  const rounds = tournament.rounds ?? [];
  const bestOf = (tournament.best_of ?? 3) as 3 | 5;
  const surface = surfacePourElo(tournament.surface);

  const mc = simulerDepuis(
    matches,
    players,
    rounds,
    fromRound,
    N_SIMULATIONS,
    bestOf,
    surface,
    0.6,
    SEED,
  );

  const sb = supabaseAdmin();

  // On ne garde que les lignes utiles : présence > 0 (couvre aussi
  // e_points > 0, puisqu'il faut être présent pour marquer).
  const rows: {
    tournament_id: string;
    from_round: string;
    player_id: string;
    round: string;
    e_points: number;
    p_reach: number;
  }[] = [];
  for (const id of Object.keys(mc.presence)) {
    for (const round of rounds) {
      const p = mc.presence[id]?.[round] ?? 0;
      if (p <= 0) continue;
      rows.push({
        tournament_id: tournament.id,
        from_round: fromRound,
        player_id: id,
        round,
        e_points: mc.esperances[id]?.[round] ?? 0,
        p_reach: p,
      });
    }
  }

  await sb
    .from('tn_projections')
    .delete()
    .eq('tournament_id', tournament.id)
    .eq('from_round', fromRound);
  if (rows.length) {
    const { error } = await sb.from('tn_projections').insert(rows);
    if (error) throw new Error(`Projections : ${error.message}`);
  }

  return { esperances: mc.esperances, presence: mc.presence };
}

/** Supprime tout le cache de projections d'un tournoi (tous les from_round). */
export async function invaliderProjections(tournamentId: string): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from('tn_projections').delete().eq('tournament_id', tournamentId);
}

function lireCache(
  rows: { player_id: string; round: string; e_points: number | null; p_reach: number | null }[],
): Projections {
  const esperances: Record<string, Record<string, number>> = {};
  const presence: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    (esperances[r.player_id] ??= {})[r.round] = Number(r.e_points ?? 0);
    (presence[r.player_id] ??= {})[r.round] = Number(r.p_reach ?? 0);
  }
  return { esperances, presence };
}

/**
 * Projections Monte Carlo pour un tour de départ donné.
 * Lit le cache tn_projections (tournoi, from_round) ; s'il est vide (import
 * récent, ou premier affichage de ce tour), relance la simulation depuis ce
 * tour et le repeuple.
 */
export async function getProjections(
  engine: EngineInput,
  fromRound: string,
): Promise<Projections> {
  // Lecture du cache : clé anon. Le repeuplement en cas de miss
  // (computeAndStoreProjections) écrit, lui, avec la service role.
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('tn_projections')
    .select('player_id, round, e_points, p_reach')
    .eq('tournament_id', engine.tournament.id)
    .eq('from_round', fromRound);
  if (error) throw new Error(error.message);

  if (data && data.length > 0) return lireCache(data);
  return computeAndStoreProjections(engine, fromRound);
}
