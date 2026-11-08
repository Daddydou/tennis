'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import type { ImportResult } from '@/db/importCoeur';
import { lireSurveillance } from '@/db/importAuto';
import { importerDepuisApi, mastersExistantPourSaison, parametresDeSurveillance, tournoisImportables } from '@/db/importApi';
import { supabaseAdmin } from '@/db/server';
import { estMasters } from '@/lib/masters';
import { actualiserResultatsMasters } from '@/app/tournoi/[id]/mastersActions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const refus = (error: string): ImportResult => ({ ok: false, error, avertissements: [] });

/**
 * Un Masters (poules + demies + finale) n'est pas un tableau à élimination directe : l'import générique répondrait
 * « aucun match dans cette extraction ». On passe par la mise à jour des résultats du Masters, qui gère aussi une
 * joueuse remplaçante (forfait avant le tournoi). Même quota : 1 requête.
 */
async function viaMasters(tournamentId: string): Promise<ImportResult> {
  const a = await actualiserResultatsMasters(tournamentId);
  if (!a.ok) return refus(a.erreur);
  const sb = supabaseAdmin();
  const [{ data: t }, { count }] = await Promise.all([
    sb.from('tn_tournaments').select('name, rounds').eq('id', tournamentId).maybeSingle(),
    sb.from('tn_matches').select('id', { count: 'exact', head: true }).eq('tournament_id', tournamentId),
  ]);
  const { resume } = a;
  return {
    ok: true,
    tournamentId,
    avertissements: [...resume.remplacements.map((m) => `Remplaçante prise en compte : ${m}.`), ...resume.avertissements],
    resume: { tournoi: (t?.name as string | undefined) ?? 'Masters', joueurs: 8, matchs: count ?? 0, rounds: (t?.rounds as string[] | null) ?? [] },
    matchsChanges: resume.maj + resume.creees + resume.placees,
  };
}

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
    const masters = await mastersExistantPourSaison(t.seasonId);
    if (masters) {
      const rm = await viaMasters(masters);
      revalidatePath('/import');
      return rm;
    }
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
    const { data: tn } = await supabaseAdmin().from('tn_tournaments').select('rounds').eq('id', tournamentId).maybeSingle();
    if (estMasters((tn?.rounds as string[] | null) ?? null)) {
      const rm = await viaMasters(tournamentId);
      revalidatePath('/import');
      return rm;
    }
    const r = await importerDepuisApi(await parametresDeSurveillance(tournamentId, s.source_url));
    revalidatePath('/import');
    return r;
  } catch (e) {
    return refus((e as Error).message);
  }
}
