import 'server-only';
import { supabaseAdmin } from './server';
import { invaliderToutesFantasy } from './fantasy';
import { normaliserNom } from '@/lib/matching';
import {
  parserCollageElo,
  recupererRapportElo,
  type RapportElo,
  type TourTa,
} from '@/lib/tennisabstract';

/**
 * RAFRAÎCHISSEMENT DES ELO TENNIS ABSTRACT
 *
 * Écrit dans `ta_elo` (service role). Déclenché à la main : Tennis Abstract
 * republie ses rapports une fois par semaine, il n'y a rien à gagner à le
 * faire à chaque import de tableau.
 *
 * DEUX SOURCES, UNE SEULE ÉCRITURE :
 *   - le COLLAGE d'un extrait produit par public/extract-elo.js (méthode
 *     principale — Tennis Abstract répond 403 aux IP de datacenter Vercel) ;
 *   - le FETCH serveur historique, gardé en repli au cas où le blocage
 *     tomberait.
 * Les deux convergent vers `ecrireRapport` : le parsing des Elo, la
 * déduplication par slug et l'upsert ne sont écrits qu'une fois.
 *
 * Les joueurs absents du rapport de la semaine ne sont PAS supprimés : un
 * joueur qui sort de la liste (blessure, moins de 10 matchs sur 52 semaines)
 * garde son dernier Elo connu, meilleur repère que l'Elo maison.
 *
 * L'identité d'une ligne est le SLUG Tennis Abstract (player.cgi?p=AndresMartin),
 * pas le nom normalisé : deux homonymes coexistent en base, et c'est au
 * rapprochement de les départager (cf. lib/matching.ts).
 *
 * DEUX ÉCRITURES, PAS UNE. `ta_elo` est ÉCRASÉE — c'est l'état courant, celui
 * que lisent les picks, le fantasy et la simulation. `ta_elo_historique`, elle,
 * est AUGMENTÉE d'un instantané daté du rapport. Sans cette archive, juger un
 * match passé se ferait sur l'Elo d'aujourd'hui, qui a déjà intégré son
 * résultat : le favori y est en partie désigné par ce qu'il a fait (cf.
 * supabase/elo-historique.ts). La table courante ne perd rien à ce doublon, et
 * les écrans de mesure y gagnent la seule chose qui les rende valides.
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
  /**
   * Lignes versées à l'archive datée (`ta_elo_historique`). `null` quand la
   * table n'existe pas encore : l'import courant reste valable, seule
   * l'évaluation sans look-ahead perd cette semaine — ça se dit, ça ne fait
   * pas échouer l'import.
   */
  archivees: number | null;
  /** Date sous laquelle l'instantané a été archivé. */
  releveLe: string;
}

export interface ResumeRefresh {
  ok: boolean;
  error?: string;
  tours: ResumeTour[];
  /** Lignes de cache Monte Carlo invalidées (cf. `invaliderToutesProjections`). */
  projectionsInvalidees?: boolean;
}

/** Écrit un rapport (fetché ou collé) dans `ta_elo`. */
async function ecrireRapport(rapport: RapportElo): Promise<ResumeTour> {
  const tour = rapport.tour;

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
    });
  }

  const lignes = [...parSlug.values()];
  const sb = supabaseAdmin();

  // 1. État COURANT — écrasé. C'est lui que lit la production.
  const { error } = await sb
    .from('ta_elo')
    .upsert(
      lignes.map((l) => ({ ...l, updated_at: rapport.misAJourLe })),
      { onConflict: 'ta_slug,tour' },
    );
  if (error) throw new Error(`ta_elo (${tour}) : ${error.message}`);

  // 2. ARCHIVE datée — ajoutée.
  const releveLe = rapport.misAJourLe ?? new Date().toISOString().slice(0, 10);
  const archivees = await archiver(lignes, releveLe, tour);

  return {
    tour,
    lues: rapport.lignes.length,
    importees: lignes.length,
    homonymes: [...clesVues.entries()]
      .filter(([, slugs]) => slugs.length > 1)
      .map(([cle, slugs]) => ({ cle, slugs })),
    misAJourLe: rapport.misAJourLe,
    archivees,
    releveLe,
  };
}

