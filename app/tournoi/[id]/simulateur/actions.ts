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
 * Définit l'ancre d'un stock (moi si `participantId` est null, sinon un
 * participant — même convention que les picks) pour ce tournoi : UN seul
 * joueur, remplace l'ancre précédente s'il y en avait une. Son chemin dans
 * le tableau — donc les points qu'elle rapporte à chaque tour — se déduit
 * de sa place de départ (lib/bracketSim.ts `predictionsDepuisAncre`),
 * jamais stocké tour par tour.
 */
export async function definirAncre(
  tournamentId: string,
  participantId: string | null,
  playerId: string,
): Promise<PronosticActionResult> {
  if (!(await sessionValide())) return REFUS;

  const sb = supabaseAdmin();

  let sel = sb.from('tn_bracket_anchors').select('id').eq('tournament_id', tournamentId);
  sel = participantId === null ? sel.is('participant_id', null) : sel.eq('participant_id', participantId);
  const { data: existant, error: eSel } = await sel.maybeSingle();
  if (eSel) return { ok: false, error: eSel.message };

  const payload = { tournament_id: tournamentId, participant_id: participantId, player_id: playerId };

  if (existant) {
    const { error } = await sb.from('tn_bracket_anchors').update(payload).eq('id', existant.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await sb.from('tn_bracket_anchors').insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/tournoi/${tournamentId}/simulateur`);
  return { ok: true };
}

/** Efface l'ancre d'un stock pour ce tournoi. */
export async function effacerAncre(
  tournamentId: string,
  participantId: string | null,
): Promise<PronosticActionResult> {
  if (!(await sessionValide())) return REFUS;

  const sb = supabaseAdmin();
  let del = sb.from('tn_bracket_anchors').delete().eq('tournament_id', tournamentId);
  del = participantId === null ? del.is('participant_id', null) : del.eq('participant_id', participantId);
  const { error } = await del;
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/tournoi/${tournamentId}/simulateur`);
  return { ok: true };
}
