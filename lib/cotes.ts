/**
 * COTES BOOKMAKERS — PROBABILITÉS ET SCORES DE CALIBRATION
 *
 * Module PUR, au service d'une seule question : le marché apporte-t-il quelque
 * chose à l'Elo ? Il ne touche ni aux picks, ni au fantasy, ni à la simulation
 * — c'est un instrument de mesure, pas un composant du moteur.
 *
 * Quatre méthodes sont mises en concurrence sur les mêmes matchs :
 *   - Elo seul   — `pVictoire` (lib/elo.ts), ce que fait l'app aujourd'hui ;
 *   - cotes seules — le consensus du marché, dévigorisé ;
 *   - blend 50/50 — `blendAvecCotes` (lib/elo.ts) à poids égaux ;
 *   - blend 30/70 — le même, penché vers le marché, pour voir si peser
 *     davantage les cotes calibre mieux que l'équilibre.
 *
 * Elles sont jugées au score de Brier et à la log-loss, tous deux « plus bas
 * = mieux ». Les deux répondent à des questions différentes et c'est pourquoi
 * on affiche les deux : Brier mesure l'écart quadratique moyen, la log-loss
 * punit très durement une prédiction confiante et fausse. Une méthode qui
 * gagne sur les deux gagne vraiment.
 */

import { blendAvecCotes, POIDS_ELO_MARCHE, probasDepuisCotes, type ProbabiliteMatch } from './elo';

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

/* -------------------------------------------------------------------------- */
/*  BLEND DE PRODUCTION — Picks, Fantasy, Prédictions, Bracket                 */
/*                                                                              */
/*  Jusqu'ici les cotes ne nourrissaient que /calibration/cotes, un écran de   */
/*  MESURE isolé (rien n'était branché). Ce qui suit est le branchement en     */
/*  production, sur le même principe partout : une cote n'influence un calcul */
/*  QUE si elle est UTILISABLE pour ce match précis — appariée aux DEUX        */
/*  joueurs, ET capturée avant le coup d'envoi annoncé (jamais une cote live,  */
/*  qui a déjà vu une partie du match se jouer — c'est le même biais de        */
/*  look-ahead que l'Elo courant, cf. supabase/elo-historique.ts). Sans cote   */
/*  utilisable pour un duel donné : repli SILENCIEUX sur l'Elo seul, jamais    */
/*  un calcul bloqué ou dégradé faute de cotes.                                */
/* -------------------------------------------------------------------------- */

/** Ce qu'il faut d'une ligne de cote pour l'indexer — cf. `supabase/cotes.ts` `LigneCote`. */
export interface CoteMatch {
  playerAId: string | null;
  playerBId: string | null;
  /** P(playerAId gagne), déjà dévigorisée. null : aucun consensus (0 bookmaker apparié). */
  probaA: number | null;
  /** Coup d'envoi annoncé par le bookmaker. null : ne peut pas être jugée antérieure, écartée par prudence. */
  commenceTime: string | null;
  /** Quand CETTE cote a été mise en cache — ISO, comparable lexicographiquement à `commenceTime`. */
  recupereLe: string;
}

/**
 * Une cote est-elle utilisable en production : appariée aux deux joueurs, un
 * consensus existe, et capturée STRICTEMENT AVANT le coup d'envoi — jamais
 * une cote live.
 */
export function coteUtilisable(c: CoteMatch): boolean {
  return (
    c.playerAId !== null &&
    c.playerBId !== null &&
    c.probaA !== null &&
    c.commenceTime !== null &&
    c.recupereLe < c.commenceTime
  );
}

/** Clé de paire non orientée — un même duel se retrouve quel que soit l'ordre demandé. */
function clePaire(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface IndexCotes {
  /** P(idA gagne), orientée dans le sens demandé. null : pas de cote utilisable pour ce duel précis. */
  probabiliteA(idA: string, idB: string): number | null;
  /** Nombre de duels effectivement indexés (appariés + datés) — pour la traçabilité. */
  readonly taille: number;
}

/** Indexe les cotes UTILISABLES (cf. `coteUtilisable`) d'un tournoi, par paire de joueurs. */
export function indexerCotes(cotes: readonly CoteMatch[]): IndexCotes {
  const parPaire = new Map<string, { idA: string; probaA: number }>();
  for (const c of cotes) {
    if (!coteUtilisable(c)) continue;
    parPaire.set(clePaire(c.playerAId!, c.playerBId!), { idA: c.playerAId!, probaA: c.probaA! });
  }
  return {
    probabiliteA(idA, idB) {
      const l = parPaire.get(clePaire(idA, idB));
      if (!l) return null;
      return l.idA === idA ? l.probaA : 1 - l.probaA;
    },
    taille: parPaire.size,
  };
}

/**
 * Construit la fonction de probabilité de production à partir d'un index de
 * cotes déjà chargé : Elo seul par défaut, mélangé au poids `POIDS_ELO_MARCHE`
 * (30 % Elo / 70 % cotes) quand une cote utilisable existe pour CE duel.
 *
 * C'est l'UNIQUE point de branchement du blend — `lib/montecarlo.ts`
 * (Picks/Fantasy/Prédictions, via `supabase/projections.ts`) et
 * `lib/bracket.ts` (Bracket) prennent tous deux une `ProbabiliteMatch` en
 * paramètre et n'ont besoin de rien savoir de plus sur les cotes.
 */
export function creerBlendProduction(
  index: IndexCotes,
  poidsElo: number = POIDS_ELO_MARCHE,
): ProbabiliteMatch {
  return (idA, idB, pEloSeul) => {
    const pCotes = index.probabiliteA(idA, idB);
    return pCotes === null ? pEloSeul : blendAvecCotes(pEloSeul, pCotes, poidsElo);
  };
}
