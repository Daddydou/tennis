import { supabaseAnon } from './anon';
import {
  plusRecentParJoueur,
  versInsight,
  type PlayerInsight,
  type PlayerInsightRow,
} from '@/lib/insights';

/**
 * Insights joueurs d'un tournoi : le plus récent par joueur (as_of desc),
 * indexé par player_id. Lecture seule, clé anon (policy RLS de lecture).
 *
 * Purement informatif : une erreur de lecture est journalisée et renvoie une
 * Map vide — l'écran des picks se comporte alors exactement comme sans
 * insights, il ne doit jamais tomber à cause d'eux.
 */
export async function getInsights(
  tournamentId: string,
): Promise<Map<string, PlayerInsight>> {
  const { data, error } = await supabaseAnon()
    .from('tn_player_insights')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('as_of', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Insights joueurs illisibles :', error.message);
    return new Map();
  }
  return plusRecentParJoueur(((data ?? []) as PlayerInsightRow[]).map(versInsight));
}
