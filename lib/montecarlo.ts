/**
 * SIMULATION MONTE CARLO
 *
 * Remplace la propagation analytique de calculerEsperances(), qui
 * s'effondre aux tours tardifs : la probabilite qu'un joueur donne
 * atteigne les quarts devient si faible que toutes les esperances
 * tendent vers zero, et l'affectation n'a plus d'information.
 *
 * Ici on simule le tournoi N fois depuis le tirage, en tirant chaque
 * match au sort selon les Elo, et on compte les points reellement
 * marques. L'esperance devient une moyenne empirique, robuste meme
 * quand les probabilites individuelles sont faibles.
 */

import { pVictoire } from './elo';
import { POINTS_VICTOIRE, POINTS_PAR_NET_SET } from './scoring';
import {
  distributionSets,
  pSetDepuisMatch,
  eNetGamesParSetGagne,
  type Esperances,
} from './optimizer';
import type { Match, Player } from './types';

/** Generateur pseudo-aleatoire deterministe (pour des runs reproductibles). */
export function creerRandom(seed = 42): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Tire un score de match au hasard selon les Elo, et retourne les points
 * marques par chacun selon le bareme du jeu.
 */
export function simulerMatch(
  eloA: number,
  eloB: number,
  bestOf: 3 | 5,
  rnd: () => number
): { gagnantEstA: boolean; ptsA: number; ptsB: number } {
  const pm = pVictoire(eloA, eloB);
  const ps = pSetDepuisMatch(pm, bestOf);
  const seuil = Math.floor(bestOf / 2) + 1;

  let setsA = 0;
  let setsB = 0;
  let gamesA = 0; // net games sur sets gagnes par A
  let gamesB = 0;

  while (setsA < seuil && setsB < seuil) {
    if (rnd() < ps) {
      setsA += 1;
      gamesA += tirerNetGames(ps, rnd);
    } else {
      setsB += 1;
      gamesB += tirerNetGames(1 - ps, rnd);
    }
  }

  const gagnantEstA = setsA > setsB;

  const ptsA =
    (gagnantEstA ? POINTS_VICTOIRE : 0) +
    Math.max(0, setsA - setsB) * POINTS_PAR_NET_SET +
    Math.max(0, gamesA);

  const ptsB =
    (!gagnantEstA ? POINTS_VICTOIRE : 0) +
    Math.max(0, setsB - setsA) * POINTS_PAR_NET_SET +
    Math.max(0, gamesB);

  return { gagnantEstA, ptsA, ptsB };
}

/**
 * Tire le differentiel de jeux d'un set gagne.
 * Distribution empirique ATP : 6-4 et 6-3 sont les plus frequents,
 * 6-0 et 7-6 plus rares. On decale selon la domination attendue.
 */
function tirerNetGames(pSet: number, rnd: () => number): number {
  const moyenne = eNetGamesParSetGagne(pSet);
  // Distribution discrete sur {1,2,3,4,5,6} centree sur la moyenne
  const poids = [1, 2, 3, 4, 5, 6].map((d) =>
    Math.exp(-Math.pow(d - moyenne, 2) / 2.5)
  );
  const total = poids.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let i = 0; i < poids.length; i++) {
    r -= poids[i];
    if (r <= 0) return i + 1;
  }
  return 2;
}

export interface ResultatMonteCarlo {
  /** E[points | pické au tour R], moyenne sur toutes les simulations. */
  esperances: Esperances;
  /** P(le joueur atteint ce tour). */
  presence: Record<string, Record<string, number>>;
  simulations: number;
}

/**
 * Simule le tournoi N fois a partir du tirage initial.
 *
 * @param matches  Les matchs du tournoi (seul le premier tour sert de
 *                 point de depart : la suite est simulee).
 * @param players  Joueurs avec leurs Elo.
 * @param rounds   Ordre des tours.
 * @param n        Nombre de simulations (10000 par defaut).
 */
