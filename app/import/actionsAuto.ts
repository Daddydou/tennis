'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { arreterSurveillance, reprendreSurveillance } from '@/db/importAuto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Arrêt / reprise MANUELS de la surveillance d'un tournoi (écran /import). */
export async function basculerSurveillance(
  tournamentId: string,
  action: 'arreter' | 'reprendre',
): Promise<{ ok: boolean; error?: string }> {
  // Server Action = POST vers /import : la garde de session est ici, pas dans le proxy.
  if (!(await sessionValide())) return { ok: false, error: 'Non authentifié.' };
  if (!UUID.test(tournamentId)) return { ok: false, error: 'Tournoi invalide.' };
  try {
    if (action === 'arreter') await arreterSurveillance(tournamentId, 'manuel');
    else await reprendreSurveillance(tournamentId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath('/import');
  return { ok: true };
}
