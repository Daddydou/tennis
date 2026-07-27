/**
 * RÉSOLUTION DE L'ELO D'UN JOUEUR — CASCADE À TROIS NIVEAUX
 *
 *   1. Tennis Abstract (table `ta_elo`), rapproché par le nom (lib/matching.ts)
 *   2. Elo maison (colonnes `elo_*` de `tn_players`), calculé sur les seuls
 *      tournois importés ici — donc bruité, mais mieux que rien
 *   3. Elo par défaut, pour un joueur inconnu des deux sources
 *
 * Chaque joueur porte la SOURCE de son Elo : un joueur fort affiché en
 * « défaut », ou avec un Elo visiblement faux, signale une correspondance de
 * nom à corriger dans `ta_name_exceptions` (cf. écran Picks).
 *
 * Lectures en clé anon (policy `for select to anon`, cf. migration 0002) :
 * ce module ne contient aucune écriture. Le rafraîchissement des Elo vit
 * dans `supabase/elo-refresh.ts`, en service role.
 */

import { supabaseAnon } from './anon';
import { eloDepuisRang, eloEffectif } from '@/lib/elo';
import {
  chercherCorrespondance,
  construireIndex,
  normaliserNom,
  type IndexTa,
} from '@/lib/matching';
import type { Tour } from '@/lib/types';

/**
 * Elo de dernier recours. Volontairement distinct de `ELO_DEFAUT` (1500,
 * lib/elo.ts) qui est le point de DÉPART d'un Elo calculé match par match :
 * ici il s'agit d'estimer le niveau d'un joueur de circuit inconnu des deux
 * sources, plus proche de la moyenne du tableau que d'un débutant.
 */
export const ELO_DEFAUT_RESOLU = 1650;

/** Poids de la surface dans l'Elo effectif — identique à celui du moteur. */
export const POIDS_SURFACE = 0.6;

/**
 * `ambigu` : plusieurs joueurs Tennis Abstract portent ce nom et la source ne
 * permet pas de trancher. La valeur affichée est alors un repli (maison, ou
 * défaut), mais elle est signalée comme telle — cf. `chercherCorrespondance`.
 */
export type SourceElo = 'ta' | 'maison' | 'defaut' | 'ambigu';

export type SurfaceElo = 'hard' | 'clay' | 'grass';

export interface TaEloRow {
  ta_name: string;
  ta_name_normalized: string;
  ta_slug: string;
  country: string | null;
  tour: 'atp' | 'wta';
  elo_overall: number | string | null;
  elo_hard: number | string | null;
  elo_clay: number | string | null;
  elo_grass: number | string | null;
  atp_rank: number | null;
  updated_at: string | null;
}

/** Ce dont la résolution a besoin côté `tn_players`. */
export interface JoueurAResoudre {
  id: string;
  name: string;
  rank?: number | null;
  elo_overall?: number | string | null;
  elo_hard?: number | string | null;
  elo_clay?: number | string | null;
  elo_grass?: number | string | null;
}

export interface ElosResolus {
  eloOverall: number;
  eloHard: number;
  eloClay: number;
  eloGrass: number;
  source: SourceElo;
  /** Nom Tennis Abstract retenu — permet de repérer une mauvaise correspondance. */
  taName: string | null;
  /** Slug Tennis Abstract retenu — identité exacte du joueur apparié. */
  taSlug: string | null;
  /** Clé ayant permis le rapprochement (diagnostic). */
  via: string | null;
  /** Rang officiel publié par Tennis Abstract, quand il est connu. */
  rangTa: number | null;
  /**
   * Homonymes non départageables, quand `source === 'ambigu'`. Chacun est un
   * `ta_slug` candidat à déclarer dans `ta_name_exceptions`.
   */
  candidats: { slug: string; nom: string; elo: number | null }[];
  /** D'où vient la valeur quand la source TA n'a pas pu être utilisée. */
  repli: 'maison' | 'defaut' | null;
}

export type IndexElo = IndexTa<TaEloRow>;

/** Index vide : aucun Elo TA disponible (table non encore peuplée). */
export const INDEX_ELO_VIDE: IndexElo = {
  parSlug: new Map(),
  parVariante: new Map(),
  exceptions: new Map(),
};

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Charge les Elo Tennis Abstract d'un circuit et construit l'index de
 * rapprochement (exceptions comprises).
 *
 * Ne lève pas si les tables n'existent pas encore : la migration 0002 peut
 * ne pas avoir été jouée, l'app doit continuer de fonctionner sur les Elo
 * maison. Toute autre erreur remonte.
 */
export async function chargerIndexElo(tour: Tour): Promise<IndexElo> {
  const sb = supabaseAnon();
  const t = tour.toLowerCase() as 'atp' | 'wta';

  const [elos, exceptions] = await Promise.all([
    sb
      .from('ta_elo')
      .select(
        'ta_name, ta_name_normalized, ta_slug, country, tour, elo_overall, elo_hard, elo_clay, elo_grass, atp_rank, updated_at',
      )
      .eq('tour', t),
    sb
      .from('ta_name_exceptions')
      .select('atp_name_normalized, ta_name_normalized, ta_slug, tour')
      .eq('tour', t),
  ]);

  // 42P01 : relation inexistante — migration 0002 pas encore appliquée.
  if (elos.error) {
    if (elos.error.code === '42P01') return INDEX_ELO_VIDE;
    throw new Error(`ta_elo : ${elos.error.message}`);
  }
  if (exceptions.error && exceptions.error.code !== '42P01') {
    throw new Error(`ta_name_exceptions : ${exceptions.error.message}`);
  }

  return construireIndex(
    (elos.data ?? []) as TaEloRow[],
    exceptions.data ?? [],
  );
}