/**
 * Verse un rapport dans l'archive datée, sous la date du rapport.
 *
 * `releve_le` vient du rapport (« Last update »), pas de l'heure d'import :
 * c'est la date à laquelle ces Elo étaient vrais, et c'est elle qu'on
 * comparera à la date d'un match. Un rapport importé en retard, ou deux fois,
 * atterrit donc au bon endroit dans le temps — le second import met à jour les
 * mêmes lignes au lieu d'empiler un doublon (clé tour, releve_le, ta_slug).
 *
 * À défaut de date annoncée, celle du jour : un instantané mal daté reste
 * mieux qu'aucun, tant que la date retenue ne peut pas être POSTÉRIEURE à la
 * publication — elle ne l'est pas.
 */
async function archiver(
  lignes: Record<string, unknown>[],
  releveLe: string,
  tour: TourTa,
): Promise<number | null> {
  if (lignes.length === 0) return 0;

  const { error } = await supabaseAdmin()
    .from('ta_elo_historique')
    .upsert(
      lignes.map((l) => ({ ...l, releve_le: releveLe })),
      { onConflict: 'tour,releve_le,ta_slug' },
    );

  // 42P01 : migration 0010 pas encore appliquée. L'import courant a réussi et
  // fait tout ce que la production attend de lui : on ne le fait pas échouer
  // pour une archive de mesure. Le `null` remonte jusqu'à l'écran d'import.
  if (error) {
    if (error.code === '42P01') return null;
    throw new Error(`ta_elo_historique (${tour}) : ${error.message}`);
  }
  return lignes.length;
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

/**
 * Écrit une série de rapports, puis périme les caches qui en dépendent.
 * Un rapport en échec fait échouer l'ensemble.
 */
async function enregistrerRapports(
  rapports: RapportElo[],
): Promise<ResumeRefresh> {
  try {
    const resumes: ResumeTour[] = [];
    for (const r of rapports) resumes.push(await ecrireRapport(r));
    await invaliderToutesProjections();
    // Les espérances Fantasy sont dérivées des projections : les garder
    // afficherait des totaux calculés avec les Elo de la semaine précédente.
    await invaliderToutesFantasy();
    return { ok: true, tours: resumes, projectionsInvalidees: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message, tours: [] };
  }
}

/**
 * MÉTHODE PRINCIPALE — import d'un extrait collé (public/extract-elo.js).
 *
 * Le collage peut porter un circuit ou les deux (tableau JSON d'extraits).
 * Rien d'autre ne change par rapport au fetch : mêmes lignes, même upsert par
 * (ta_slug, tour), mêmes caches invalidés.
 */
export async function importerElosColles(
  jsonText: string,
): Promise<ResumeRefresh> {
  let rapports: RapportElo[];
  try {
    rapports = parserCollageElo(jsonText);
  } catch (e) {
    return { ok: false, error: (e as Error).message, tours: [] };
  }
  return enregistrerRapports(rapports);
}

/**
 * REPLI — récupération par fetch serveur.
 *
 * Bloquée depuis les IP Vercel (403), gardée au cas où Tennis Abstract
 * lèverait le filtre : en local, elle fonctionne toujours.
 */
export async function rafraichirElos(
  tours: TourTa[] = ['atp', 'wta'],
): Promise<ResumeRefresh> {
  let rapports: RapportElo[];
  try {
    rapports = [];
    for (const t of tours) rapports.push(await recupererRapportElo(t));
  } catch (e) {
    return { ok: false, error: (e as Error).message, tours: [] };
  }
  return enregistrerRapports(rapports);
}
