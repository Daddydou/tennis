import 'server-only';
import { supabaseAdmin } from './server';
import { normaliserNom } from '@/lib/matching';
import { recupererRapportElo, type TourTa } from '@/lib/tennisabstract';

/**
 * RAFRAÎCHISSEMENT DES ELO TENNIS ABSTRACT
 *
 * Écrit dans `ta_elo` (service role). Déclenché à la main depuis l'accueil :
 * Tennis Abstract republie ses rapports une fois par semaine, il n'y a rien à
 * gagner à le faire à chaque import de tableau.
 *
 * Les joueurs absents du rapport de la semaine ne sont PAS supprimés : un
 * joueur qui sort de la liste (blessure, moins de 10 matchs sur 52 semaines)
 * garde son dernier Elo connu, meilleur repère que l'Elo maison.
 *
 * L'identité d'une ligne est le SLUG Tennis Abstract (player.cgi?p=AndresMartin),
 * pas le nom normalisé : deux homonymes coexistent en base, et c'est au
 * rapprochement de les départager (cf. lib/matching.ts).
 */

export interface ResumeTour {
  tour: TourTa;
  /** Lignes lues dans le rapport. */
  lues: number;
  /** Lignes écrites. Identité = slug, donc plus aucune perte d'homonyme. */
  importees: number;
  /**
   * Homonymes conservés : plusieurs slugs sous la même clé normalisée. Ils
   * sont tous en base ; c'est le RAPPROCHEMENT avec un tableau ATP qui devra
   * les départager, via `ta_name_exceptions`.
   */
  homonymes: { cle: string; slugs: string[] }[];
  misAJourLe: string | null;
}

export interface ResumeRefresh {
  ok: boolean;
  error?: string;
  tours: ResumeTour[];
  /** Lignes de cache Monte Carlo invalidées (cf. `invaliderToutesProjections`). */
  projectionsInvalidees?: boolean;
}

async function rafraichirTour(tour: TourTa): Promise<ResumeTour> {
  const rapport = await recupererRapportElo(tour);

  // L'identité est le slug : deux homonymes (« Andrej Martin » et « Andres
  // Martin », tous deux réduits à « a martin ») sont désormais DEUX lignes.
  // Seule une répétition du même slug serait à écarter — un upsert visant
  // deux fois la même ligne échoue (« ON CONFLICT DO UPDATE cannot affect
  // row a second time »).
  const parSlug = new Map<string, Record<string, unknown>>();
  const clesVues = new Map<string, string[]>();

  for (const l of rapport.lignes) {
    const cle = normaliserNom(l.nom);
    if (!cle || !l.slug || parSlug.has(l.slug)) continue;

    clesVues.set(cle, [...(clesVues.get(cle) ?? []), l.slug]);

    parSlug.set(l.slug, {
      ta_name: l.nom,
      ta_name_normalized: cle,
      ta_slug: l.slug,
      tour,
      elo_overall: l.eloOverall,
      elo_hard: l.eloHard,
      elo_clay: l.eloClay,
      elo_grass: l.eloGrass,
      atp_rank: l.rang,
      updated_at: rapport.misAJourLe,
    });
  }

  const payload = [...parSlug.values()];
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('ta_elo')
    .upsert(payload, { onConflict: 'ta_slug,tour' });
  if (error) throw new Error(`ta_elo (${tour}) : ${error.message}`);

  return {
    tour,
    lues: rapport.lignes.length,
    importees: payload.length,
    homonymes: [...clesVues.entries()]
      .filter(([, slugs]) => slugs.length > 1)
      .map(([cle, slugs]) => ({ cle, slugs })),
    misAJourLe: rapport.misAJourLe,
  };
}

/**
 * Vide tout le cache de projections Monte Carlo.
 *
 * Indispensable après un refresh : `tn_projections` a été calculé avec les
 * Elo précédents. Sans ça, les E[pts] affichés resteraient ceux d'avant la
 * mise à jour — un refresh sans effet visible. Chaque tour consulté sera
 * resimulé au premier affichage (quelques secondes).
 */
async function invaliderToutesProjections(): Promise<void> {
  const sb = supabaseAdmin();
  // PostgREST exige un filtre sur un DELETE : celui-ci est toujours vrai.
  const { error } = await sb
    .from('tn_projections')
    .delete()
    .not('tournament_id', 'is', null);
  if (error) throw new Error(`tn_projections : ${error.message}`);
}

/** Rafraîchit les deux circuits. Un circuit en échec fait échouer l'ensemble. */
export async function rafraichirElos(
  tours: TourTa[] = ['atp', 'wta'],
): Promise<ResumeRefresh> {
  try {
    const resumes: ResumeTour[] = [];
    for (const t of tours) resumes.push(await rafraichirTour(t));
    await invaliderToutesProjections();
    return { ok: true, tours: resumes, projectionsInvalidees: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message, tours: [] };
  }
}
