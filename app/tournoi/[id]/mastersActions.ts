'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { journaliser, lireSurveillance, noterSucces } from '@/db/importAuto';
import { cleApi } from '@/db/importApi';
import { appliquerResultatsMasters, type ResumeResultatsMasters } from '@/db/mastersResultats';
import { supabaseAdmin } from '@/db/server';
import { tableauTournoi } from '@/externe/tennisApiClient';
import { lireUrlTableauApi } from '@/lib/extract/matchstat';

/**
 * Bouton « Actualiser les résultats » d'un Masters : 1 requête à l'API tennis (sur 50 par jour), puis
 * mise à jour des matchs et des points des picks (db/mastersResultats.ts). Le cron fait la même chose toutes
 * les 6 h ; ce bouton sert les jours de match. Refusé s'il y a eu un rafraîchissement il y a moins de 2 minutes
 * (protège le quota contre les clics répétés).
 */

export type ResultatActualisation = { ok: true; resume: ResumeResultatsMasters } | { ok: false; erreur: string };

const DELAI_MIN_MS = 2 * 60 * 1000;

export async function actualiserResultatsMasters(tournamentId: string): Promise<ResultatActualisation> {
  if (!(await sessionValide())) return { ok: false, erreur: 'Session expirée : reconnecte-toi.' };
  try {
    const surveillance = await lireSurveillance(tournamentId);
    const u = surveillance ? lireUrlTableauApi(surveillance.source_url) : null;
    if (!surveillance || !u) return { ok: false, erreur: 'Ce tournoi n\'est pas relié à l\'API tennis (aucune surveillance enregistrée).' };

    const { data: dernier } = await supabaseAdmin()
      .from('tn_import_log')
      .select('created_at')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dernier && Date.now() - new Date(dernier.created_at as string).getTime() < DELAI_MIN_MS) {
      return { ok: false, erreur: 'Déjà actualisé il y a moins de 2 minutes : patiente un peu (quota de l\'API limité).' };
    }

    const debut = Date.now();
    const { donnees: tableau } = await tableauTournoi(cleApi(), u.type, u.nom, u.annee);
    const resume = await appliquerResultatsMasters(supabaseAdmin(), tournamentId, tableau, true);
    if (resume.erreurs.length) return { ok: false, erreur: resume.erreurs.join(' ') };

    const hash = createHash('sha256').update(JSON.stringify(tableau.singles ?? [])).digest('hex');
    await noterSucces({ tournamentId, tour: surveillance.tour, sourceUrl: surveillance.source_url, hash });
    await journaliser({
      tournament_id: tournamentId,
      source: 'manuel',
      ok: true,
      matchs_total: (tableau.singles ?? []).length,
      matchs_changes: resume.maj + resume.creees + resume.placees,
      avertissements: resume.avertissements,
      duree_ms: Date.now() - debut,
    });
    revalidatePath(`/tournoi/${tournamentId}`, 'layout');
    return { ok: true, resume };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
