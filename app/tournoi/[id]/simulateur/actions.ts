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
 * Enregistre le pronostic d'un stock (moi si `participantId` est null, sinon
 * un participant — même convention que les picks) pour un emplacement du
 * tableau.
 *
 * Chaque emplacement se note INDÉPENDAMMENT des autres (cf. lib/bracketSim.ts
 * `scoreDuStock` : une prédiction ne vaut que si le joueur prédit est
 * effectivement le vainqueur RÉEL/SIMULÉ de CET emplacement, sans exiger de
 * cheminement cohérent en amont) — changer un pronostic de quart de finale
 * ne remet donc plus en cause ceux de demie ou de finale, même bâtis sur un
 * autre joueur : aucune cascade à effacer ici, contrairement à l'ancienne
 * version de cet écran.
 */
export async function enregistrerPronostic(
  tournamentId: string,
  participantId: string | null,
  round: string,
  position: number,
  playerId: string,
): Promise<PronosticActionResult> {
  if (!(await sessionValide())) return REFUS;

  const sb = supabaseAdmin();

  let sel = sb
    .from('tn_bracket_predictions')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('round', round)
    .eq('position', position);
  sel = participantId === null ? sel.is('participant_id', null) : sel.eq('participant_id', participantId);
  const { data: existant, error: eSel } = await sel.maybeSingle();
  if (eSel) return { ok: false, error: eSel.message };

  const payload = {
    tournament_id: tournamentId,
    participant_id: participantId,
    round,
    position,
    player_id: playerId,
  };

  if (existant) {
    const { error } = await sb.from('tn_bracket_predictions').update(payload).eq('id', existant.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await sb.from('tn_bracket_predictions').insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/tournoi/${tournamentId}/simulateur`);
  return { ok: true };
}

/** Efface le pronostic d'un stock à un emplacement — lui seul, sans cascade. */
export async function effacerPronostic(
  tournamentId: string,
  participantId: string | null,
  round: string,
  position: number,
): Promise<PronosticActionResult> {
  if (!(await sessionValide())) return REFUS;

  const sb = supabaseAdmin();

  let del = sb
    .from('tn_bracket_predictions')
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('round', round)
    .eq('position', position);
  del = participantId === null ? del.is('participant_id', null) : del.eq('participant_id', participantId);
  const { error } = await del;
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/tournoi/${tournamentId}/simulateur`);
  return { ok: true };
}
