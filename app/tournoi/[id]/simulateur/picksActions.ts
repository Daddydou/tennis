'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { supabaseAdmin } from '@/supabase/server';

export interface PickSimuleActionResult {
  ok: boolean;
  error?: string;
}

const REFUS: PickSimuleActionResult = { ok: false, error: 'Non authentifié.' };

/**
 * Pick HYPOTHÉTIQUE d'un stock, sur le tableau TESTÉ du simulateur —
 * mêmes règles d'unicité que les vrais picks (tn_picks), mais dans
 * tn_simulated_picks, entièrement séparée : jamais un vrai pick soumis.
 *
 * Aucune espérance ni point stockés ici (contrairement à tn_picks) : le
 * barème détaillé se recalcule en direct côté client contre le tableau
 * testé du moment (lib/scoring.ts, à partir de l'espérance du moteur
 * existant tant que le tour simulé n'est pas décidé).
 */
export async function validerPickSimule(
  tournamentId: string,
  round: string,
  half: 'top' | 'bottom' | null,
  playerId: string,
  participantId: string | null,
): Promise<PickSimuleActionResult> {
  if (!(await sessionValide())) return REFUS;

  const sb = supabaseAdmin();

  let qConf = sb
    .from('tn_simulated_picks')
    .select('round, half')
    .eq('tournament_id', tournamentId)
    .eq('player_id', playerId);
  qConf = participantId === null ? qConf.is('participant_id', null) : qConf.eq('participant_id', participantId);
  const { data: conflits, error: eConf } = await qConf;
  if (eConf) return { ok: false, error: eConf.message };

  const ailleurs = (conflits ?? []).find((c) => !(c.round === round && (c.half ?? null) === half));
  if (ailleurs) {
    return {
      ok: false,
      error: `Ce joueur est déjà pické (simulation) au tour ${ailleurs.round}${
        ailleurs.half ? ` (${ailleurs.half})` : ''
      }.`,
    };
  }

  let sel = sb
    .from('tn_simulated_picks')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('round', round);
  sel = half === null ? sel.is('half', null) : sel.eq('half', half);
  sel = participantId === null ? sel.is('participant_id', null) : sel.eq('participant_id', participantId);
  const { data: existant, error: eSel } = await sel.maybeSingle();
  if (eSel) return { ok: false, error: eSel.message };

  const payload = { tournament_id: tournamentId, participant_id: participantId, round, half, player_id: playerId };

  if (existant) {
    const { error } = await sb.from('tn_simulated_picks').update(payload).eq('id', existant.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await sb.from('tn_simulated_picks').insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/tournoi/${tournamentId}/simulateur`);
  return { ok: true };
}

export async function effacerPickSimule(
  tournamentId: string,
  round: string,
  half: 'top' | 'bottom' | null,
  participantId: string | null,
): Promise<PickSimuleActionResult> {
  if (!(await sessionValide())) return REFUS;

  const sb = supabaseAdmin();
  let del = sb.from('tn_simulated_picks').delete().eq('tournament_id', tournamentId).eq('round', round);
  del = half === null ? del.is('half', null) : del.eq('half', half);
  del = participantId === null ? del.is('participant_id', null) : del.eq('participant_id', participantId);
  const { error } = await del;
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/tournoi/${tournamentId}/simulateur`);
  return { ok: true };
}
