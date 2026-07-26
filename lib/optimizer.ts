/**
 * OPTIMISEUR DE PICKS
 *
 * Problème : N picks sur un tournoi (2 par tour tant qu'il reste deux
 * moitiés de tableau, puis 1), chaque joueur utilisable UNE SEULE FOIS.
 *
 * Le piège : choisir le meilleur joueur disponible à chaque tour est
 * nettement sous-optimal. La stratégie gloutonne épuise les favoris tôt,
 * puis se retrouve avec des joueurs déjà éliminés sur les derniers slots.
 *
 * Backtest Madrid 2026 (216 pts atteignables) :
 *   - glouton avec pénalité ......  51 pts
 *   - glouton sans byes ..........  75 pts
 *   - AFFECTATION GLOBALE ........ 136 pts   <- cette implémentation
 *   - meilleur Elo ............... 127 pts
 *   - classement ................. 108 pts
 *   - aléatoire ..................  93 pts
 *
 * La solution est l'affectation globale (algorithme hongrois) : on résout
 * les N slots simultanément sur la matrice des espérances, ce qui répartit
 * naturellement les joueurs sur toute la durée du tournoi.
 */

import { pVictoire } from './elo';
import { POINTS_VICTOIRE, POINTS_PAR_NET_SET } from './scoring';
import type { Half, Match, Player, Slot } from './types';

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

// ---------------------------------------------------------------------------
// 3. AFFECTATION OPTIMALE (algorithme hongrois)
// ---------------------------------------------------------------------------

/**
 * Algorithme hongrois (Jonker-Volgenant simplifié) pour le problème
 * d'affectation rectangulaire. Maximise la somme des gains.
 *
 * @param gains  Matrice [slot][joueur] des gains.
 * @returns      Pour chaque slot, l'indice du joueur affecté (-1 si aucun).
 */
export function affectationHongroise(gains: number[][]): number[] {
  const nSlots = gains.length;
  if (nSlots === 0) return [];
  const nJoueurs = gains[0].length;
  if (nJoueurs === 0) return new Array(nSlots).fill(-1);

  // On minimise des coûts = -gains
  const n = Math.max(nSlots, nJoueurs);
  const INF = 1e9;
  const cout: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      i < nSlots && j < nJoueurs ? -gains[i][j] : 0
    )
  );

  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(INF);
    const used = new Array(n + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;

      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cout[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }

      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const resultat = new Array(nSlots).fill(-1);
  for (let j = 1; j <= n; j++) {
    const i = p[j] - 1;
    if (i >= 0 && i < nSlots && j - 1 < nJoueurs) {
      resultat[i] = j - 1;
    }
  }
  return resultat;
}

export interface PickPropose {
  round: string;
  half: Half | null;
  playerId: string;
  playerName: string;
  ePoints: number;
}

/**
 * Résout l'affectation optimale joueur → slot sous contrainte d'unicité.
 *
 * C'est LA fonction centrale : elle traite tous les slots simultanément,
 * ce qui évite d'épuiser les favoris en début de tournoi.
 */
export function optimiser(
  esperances: Esperances,
  players: Record<string, Player>,
  slots: Slot[]
): PickPropose[] {
  const ids = Object.keys(esperances);
  if (ids.length === 0) return [];

  // Matrice des gains : lignes = slots, colonnes = joueurs
  const gains: number[][] = slots.map((slot) =>
    ids.map((id) => {
      const j = players[id];
      // Contrainte de moitié de tableau
      if (slot.half && j && j.half !== slot.half) return 0;
      return esperances[id]?.[slot.round] ?? 0;
    })
  );

  const affect = affectationHongroise(gains);

  const out: PickPropose[] = [];
  affect.forEach((colonne, ligne) => {
    if (colonne < 0) return;
    const gain = gains[ligne][colonne];
    if (gain <= 0) return;
    const id = ids[colonne];
    out.push({
      round: slots[ligne].round,
      half: slots[ligne].half,
      playerId: id,
      playerName: players[id]?.name ?? id,
      ePoints: Math.round(gain * 100) / 100,
    });
  });

  const ordre = new Map(slots.map((s, i) => [`${s.round}|${s.half ?? ''}`, i]));
  out.sort(
    (a, b) =>
      (ordre.get(`${a.round}|${a.half ?? ''}`) ?? 99) -
      (ordre.get(`${b.round}|${b.half ?? ''}`) ?? 99)
  );
  return out;
}

/**
 * Coût d'opportunité : combien je perds à picker ce joueur maintenant
 * plutôt qu'à son meilleur tour ?
 *
 * ATTENTION : avec un barème plat (5 pts par victoire quel que soit le tour),
 * cette valeur est presque toujours faible. Ne l'utilise PAS comme pénalité
 * dans le choix — c'était l'erreur de la V1, qui a coûté 85 points au backtest.
 * C'est un indicateur d'affichage, rien de plus.
 */
export function coutOpportunite(
  esperances: Esperances,
  playerId: string,
  roundActuel: string,
  rounds: string[]
): number {
  const e = esperances[playerId] ?? {};
  const actuel = e[roundActuel] ?? 0;
  const idx = rounds.indexOf(roundActuel);
  const futurs = rounds.slice(idx + 1).map((r) => e[r] ?? 0);
  const meilleur = futurs.length ? Math.max(...futurs) : 0;
  return Math.max(0, meilleur - actuel);
}

/**
 * Génère les slots d'un tournoi.
 * 2 picks par tour tant qu'il y a deux moitiés, puis 1 quand il ne reste
 * qu'un match par moitié (demi-finales et finale).
 */
export function genererSlots(rounds: string[]): Slot[] {
  const slots: Slot[] = [];
  const nb = rounds.length;
  rounds.forEach((r, i) => {
    // Les deux derniers tours (SF, F) n'ont qu'un pick
    if (i >= nb - 2) {
      slots.push({ round: r, half: null });
    } else {
      slots.push({ round: r, half: 'top' });
      slots.push({ round: r, half: 'bottom' });
    }
  });
  return slots;
}

/**
 * Recommandations pour UN tour donné, triées par espérance décroissante.
 * C'est ce qu'on affiche dans l'UI avant chaque tour.
 */
export function recommanderPourTour(
  esperances: Esperances,
  players: Record<string, Player>,
  round: string,
  half: Half | null,
  dejaUtilises: Set<string>,
  limite = 10
): { playerId: string; playerName: string; ePoints: number }[] {
  return Object.keys(esperances)
    .filter((id) => {
      if (dejaUtilises.has(id)) return false;
      const p = players[id];
      if (!p) return false;
      if (half && p.half !== half) return false;
      return (esperances[id]?.[round] ?? 0) > 0;
    })
    .map((id) => ({
      playerId: id,
      playerName: players[id].name,
      ePoints: Math.round((esperances[id][round] ?? 0) * 100) / 100,
    }))
    .sort((a, b) => b.ePoints - a.ePoints)
    .slice(0, limite);
}
