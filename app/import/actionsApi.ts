'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import type { ImportResult } from '@/db/importCoeur';
import { lireSurveillance } from '@/db/importAuto';
import { importerDepuisApi, parametresDeSurveillance, tournoisImportables } from '@/db/importApi';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const refus = (error: string): ImportResult => ({ ok: false, error, avertissements: [] });

/**
 * Importe un tournoi du calendrier depuis l'API tennis (1 requête).
 *
 * Le navigateur n'envoie que l'identifiant de saison : le nom du tournoi
 * (qui entre dans l'URL de l'API) est relu côté serveur dans le calendrier,
 * jamais pris tel quel du client.
 */
export async function importerTournoiApi(seasonId: number, type: 'atp' | 'wta'): Promise<ImportResult> {
  // Server Action = POST vers /import : la garde de session est ici, pas dans le proxy.
  if (!(await sessionValide())) return refus('Non authentifié.');
  if (!Number.isInteger(seasonId) || seasonId <= 0 || (type !== 'atp' && type !== 'wta')) return refus('Tournoi invalide.');
  try {
    const t = (await tournoisImportables()).find((x) => x.seasonId === seasonId && x.type === type);
    if (!t) return refus('Tournoi absent du calendrier des tournois importables.');
    const r = await importerDepuisApi({ type: t.type, nom: t.nom, annee: t.annee, seasonId: t.seasonId, startDate: t.startDate });
    revalidatePath('/import');
    return r;
  } catch (e) {
    return refus((e as Error).message);
  }
}

/** Mise à jour immédiate d'un tournoi déjà surveillé en mode 'api' (1 requête). */
export async function actualiserTournoiApi(tournamentId: string): Promise<ImportResult> {
  if (!(await sessionValide())) return refus('Non authentifié.');
  if (!UUID.test(tournamentId)) return refus('Tournoi invalide.');
  try {
    const s = await lireSurveillance(tournamentId);
    if (!s || s.mode !== 'api') return refus('Ce tournoi n’est pas importé depuis l’API.');
    const r = await importerDepuisApi(await parametresDeSurveillance(tournamentId, s.source_url));
    revalidatePath('/import');
    return r;
  } catch (e) {
    return refus((e as Error).message);
  }
}
