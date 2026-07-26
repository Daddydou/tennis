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

export async function validerPick(
  tournamentId: string,
  round: string,
  half: 'top' | 'bottom' | null,
  playerId: string,
  ePoints: number | null,
): Promise<PickActionResult> {
  if (!(await sessionValide())) return REFUS;

  const sb = supabaseAdmin();

  // Un joueur ne peut être pické qu'une fois par tournoi (contrainte du jeu).
  // On vérifie explicitement pour donner un message clair plutôt qu'une 23505.
  const { data: conflits, error: eConf } = await sb
    .from('tn_picks')
    .select('round, half')
    .eq('tournament_id', tournamentId)
    .eq('player_id', playerId);
  if (eConf) return { ok: false, error: eConf.message };

  const ailleurs = (conflits ?? []).find(
    (c) => !(c.round === round && (c.half ?? null) === half),
  );
  if (ailleurs) {
    return {
      ok: false,
      error: `Ce joueur est déjà pické au tour ${ailleurs.round}${
        ailleurs.half ? ` (${ailleurs.half})` : ''
      }. Un joueur ne peut être utilisé qu'une fois par tournoi.`,
    };
  }

  // Ligne existante pour ce slot ?
  let sel = sb
    .from('tn_picks')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('round', round);
  sel = half === null ? sel.is('half', null) : sel.eq('half', half);
  const { data: existant, error: eSel } = await sel.maybeSingle();
  if (eSel) return { ok: false, error: eSel.message };

  const payload = {
    tournament_id: tournamentId,
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
  return { ok: true };
}

export async function supprimerPick(
  tournamentId: string,
  round: string,
  half: 'top' | 'bottom' | null,
): Promise<PickActionResult> {
  if (!(await sessionValide())) return REFUS;

  const sb = supabaseAdmin();
  let del = sb
    .from('tn_picks')
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('round', round);
  del = half === null ? del.is('half', null) : del.eq('half', half);
  const { error } = await del;
  if (error) return { ok: false, error: error.message };

  await recalculerPoints(tournamentId);

  revalidatePath(`/tournoi/${tournamentId}/picks`);
  revalidatePath(`/tournoi/${tournamentId}/resultats`);
  return { ok: true };
}
