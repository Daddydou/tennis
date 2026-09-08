'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { supabaseAdmin } from '@/supabase/server';
import { getTournament } from '@/supabase/queries';

export interface PronosticActionResult {
  ok: boolean;
  error?: string;
}

const REFUS: PronosticActionResult = { ok: false, error: 'Non authentifié.' };

type Client = ReturnType<typeof supabaseAdmin>;

/**
 * Efface, pour un stock donné, tout pronostic aux tours SUIVANT `round` qui
 * dépendait structurellement de l'emplacement (round, position) — un
 * changement à un tour se répercute sur un unique emplacement par tour
 * suivant (round+1, position÷2), puis (round+2, position÷4), etc.
 *
 * Sans ça, changer un pronostic de quart de finale laisserait une demie ou
 * une finale prédite sur un adversaire qui ne peut plus l'atteindre.
 */
async function effacerEnCascade(
  sb: Client,
  tournamentId: string,
  participantId: string | null,
  rounds: string[],
  idxRound: number,
  position: number,
): Promise<string | null> {
  let pos = position;
  for (let i = idxRound + 1; i < rounds.length; i++) {
    pos = Math.floor(pos / 2);
    let del = sb
      .from('tn_bracket_predictions')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('round', rounds[i])
      .eq('position', pos);
    del = participantId === null ? del.is('participant_id', null) : del.eq('participant_id', participantId);
    const { error } = await del;
    if (error) return error.message;
  }
  return null;
}

/**
 * Enregistre le pronostic d'un stock (moi si `participantId` est null, sinon
 * un participant — même convention que les picks) pour un emplacement du
 * tableau, et invalide en cascade tout pronostic plus tardif qui en
 * dépendait (cf. `effacerEnCascade`).
 */
export async function enregistrerPronostic(
  tournamentId: string,
  participantId: string | null,
  round: string,
  position: number,
  playerId: string,
): Promise<PronosticActionResult> {
  if (!(await sessionValide())) return REFUS;

  const tournoi = await getTournament(tournamentId);
  if (!tournoi) return { ok: false, error: 'Tournoi introuvable.' };
  const rounds = tournoi.rounds ?? [];
  const idx = rounds.indexOf(round);
  if (idx === -1) return { ok: false, error: 'Tour inconnu.' };

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

  const erreurCascade = await effacerEnCascade(sb, tournamentId, participantId, rounds, idx, position);
  if (erreurCascade) return { ok: false, error: erreurCascade };

  revalidatePath(`/tournoi/${tournamentId}/simulateur`);
  return { ok: true };
}

/** Efface le pronostic d'un stock à un emplacement, et sa cascade. */
export async function effacerPronostic(
  tournamentId: string,
  participantId: string | null,
  round: string,
  position: number,
): Promise<PronosticActionResult> {
  if (!(await sessionValide())) return REFUS;

  const tournoi = await getTournament(tournamentId);
  if (!tournoi) return { ok: false, error: 'Tournoi introuvable.' };
  const rounds = tournoi.rounds ?? [];
  const idx = rounds.indexOf(round);
  if (idx === -1) return { ok: false, error: 'Tour inconnu.' };

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

  const erreurCascade = await effacerEnCascade(sb, tournamentId, participantId, rounds, idx, position);
  if (erreurCascade) return { ok: false, error: erreurCascade };

  revalidatePath(`/tournoi/${tournamentId}/simulateur`);
  return { ok: true };
}
