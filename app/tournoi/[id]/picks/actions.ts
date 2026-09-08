'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { supabaseAdmin } from '@/supabase/server';
import { recalculerPoints } from '@/supabase/points';

export interface PickActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Une Server Action est un POST vers la route qui l'héberge, pas une route
 * distincte : la couverture du proxy ne suffit pas à la protéger.
 */
const REFUS: PickActionResult = { ok: false, error: 'Non authentifié.' };

/**
 * @param participantId null = mon pick (comportement historique, INCHANGÉ) ;
 *   sinon celui d'un participant du groupe — même règles, stock indépendant
 *   (cf. tn_picks, migration 0014).
 */
export async function validerPick(
  tournamentId: string,
  round: string,
  half: 'top' | 'bottom' | null,
  playerId: string,
  ePoints: number | null,
  participantId: string | null = null,
): Promise<PickActionResult> {
  if (!(await sessionValide())) return REFUS;

  const sb = supabaseAdmin();

  // Un joueur ne peut être pické qu'une fois par tournoi ET PAR STOCK
  // (contrainte du jeu). On vérifie explicitement pour donner un message
  // clair plutôt qu'une 23505.
  let qConf = sb
    .from('tn_picks')
    .select('round, half')
    .eq('tournament_id', tournamentId)
    .eq('player_id', playerId);
  qConf = participantId === null ? qConf.is('participant_id', null) : qConf.eq('participant_id', participantId);
  const { data: conflits, error: eConf } = await qConf;
  if (eConf) return { ok: false, error: eConf.message };

  const ailleurs = (conflits ?? []).find(
    (c) => !(c.round === round && (c.half ?? null) === half),
  );
  if (ailleurs) {
    return {
      ok: false,
      error: `Ce joueur est déjà pické au tour ${ailleurs.round}${
        ailleurs.half ? ` (${ailleurs.half})` : ''
      }. Un joueur ne peut être utilisé qu'une fois par tournoi (par ce stock).`,
    };
  }

  // Ligne existante pour ce slot ?
  let sel = sb
    .from('tn_picks')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('round', round);
  sel = half === null ? sel.is('half', null) : sel.eq('half', half);
  sel = participantId === null ? sel.is('participant_id', null) : sel.eq('participant_id', participantId);
  const { data: existant, error: eSel } = await sel.maybeSingle();
  if (eSel) return { ok: false, error: eSel.message };

  const payload = {
    tournament_id: tournamentId,
    participant_id: participantId,
    round,
    half,
    player_id: playerId,
    e_points: ePoints,
    locked_at: new Date().toISOString(),
  };

  if (existant) {
    const { error } = await sb.from('tn_picks').update(payload).eq('id', existant.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await sb.from('tn_picks').insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  // Si le match du joueur pické est déjà joué, ses points sont connus tout de
  // suite : on ne les fait pas dépendre de la complétude du tour.
  await recalculerPoints(tournamentId);

  revalidatePath(`/tournoi/${tournamentId}/picks`);
  revalidatePath(`/tournoi/${tournamentId}/resultats`);
  revalidatePath(`/tournoi/${tournamentId}/participants`);
  return { ok: true };
}

export async function supprimerPick(
  tournamentId: string,
  round: string,
  half: 'top' | 'bottom' | null,
  participantId: string | null = null,
): Promise<PickActionResult> {
  if (!(await sessionValide())) return REFUS;

  const sb = supabaseAdmin();
  let del = sb
    .from('tn_picks')
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('round', round);
  del = half === null ? del.is('half', null) : del.eq('half', half);
  del = participantId === null ? del.is('participant_id', null) : del.eq('participant_id', participantId);
  const { error } = await del;
  if (error) return { ok: false, error: error.message };

  await recalculerPoints(tournamentId);

  revalidatePath(`/tournoi/${tournamentId}/picks`);
  revalidatePath(`/tournoi/${tournamentId}/resultats`);
  revalidatePath(`/tournoi/${tournamentId}/participants`);
  return { ok: true };
}
