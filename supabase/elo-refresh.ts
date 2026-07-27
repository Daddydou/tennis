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
 */

export interface ResumeTour {
  tour: TourTa;
  /** Lignes lues dans le rapport. */
  lues: number;
  /** Lignes écrites après déduplication des clés. */
  importees: number;
  /** Homonymes réduits à la même clé : une seule ligne survit (cf. §collisions). */
  collisions: { cle: string; noms: string[] }[];
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

  // Deux joueurs peuvent se réduire à la même clé (« Andrej Martin » et
  // « Andres Martin » → « a martin »). La contrainte unique n'en garde qu'un ;
  // un upsert contenant les deux échouerait de toute façon (« ON CONFLICT DO
  // UPDATE cannot affect row a second time »). On garde le mieux classé —
  // le rapport est trié par Elo décroissant — et on signale le cas.
  const parCle = new Map<string, { nom: string; payload: Record<string, unknown> }>();
  const collisions = new Map<string, string[]>();

  for (const l of rapport.lignes) {
    const cle = normaliserNom(l.nom);
    if (!cle) continue;

    const deja = parCle.get(cle);
    if (deja) {
      collisions.set(cle, [...(collisions.get(cle) ?? [deja.nom]), l.nom]);
      continue;
    }

    parCle.set(cle, {
      nom: l.nom,
      payload: {
        ta_name: l.nom,
        ta_name_normalized: cle,
        tour,
        elo_overall: l.eloOverall,
        elo_hard: l.eloHard,
        elo_clay: l.eloClay,
        elo_grass: l.eloGrass,
        atp_rank: l.rang,
        updated_at: rapport.misAJourLe,
      },
    });
  }

  const payload = [...parCle.values()].map((v) => v.payload);
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('ta_elo')
    .upsert(payload, { onConflict: 'ta_name_normalized,tour' });
  if (error) throw new Error(`ta_elo (${tour}) : ${error.message}`);

  return {
    tour,
    lues: rapport.lignes.length,
    importees: payload.length,
    collisions: [...collisions.entries()].map(([cle, noms]) => ({ cle, noms })),
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
