import 'server-only';
import { supabaseAdmin } from './server';

/**
 * Recalcule les points de tous les picks d'un tournoi.
 *
 * `tn_recompute_picks` parcourt les picks un par un et score chacun contre son
 * match : le calcul ne dépend donc d'aucune notion de « tour complet ». Le
 * problème n'était pas la fonction SQL mais son déclenchement — elle n'était
 * appelée que par le bouton « Recalculer » de l'écran Résultats, si bien que
 * des picks dont le match était terminé restaient à `points = null`.
 *
 * On l'appelle désormais dès qu'un résultat ou un pick change : à l'import
 * (nouveaux scores) et à chaque validation/suppression de pick.
 *
 * Ne lève jamais : un échec de scoring ne doit pas faire échouer l'action qui
 * l'a déclenchée (l'import, notamment). L'erreur est renvoyée à l'appelant.
 */
export async function recalculerPoints(
  tournamentId: string,
): Promise<{ ok: boolean; picks?: number; error?: string }> {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb.rpc('tn_recompute_picks', {
      p_tournament_id: tournamentId,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, picks: typeof data === 'number' ? data : undefined };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