export function simulerTournoi(
  matches: Match[],
  players: Record<string, Player>,
  rounds: string[],
  n = 10000,
  bestOf: 3 | 5 = 3,
  surface: 'hard' | 'clay' | 'grass' = 'clay',
  poidsSurface = 0.6,
  seed = 42
): ResultatMonteCarlo {
  const rnd = creerRandom(seed);

  const eloDe = (id: string): number => {
    const p = players[id];
    if (!p) return 1500;
    const s =
      surface === 'clay' ? p.eloClay : surface === 'grass' ? p.eloGrass : p.eloHard;
    return poidsSurface * s + (1 - poidsSurface) * p.eloOverall;
  };

  // Structure du tableau : pour chaque tour, la liste des affrontements
  // sous forme de paires de positions du tour precedent.
  const premier = rounds[0];
  const matchsPremier = matches
    .filter((m) => m.round === premier)
    .sort((a, b) => a.position - b.position);

  // Participants du premier tour, dans l'ordre des positions.
  // Un bye est represente par null : l'autre joueur passe automatiquement.
  const grille: (string | null)[] = [];
  for (const m of matchsPremier) {
    const [p1, p2] = m.players;
    grille.push(p1.isBye || !p1.id ? null : p1.id);
    grille.push(p2.isBye || !p2.id ? null : p2.id);
  }

  const cumulPoints: Record<string, Record<string, number>> = {};
  const cumulPresence: Record<string, Record<string, number>> = {};

  const ajouter = (
    cible: Record<string, Record<string, number>>,
    id: string,
    round: string,
    v: number
  ) => {
    (cible[id] ??= {})[round] = (cible[id][round] ?? 0) + v;
  };

  for (let sim = 0; sim < n; sim++) {
    let actuels = [...grille];

    for (let r = 0; r < rounds.length; r++) {
      const round = rounds[r];
      const suivants: (string | null)[] = [];

      for (let i = 0; i < actuels.length; i += 2) {
        const a = actuels[i];
        const b = actuels[i + 1];

        // Bye : le joueur passe sans marquer de points
        if (a && !b) {
          ajouter(cumulPresence, a, round, 1);
          suivants.push(a);
          continue;
        }
        if (b && !a) {
          ajouter(cumulPresence, b, round, 1);
          suivants.push(b);
          continue;
        }
        if (!a && !b) {
          suivants.push(null);
          continue;
        }

        // Match reel
        ajouter(cumulPresence, a!, round, 1);
        ajouter(cumulPresence, b!, round, 1);

        const res = simulerMatch(eloDe(a!), eloDe(b!), bestOf, rnd);
        ajouter(cumulPoints, a!, round, res.ptsA);
        ajouter(cumulPoints, b!, round, res.ptsB);

        suivants.push(res.gagnantEstA ? a! : b!);
      }

      actuels = suivants;
      if (actuels.length <= 1) break;
    }
  }

  // Moyennes
  const esperances: Esperances = {};
  const presence: Record<string, Record<string, number>> = {};

  for (const id of Object.keys(cumulPresence)) {
    presence[id] = {};
    esperances[id] = {};
    for (const round of rounds) {
      const nbPresent = cumulPresence[id][round] ?? 0;
      presence[id][round] = nbPresent / n;
      // Esperance inconditionnelle : moyenne sur TOUTES les simulations,
      // y compris celles ou le joueur n'etait pas la (0 point).
      esperances[id][round] = (cumulPoints[id]?.[round] ?? 0) / n;
    }
  }

  return { esperances, presence, simulations: n };
}

/**
 * Variante : simule a partir d'un tour donne, en tenant compte des
 * resultats deja connus. C'est ce qu'on utilise en cours de tournoi.
 *
 * @param roundDepart  Le tour a partir duquel simuler (les tours
 *                     precedents sont pris comme acquis).
 */
export function simulerDepuis(
  matches: Match[],
  players: Record<string, Player>,
  rounds: string[],
  roundDepart: string,
  n = 10000,
  bestOf: 3 | 5 = 3,
  surface: 'hard' | 'clay' | 'grass' = 'clay',
  poidsSurface = 0.6,
  seed = 42
): ResultatMonteCarlo {
  const idx = rounds.indexOf(roundDepart);
  if (idx <= 0) {
    return simulerTournoi(matches, players, rounds, n, bestOf, surface, poidsSurface, seed);
  }

  const roundsRestants = rounds.slice(idx);
  const matchsDepart = matches
    .filter((m) => m.round === roundDepart)
    .sort((a, b) => a.position - b.position);

  // On reconstruit un pseudo-tableau a partir du tour de depart
  const sousMatches: Match[] = matchsDepart.map((m, i) => ({ ...m, position: i }));

  return simulerTournoi(
    [...sousMatches, ...matches.filter((m) => rounds.indexOf(m.round) > idx)],
    players,
    roundsRestants,
    n,
    bestOf,
    surface,
    poidsSurface,
    seed
  );
}