/**
 * Les quatre Elo d'un joueur, résolus selon la cascade, avec leur source.
 */
export function resoudreElos(
  joueur: JoueurAResoudre,
  index: IndexElo = INDEX_ELO_VIDE,
): ElosResolus {
  const corr = chercherCorrespondance(index, joueur.name);

  // 1. Tennis Abstract
  if (corr.statut === 'trouve') {
    const taOverall = num(corr.ligne.elo_overall);
    if (taOverall !== null) {
      return {
        eloOverall: taOverall,
        eloHard: num(corr.ligne.elo_hard) ?? taOverall,
        eloClay: num(corr.ligne.elo_clay) ?? taOverall,
        eloGrass: num(corr.ligne.elo_grass) ?? taOverall,
        source: 'ta',
        taName: corr.ligne.ta_name,
        taSlug: corr.ligne.ta_slug,
        via: corr.via,
        rangTa: corr.ligne.atp_rank ?? null,
        candidats: [],
        repli: null,
      };
    }
  }

  // Homonymes non départageables : on N'EN CHOISIT AUCUN. La valeur vient du
  // repli, et la source reste `ambigu` pour que l'écran Picks le signale.
  const candidats =
    corr.statut === 'ambigu'
      ? corr.candidats.map((c) => ({
          slug: c.ta_slug,
          nom: c.ta_name,
          elo: num(c.elo_overall),
        }))
      : [];
  const source: SourceElo | null = corr.statut === 'ambigu' ? 'ambigu' : null;
  const via = corr.statut === 'ambigu' ? corr.via : null;

  // 2. Elo maison. À défaut d'Elo calculé, un Elo dérivé du classement reste
  //    une estimation maison — pas un défaut.
  const maisonOverall =
    num(joueur.elo_overall) ??
    (joueur.rank != null ? eloDepuisRang(joueur.rank) : null);
  if (maisonOverall !== null) {
    return {
      eloOverall: maisonOverall,
      eloHard: num(joueur.elo_hard) ?? maisonOverall,
      eloClay: num(joueur.elo_clay) ?? maisonOverall,
      eloGrass: num(joueur.elo_grass) ?? maisonOverall,
      source: source ?? 'maison',
      taName: null,
      taSlug: null,
      via,
      rangTa: null,
      candidats,
      repli: 'maison',
    };
  }

  // 3. Défaut
  return {
    eloOverall: ELO_DEFAUT_RESOLU,
    eloHard: ELO_DEFAUT_RESOLU,
    eloClay: ELO_DEFAUT_RESOLU,
    eloGrass: ELO_DEFAUT_RESOLU,
    source: source ?? 'defaut',
    taName: null,
    taSlug: null,
    via,
    rangTa: null,
    candidats,
    repli: 'defaut',
  };
}

/** L'Elo d'un ensemble de joueurs, indexé par id. */
export function resoudreElosParJoueur(
  joueurs: JoueurAResoudre[],
  index: IndexElo = INDEX_ELO_VIDE,
): Record<string, ElosResolus> {
  const out: Record<string, ElosResolus> = {};
  for (const j of joueurs) out[j.id] = resoudreElos(j, index);
  return out;
}

export function eloDeSurface(e: ElosResolus, surface: SurfaceElo): number {
  return surface === 'clay' ? e.eloClay : surface === 'grass' ? e.eloGrass : e.eloHard;
}

/**
 * Elo EFFECTIF d'un joueur sur une surface : mélange surface/général au même
 * poids que la simulation. C'est la valeur affichée dans l'écran Picks.
 */
export function resoudreElo(
  joueur: JoueurAResoudre,
  surface: SurfaceElo,
  index: IndexElo = INDEX_ELO_VIDE,
): { valeur: number; source: SourceElo; taName: string | null } {
  const e = resoudreElos(joueur, index);
  return {
    valeur: eloEffectif(e.eloOverall, eloDeSurface(e, surface), POIDS_SURFACE),
    source: e.source,
    taName: e.taName,
  };
}

/** Elo effectif à partir d'une résolution déjà calculée. */
export function eloEffectifResolu(e: ElosResolus, surface: SurfaceElo): number {
  return eloEffectif(e.eloOverall, eloDeSurface(e, surface), POIDS_SURFACE);
}

/** Répartition des sources — alimente le compteur de l'écran Picks. */
export function compterSources(elos: Record<string, ElosResolus>): {
  ta: number;
  maison: number;
  defaut: number;
  ambigu: number;
  total: number;
} {
  const c = { ta: 0, maison: 0, defaut: 0, ambigu: 0, total: 0 };
  for (const e of Object.values(elos)) {
    c[e.source]++;
    c.total++;
  }
  return c;
}

/** Clé de correspondance d'un nom ATP — à coller dans `ta_name_exceptions`. */
export const cleDeNom = normaliserNom;
