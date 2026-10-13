/**
 * JEU DES PICKS — RÈGLES DATÉES. Module PUR (ni Next ni Supabase).
 *
 * Le barème lui-même reste dans lib/scoring.ts ; ce module ne fait que dire,
 * pour un tournoi donné, quelle valeur de ce barème s'applique quand elle a
 * changé en cours de saison. Même principe que `compositionPour`
 * (lib/fantasyRegles.ts) : c'est la `start_date` du tournoi qui choisit, et
 * une règle déjà appliquée n'est jamais modifiée (elle porte l'historique).
 *
 * ⚠ Miroir SQL : `tn_points_forfait` (supabase/migrations/0025). Les deux
 * doivent rester identiques — un test relit la migration pour le vérifier
 * (lib/__tests__/picksRegles.test.ts).
 */

import { POINTS_VICTOIRE } from './scoring';

/* -------------------------------------------------------------------------- */
/*  FORFAIT (w/o) GAGNÉ                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Premier jour (inclus) où un forfait gagné vaut 10 points au jeu des picks :
 * départ du Masters 1000 de Shanghai 2026.
 */
export const DATE_EFFET_FORFAIT_10 = '2026-10-05';

/** Points d'un forfait gagné avant la date d'effet : la victoire simple. */
export const POINTS_FORFAIT_HISTORIQUE = POINTS_VICTOIRE;

/**
 * Points d'un forfait gagné à partir du 2026-10-05, en 3 sets gagnants
 * seulement (les Grands Chelems masculins en 5 sets gardent l'historique).
 * Points secs : ni net sets ni net games, comme avant.
 */
export const POINTS_FORFAIT_2026_10_05 = 10;

/** Ce qu'il faut connaître d'un tournoi pour choisir les points de forfait. */
export interface TournoiPourForfait {
  /** `tn_tournaments.start_date` (AAAA-MM-JJ). */
  start_date: string | null | undefined;
  /** `tn_tournaments.best_of` (3 ou 5). Absent = 3, comme partout ailleurs. */
  best_of: number | null | undefined;
}

/**
 * Points d'un forfait gagné au jeu des picks pour ce tournoi : SEUL point
 * d'accès à la règle, à passer en `ptsForfait` à `scoreMatch`.
 *
 * Date absente ou illisible : règle historique (l'historique ne bouge jamais).
 *
 * Le Fantasy, le Bracket et les équipes figées n'appellent PAS cette fonction :
 * ils gardent le défaut de `scoreMatch` (5 points).
 */
export function pointsForfaitPour(tournoi: TournoiPourForfait): number {
  const jour = tournoi.start_date?.slice(0, 10) ?? '';
  const apres = /^\d{4}-\d{2}-\d{2}$/.test(jour) && jour >= DATE_EFFET_FORFAIT_10;
  const bestOf = tournoi.best_of ?? 3;
  return apres && bestOf === 3 ? POINTS_FORFAIT_2026_10_05 : POINTS_FORFAIT_HISTORIQUE;
}
