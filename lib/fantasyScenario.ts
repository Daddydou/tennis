/**
 * SIMULATEUR « ET SI » DU FANTASY — probabilités d'un tour ajustées à la
 * main, et leur effet sur le score final projeté de l'équipe DÉJÀ FIGÉE.
 *
 * Module PUR. Rien ici ne recompose l'équipe, ne touche au cache ni ne
 * réinjecte quoi que ce soit dans le moteur : c'est un bac à sable de
 * lecture, dont les réglages disparaissent avec la page.
 *
 * Score final projeté d'un joueur de l'équipe, à partir du tour R :
 *   points RÉELS marqués aux tours avant R (pondérés, cf. detailReelJoueur)
 * + espérance SIMULÉE depuis R (même pondération, bye compris, cf.
 *   detaillerJoueur).
 */

import type { ProbabiliteMatch } from './elo';
import { detaillerJoueur } from './fantasy';

/** Clé d'un duel indépendante de l'ordre des deux joueurs. */
export function cleDuelJoueurs(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Probabilités imposées : `surcharges` associe à un duel (cleDuelJoueurs) la
 * probabilité que le PREMIER joueur de la clé (ordre alphabétique des ids)
 * gagne. Tout autre duel garde la probabilité du modèle `base`.
 */
export function probabiliteAvecSurcharges(
  base: ProbabiliteMatch,
  surcharges: ReadonlyMap<string, number>,
): ProbabiliteMatch {
  if (surcharges.size === 0) return base;
  return (idA, idB, pEloSeul) => {
    const p = surcharges.get(cleDuelJoueurs(idA, idB));
    if (p === undefined) return base(idA, idB, pEloSeul);
    return idA < idB ? p : 1 - p;
  };
}

export interface ProjectionJoueur {
  /** Points réels pondérés des tours strictement avant le tour de départ. */
  acquis: number;
  /** Espérance pondérée du tour de départ à la finale. */
  espere: number;
  total: number;
}

/**
 * Score final projeté d'un joueur de l'équipe.
 *
 * @param reelPondereParTour  points réels pondérés, un par tour (index de `rounds`)
 * @param esperances          espérance BRUTE par tour (sortie de simulerDepuis)
 * @param byes                tours où le joueur est exempté (toursAvecBye)
 */
export function projeterJoueur(
  rounds: string[],
  bareme: number[],
  idxDepart: number,
  reelPondereParTour: number[],
  esperances: Record<string, number> | undefined,
  presence: Record<string, number> | undefined,
  byes: ReadonlySet<string>,
): ProjectionJoueur {
  let acquis = 0;
  for (let i = 0; i < idxDepart; i++) acquis += reelPondereParTour[i] ?? 0;

  const { lignes } = detaillerJoueur(
    rounds,
    bareme,
    (round) => ({ pReach: presence?.[round] ?? 0, points: esperances?.[round] ?? 0 }),
    byes,
  );
  let espere = 0;
  lignes.forEach((l, i) => {
    if (i >= idxDepart) espere += l.pondere;
  });

  return { acquis, espere, total: acquis + espere };
}
