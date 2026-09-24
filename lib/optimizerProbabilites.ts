/**
 * OPTIMISEUR — modèle de probabilité (sets, jeux, espérance d'un match) et
 * propagation analytique dans le tableau. Cf. l'en-tête de lib/optimizer.ts,
 * point d'entrée qui réexporte ce fichier.
 */

import { pVictoire } from './elo';
import { POINTS_VICTOIRE, POINTS_PAR_NET_SET } from './scoring';
import type { Match, Player } from './types';

// ---------------------------------------------------------------------------
// 1. MODÈLE DE PROBABILITÉ
// ---------------------------------------------------------------------------

/** Distribution des scores en sets. */
export function distributionSets(
  pSet: number,
  bestOf: 3 | 5 = 3
): Map<string, { won: number; lost: number; p: number }> {
  const q = 1 - pSet;
  const out = new Map<string, { won: number; lost: number; p: number }>();

  if (bestOf === 3) {
    out.set('2-0', { won: 2, lost: 0, p: pSet ** 2 });
    out.set('2-1', { won: 2, lost: 1, p: 2 * pSet ** 2 * q });
    out.set('1-2', { won: 1, lost: 2, p: 2 * pSet * q ** 2 });
    out.set('0-2', { won: 0, lost: 2, p: q ** 2 });
  } else {
    out.set('3-0', { won: 3, lost: 0, p: pSet ** 3 });
    out.set('3-1', { won: 3, lost: 1, p: 3 * pSet ** 3 * q });
    out.set('3-2', { won: 3, lost: 2, p: 6 * pSet ** 3 * q ** 2 });
    out.set('2-3', { won: 2, lost: 3, p: 6 * pSet ** 2 * q ** 3 });
    out.set('1-3', { won: 1, lost: 3, p: 3 * pSet * q ** 3 });
    out.set('0-3', { won: 0, lost: 3, p: q ** 3 });
  }
  return out;
}

/** Recherche binaire : quelle P(set) produit cette P(match) ? */
export function pSetDepuisMatch(pMatch: number, bestOf: 3 | 5 = 3): number {
  let lo = 0.01;
  let hi = 0.99;
  const seuil = Math.floor(bestOf / 2) + 1;

  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const dist = distributionSets(mid, bestOf);
    let p = 0;
    for (const v of dist.values()) if (v.won === seuil) p += v.p;
    if (p < pMatch) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Espérance du différentiel de jeux sur un SET GAGNÉ.
 * Va de 6-0 (+6) à 7-6 (+1). Plus le joueur domine, plus l'écart est large.
 * Calibré sur les distributions réelles ATP.
 */
export function eNetGamesParSetGagne(pSet: number): number {
  return 2.0 + 2.4 * Math.max(0, Math.min(1, pSet));
}

export interface EsperanceMatch {
  pWin: number;
  eMatch: number;
  eNetSets: number;
  eNetGames: number;
  total: number;
}

/** Espérance de points marqués par A contre B, selon le barème du jeu. */
export function esperancePoints(
  eloA: number,
  eloB: number,
  bestOf: 3 | 5 = 3
): EsperanceMatch {
  const pm = pVictoire(eloA, eloB);
  const ps = pSetDepuisMatch(pm, bestOf);
  const dist = distributionSets(ps, bestOf);

  const eMatch = POINTS_VICTOIRE * pm;

  let eNetSets = 0;
  let eNetGames = 0;
  const parSet = eNetGamesParSetGagne(ps);

  for (const v of dist.values()) {
    // Net sets : plancher à 0
    eNetSets += Math.max(0, v.won - v.lost) * POINTS_PAR_NET_SET * v.p;
    // Net games : uniquement sur les sets gagnés
    eNetGames += v.won * parSet * v.p;
  }

  return { pWin: pm, eMatch, eNetSets, eNetGames, total: eMatch + eNetSets + eNetGames };
}

// ---------------------------------------------------------------------------
// 2. PROPAGATION DANS LE TABLEAU
// ---------------------------------------------------------------------------

export type Esperances = Record<string, Record<string, number>>;

/**
 * Calcule E[points | joueur pické au tour R] pour tous les joueurs.
 *
 * Propage les probabilités de qualification tour par tour à partir des
 * affiches connues. N'utilise aucune information du futur — c'est ce que
 * l'on sait au moment du tirage.
 *
 * IMPORTANT : un joueur exempté (bye) ne marque rien à ce tour.
 * L'oublier coûte cher — c'était le bug principal de la V1.
 */
export function calculerEsperances(
  matches: Match[],
  players: Record<string, Player>,
  rounds: string[],
  bestOf: 3 | 5 = 3,
  poidsSurface = 0.6,
  surface: 'hard' | 'clay' | 'grass' = 'clay'
): Esperances {
  const eloDe = (id: string): number => {
    const p = players[id];
    if (!p) return 1500;
    const surf =
      surface === 'clay' ? p.eloClay : surface === 'grass' ? p.eloGrass : p.eloHard;
    return poidsSurface * surf + (1 - poidsSurface) * p.eloOverall;
  };

  // Affiches par tour, byes exclus
  const brackets: Record<string, [string, string][]> = {};
  const avecBye = new Set<string>();

  for (const m of matches) {
    if (m.status === 'bye') {
      for (const p of m.players) if (p.id && !p.isBye) avecBye.add(p.id);
      continue;
    }
    const ids = m.players.filter((p) => p.id && !p.isBye).map((p) => p.id as string);
    if (ids.length === 2) {
      (brackets[m.round] ??= []).push([ids[0], ids[1]]);
    }
  }

  // Probabilité de présence à chaque tour
  const presence: Record<string, Record<string, number>> = {};
  for (const id of Object.keys(players)) presence[id] = {};

  const premier = rounds[0];
  for (const id of Object.keys(players)) presence[id][premier] = 1;
  // Les exemptés sont présents d'office au deuxième tour
  if (rounds.length > 1) {
    for (const id of avecBye) presence[id][rounds[1]] = 1;
  }

  const esp: Esperances = {};

  for (let i = 0; i < rounds.length; i++) {
    const rnd = rounds[i];
    const suivant = i + 1 < rounds.length ? rounds[i + 1] : null;

    for (const [a, b] of brackets[rnd] ?? []) {
      if (!players[a] || !players[b]) continue;

      const pa = presence[a]?.[rnd] ?? 0;
      const pb = presence[b]?.[rnd] ?? 0;
      if (pa <= 0 && pb <= 0) continue;

      const eloA = eloDe(a);
      const eloB = eloDe(b);
      const ea = esperancePoints(eloA, eloB, bestOf);
      const eb = esperancePoints(eloB, eloA, bestOf);

      const poids = pa * pb;
      (esp[a] ??= {})[rnd] = poids * ea.total;
      (esp[b] ??= {})[rnd] = poids * eb.total;

      if (suivant) {
        const pAgagne = pVictoire(eloA, eloB);
        presence[a][suivant] = (presence[a][suivant] ?? 0) + poids * pAgagne;
        presence[b][suivant] = (presence[b][suivant] ?? 0) + poids * (1 - pAgagne);
      }
    }
  }

  // Un exempté ne marque rien au premier tour
  for (const id of avecBye) {
    (esp[id] ??= {})[premier] = 0;
  }

  return esp;
}
