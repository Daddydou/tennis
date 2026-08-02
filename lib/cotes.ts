/**
 * COTES BOOKMAKERS — PROBABILITÉS ET SCORES DE CALIBRATION
 *
 * Module PUR, au service d'une seule question : le marché apporte-t-il quelque
 * chose à l'Elo ? Il ne touche ni aux picks, ni au fantasy, ni à la simulation
 * — c'est un instrument de mesure, pas un composant du moteur.
 *
 * Trois méthodes sont mises en concurrence sur les mêmes matchs :
 *   - Elo seul   — `pVictoire` (lib/elo.ts), ce que fait l'app aujourd'hui ;
 *   - cotes seules — le consensus du marché, dévigorisé ;
 *   - blend      — `blendAvecCotes` (lib/elo.ts), 50/50 au départ.
 *
 * Elles sont jugées au score de Brier et à la log-loss, tous deux « plus bas
 * = mieux ». Les deux répondent à des questions différentes et c'est pourquoi
 * on affiche les deux : Brier mesure l'écart quadratique moyen, la log-loss
 * punit très durement une prédiction confiante et fausse. Une méthode qui
 * gagne sur les deux gagne vraiment.
 */

import { probasDepuisCotes } from './elo';

/** Cote décimale proposée par un bookmaker sur les deux joueurs d'un match. */
export interface CoteBookmaker {
  bookmaker: string;
  coteA: number;
  coteB: number;
}

/**
 * Probabilité dévigorisée que A gagne, pour un bookmaker.
 *
 * `1/cote` inclut la marge du book : les deux probabilités brutes somment à
 * plus de 1 (l'« overround », typiquement 1,05). On normalise, ce qui répartit
 * la marge au prorata — la convention usuelle, et celle que `probasDepuisCotes`
 * applique déjà (lib/elo.ts).
 */
export function probaDevigorisee(coteA: number, coteB: number): number | null {
  if (!Number.isFinite(coteA) || !Number.isFinite(coteB)) return null;
  // Une cote décimale est toujours > 1 : en deçà, la donnée est corrompue et
  // la « probabilité » dépasserait 1.
  if (coteA <= 1 || coteB <= 1) return null;
  return probasDepuisCotes([coteA, coteB])[0];
}

/** Médiane d'une série. Renvoie null sur une série vide. */
export function mediane(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  const t = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
}

/**
 * Consensus du marché sur un match : médiane des probabilités dévigorisées.
 *
 * Médiane et non moyenne : un book en retard sur une blessure, ou dont les
 * cotes sont figées, déplacerait la moyenne alors qu'il ne déplace pas la
 * médiane. Sur deux bookmakers, les deux coïncident.
 */
export function consensusMarche(cotes: CoteBookmaker[]): {
  probaA: number | null;
  bookmakers: number;
} {
  const probas = cotes
    .map((c) => probaDevigorisee(c.coteA, c.coteB))
    .filter((p): p is number => p !== null);
  return { probaA: mediane(probas), bookmakers: probas.length };
}

/* -------------------------------------------------------------------------- */
/*  SCORES DE CALIBRATION                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Une probabilité de 0 ou de 1 rend la log-loss infinie. On borne donc, sans
 * quoi un seul match mal prédit par un bookmaker très confiant rendrait toute
 * comparaison impossible à lire.
 */
const EPS = 1e-6;

const borner = (p: number) => Math.min(1 - EPS, Math.max(EPS, p));

/** Score de Brier d'une prédiction : (p − issue)². Plus bas, mieux c'est. */
export function brier(p: number, gagne: boolean): number {
  const y = gagne ? 1 : 0;
  return (p - y) ** 2;
}

/** Log-loss d'une prédiction. Plus bas, mieux c'est. */
export function logLoss(p: number, gagne: boolean): number {
  const q = borner(p);
  return gagne ? -Math.log(q) : -Math.log(1 - q);
}

/** Une prédiction évaluable : la probabilité annoncée, et ce qui est arrivé. */
export interface Prediction {
  /** P(le joueur A gagne), selon la méthode évaluée. */
  p: number;
  /** A a-t-il réellement gagné ? */
  gagne: boolean;
}

export interface ScoreMethode {
  methode: string;
  n: number;
  brier: number;
  logLoss: number;
  /** Part des matchs où le favori annoncé l'a emporté. */
  exactitude: number;
}

/**
 * Agrège les scores d'une méthode.
 *
 * Brier et log-loss sont indifférents à l'orientation : évaluer « P(A gagne) »
 * ou « P(B gagne) » sur le même match donne la même valeur. On peut donc
 * fixer une orientation quelconque, pourvu qu'elle soit la même pour les trois
 * méthodes — c'est la seule chose qui compte pour les comparer.
 */
export function scorerMethode(
  methode: string,
  predictions: Prediction[],
): ScoreMethode {
  const n = predictions.length;
  if (n === 0) return { methode, n: 0, brier: 0, logLoss: 0, exactitude: 0 };

  let sb = 0;
  let sl = 0;
  let bons = 0;
  for (const { p, gagne } of predictions) {
    sb += brier(p, gagne);
    sl += logLoss(p, gagne);
    // Une prédiction à exactement 0,5 ne désigne aucun favori : elle ne compte
    // ni comme réussie ni comme ratée.
    if (p !== 0.5 && (p > 0.5) === gagne) bons += 1;
  }
  return {
    methode,
    n,
    brier: sb / n,
    logLoss: sl / n,
    exactitude: bons / n,
  };
}

/**
 * Écart relatif d'une méthode par rapport à une référence, en pourcentage.
 * Négatif = meilleur que la référence (le score étant « plus bas = mieux »).
 */
export function ecartRelatif(valeur: number, reference: number): number | null {
  if (!Number.isFinite(reference) || reference === 0) return null;
  return (valeur / reference - 1) * 100;
}
