'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { supabaseAdmin } from '@/supabase/server';

export interface ParticipantActionResult {
  ok: boolean;
  error?: string;
}

const REFUS: ParticipantActionResult = { ok: false, error: 'Non authentifié.' };

/**
 * Ajoute un participant du groupe. « Moi » n'y figure jamais : c'est le
 * stock implicite (participant_id null dans tn_picks), pas une ligne ici.
 */
export async function ajouterParticipant(name: string): Promise<ParticipantActionResult> {
  if (!(await sessionValide())) return REFUS;

  const nom = name.trim();
  if (!nom) return { ok: false, error: 'Nom vide.' };

  const { error } = await supabaseAdmin().from('tn_participants').insert({ name: nom });
  if (error) {
    return {
      ok: false,
      error: error.code === '23505' ? `« ${nom} » existe déjà.` : error.message,
    };
  }

  revalidatePath('/participants');
  return { ok: true };
}

/**
 * Retire un participant. Cascade sur ses picks dans TOUS les tournois
 * (on_delete cascade) : son historique disparaît avec lui, comme n'importe
 * quelle autre suppression en cascade de ce schéma (tournoi, match...).
 */
export async function supprimerParticipant(id: string): Promise<ParticipantActionResult> {
  if (!(await sessionValide())) return REFUS;

  const { error } = await supabaseAdmin().from('tn_participants').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/participants');
  return { ok: true };
}
