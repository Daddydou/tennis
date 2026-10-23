import type { SupabaseClient } from '@supabase/supabase-js';
import type { MatchInterne } from '@/lib/bracketExternePont';
import type { PickLocal } from '@/lib/gameTrackerPicks';

/**
 * LECTURE (seule) de ce qu'il faut savoir chez nous pour parler à l'API picks
 * de Game Tracker (lib/gameTrackerPicks.ts, externe/gameTrackerPicksClient.ts).
 *
 * Client Supabase INJECTÉ, comme db/bracketExternePont.ts : la clé publique
 * (RLS = select) suffit. Cette fonction n'écrit RIEN dans notre base — l'envoi
 * vers Game Tracker ne modifie aucun de nos picks.
 *
 * Lien tournoi interne <-> tournoi Game Tracker : le MÊME que celui du pont de
 * Thomas (tn_bracket_externe_tournois.tournament_id_interne, posé depuis
 * /import/thomas), lu à l'envers. Jamais deviné par le nom.
 */

export interface ContexteLocalGT {
  /** Identifiant du tournoi chez Game Tracker, ou null si le lien n'est pas posé. */
  gtId: string | null;
  rounds: string[];
  matchs: MatchInterne[];
  noms: Map<string, string>;
  /** Mes picks (stock « moi », participant_id null). */
  picks: PickLocal[];
}

async function lire<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>, quoi: string): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(`${quoi} : ${error.message}`);
  return data as T;
}

export async function chargerContexteLocalGT(lecture: SupabaseClient, tournamentId: string): Promise<ContexteLocalGT> {
  const [lien, tournoi, matchs, picks] = await Promise.all([
    lire<{ id: string }[]>(
      lecture.from('tn_bracket_externe_tournois').select('id').eq('tournament_id_interne', tournamentId).limit(1),
      'tn_bracket_externe_tournois',
    ),
    lire<{ rounds: string[] | null } | null>(
      lecture.from('tn_tournaments').select('rounds').eq('id', tournamentId).maybeSingle(),
      'tn_tournaments',
    ),
    lire<{ round: string; position: number | null; player1_id: string | null; player2_id: string | null; status: string | null }[]>(
      lecture.from('tn_matches').select('round, position, player1_id, player2_id, status').eq('tournament_id', tournamentId),
      'tn_matches',
    ),
    lire<{ round: string; half: 'top' | 'bottom' | null; player_id: string }[]>(
      lecture.from('tn_picks').select('round, half, player_id').eq('tournament_id', tournamentId).is('participant_id', null),
      'tn_picks',
    ),
  ]);
  if (!tournoi) throw new Error(`Tournoi ${tournamentId} introuvable.`);

  const ids = [...new Set(picks.map((p) => p.player_id))];
  const joueurs = ids.length
    ? await lire<{ id: string; name: string }[]>(lecture.from('tn_players').select('id, name').in('id', ids), 'tn_players')
    : [];

  return {
    gtId: lien[0]?.id ?? null,
    rounds: tournoi.rounds ?? [],
    matchs: matchs
      .filter((m) => m.position !== null)
      .map((m) => ({ round: m.round, position: m.position as number, player1Id: m.player1_id, player2Id: m.player2_id, status: m.status })),
    noms: new Map(joueurs.map((j) => [j.id, j.name])),
    picks: picks.map((p) => ({ round: p.round, half: p.half, playerId: p.player_id })),
  };
}
