'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { supabaseAdmin } from '@/supabase/server';

export interface PronosticActionResult {
  ok: boolean;
  error?: string;
}

const REFUS: PronosticActionResult = { ok: false, error: 'Non authentifié.' };

/**
 * Persiste, pour un stock (moi si `participantId` est null, sinon un
 * participant) et un tour donné, EXACTEMENT l'ensemble des pronostics de
 * `picks` (position -> vainqueur pronostiqué, ou `null` pour « aucun joueur
 * encore en lice dans ce match ») — remplace TOUT le tour d'un coup (efface
 * puis réécrit), jamais les autres tours : chaque tour est indépendant (cf.
 * tn_bracket_round_picks, migration 0018). C'est le bouton « Valider »
 * unique de l'écran, qui envoie toujours l'état complet du tour affiché.
 */
export async function sauvegarderPronosticsBracket(
  tournamentId: string,
  participantId: string | null,
  round: string,
  picks: { position: number; playerId: string | null }[],
): Promise<PronosticActionResult> {
  if (!(await sessionValide())) return REFUS;

  const sb = supabaseAdmin();

  let del = sb.from('tn_bracket_round_picks').delete().eq('tournament_id', tournamentId).eq('round', round);
  del = participantId === null ? del.is('participant_id', null) : del.eq('participant_id', participantId);
  const { error: eDel } = await del;
  if (eDel) return { ok: false, error: eDel.message };

  const aEcrire = picks.filter((p): p is { position: number; playerId: string } => p.playerId !== null);
  if (aEcrire.length > 0) {
    const { error } = await sb.from('tn_bracket_round_picks').insert(
      aEcrire.map((p) => ({
        tournament_id: tournamentId,
        participant_id: participantId,
        round,
        position: p.position,
        player_id: p.playerId,
      })),
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/tournoi/${tournamentId}/simulateur`);
  return { ok: true };
}
