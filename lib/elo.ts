/**
 * ELO TENNIS — CALCUL ET ESTIMATION
 *
 * Deux usages :
 *   1. Elo initial dérivé du classement ATP/WTA (point de départ)
 *   2. Elo calculé match par match depuis tes propres imports (fiable)
 *
 * L'Elo par surface est nettement plus prédictif que le classement :
 * le classement pondère 52 semaines avec des points fixes par tournoi,
 * sans distinction de surface ni de niveau d'adversaire.
 */

import type { Match, Surface, Tour } from './types';

/** Elo de départ pour un joueur inconnu. */
export const ELO_DEFAUT = 1500;

/**
 * Facteur K : vitesse d'ajustement de l'Elo après un match.
 * Formule de Sackmann : décroît avec le nombre de matchs joués,
 * pour que les nouveaux joueurs convergent vite et les vétérans peu.
 */
export function facteurK(matchsJoues: number): number {
  return 250 / Math.pow(matchsJoues + 5, 0.4);
}

/** Probabilité que A batte B selon l'écart Elo. */
export function pVictoire(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

/**
 * Elo effectif = mélange surface / général.
 * Le poids 0.6 sur la surface est le réglage usuel en tennis analytics.
 */
export function eloEffectif(
  eloGeneral: number,
  eloSurface: number | null,
  poidsSurface = 0.6
): number {
  if (eloSurface === null || eloSurface === undefined) return eloGeneral;
  return poidsSurface * eloSurface + (1 - poidsSurface) * eloGeneral;
}

/**
 * Elo initial estimé depuis le classement.
 * Calibrage : n°1 ≈ 2200, n°10 ≈ 1990, n°50 ≈ 1810, n°100 ≈ 1740.
 * Sert de point de départ avant d'avoir assez de matchs importés.
 */
export function eloDepuisRang(rang: number | null): number {
  if (!rang || rang <= 0) return ELO_DEFAUT;
  return Math.max(1400, Math.round(2200 - 180 * Math.pow(rang, 0.35)));
}

export interface EloRecord {
  playerId: string;
  overall: number;
  bySurface: Record<Surface, number>;
  matchesPlayed: number;
  matchesBySurface: Record<Surface, number>;
}

export function nouvelEloRecord(playerId: string, initial = ELO_DEFAUT): EloRecord {
  return {
    playerId,
    overall: initial,
    bySurface: { hard: initial, clay: initial, grass: initial, carpet: initial },
    matchesPlayed: 0,
    matchesBySurface: { hard: 0, clay: 0, grass: 0, carpet: 0 },
  };
}

/**
 * Met à jour l'Elo de deux joueurs après un match.
 * Modifie les records en place et les retourne.
 */
export function majElo(
  gagnant: EloRecord,
  perdant: EloRecord,
  surface: Surface
): [EloRecord, EloRecord] {
  // --- Elo général ---
  const pAttendue = pVictoire(gagnant.overall, perdant.overall);
  const kG = facteurK(gagnant.matchesPlayed);
  const kP = facteurK(perdant.matchesPlayed);

  gagnant.overall += kG * (1 - pAttendue);
  perdant.overall -= kP * (1 - pAttendue);
  gagnant.matchesPlayed += 1;
  perdant.matchesPlayed += 1;

  // --- Elo par surface ---
  const pSurf = pVictoire(gagnant.bySurface[surface], perdant.bySurface[surface]);
  const kGs = facteurK(gagnant.matchesBySurface[surface]);
  const kPs = facteurK(perdant.matchesBySurface[surface]);

  gagnant.bySurface[surface] += kGs * (1 - pSurf);
  perdant.bySurface[surface] -= kPs * (1 - pSurf);
  gagnant.matchesBySurface[surface] += 1;
  perdant.matchesBySurface[surface] += 1;

  return [gagnant, perdant];
}

/**
 * Calcule les Elo sur un ensemble de tournois importés.
 *
 * IMPORTANT : passe les tournois dans l'ordre CHRONOLOGIQUE.
 * L'Elo est séquentiel — l'ordre change le résultat.
 *
 * @param tournois  Liste de { matches, surface }, du plus ancien au plus récent.
 * @param initiaux  Elo de départ par joueur (typiquement dérivés du classement).
 */
export function calculerElos(
  tournois: { matches: Match[]; surface: Surface }[],
  initiaux: Record<string, number> = {}
): Record<string, EloRecord> {
  const records: Record<string, EloRecord> = {};

  const get = (id: string): EloRecord => {
    if (!records[id]) {
      records[id] = nouvelEloRecord(id, initiaux[id] ?? ELO_DEFAUT);
    }
    return records[id];
  };

  for (const { matches, surface } of tournois) {
    // Trier par tour : R128 avant R64, etc.
    const ordre = ordreDesRounds(matches);
    const tries = [...matches].sort(
      (a, b) => (ordre[a.round] ?? 99) - (ordre[b.round] ?? 99) || a.position - b.position
    );

    for (const m of tries) {
      // Byes, matchs non joués et walkovers n'informent pas sur le niveau
      if (m.status === 'bye' || m.status === 'scheduled' || m.status === 'live') continue;
      if (m.status === 'walkover') continue;

      const [p1, p2] = m.players;
      if (!p1.id || !p2.id || p1.isBye || p2.isBye) continue;

      const gagnantId = p1.winner ? p1.id : p2.winner ? p2.id : null;
      if (!gagnantId) continue;
      const perdantId = gagnantId === p1.id ? p2.id : p1.id;

      majElo(get(gagnantId), get(perdantId), surface);
    }
  }

  return records;
}

/**
 * Déduit l'ordre des tours depuis les matchs.
 * Le tour avec le plus de matchs est le premier.
 */
export function ordreDesRounds(matches: Match[]): Record<string, number> {
  const compte: Record<string, number> = {};
  for (const m of matches) {
    compte[m.round] = (compte[m.round] ?? 0) + 1;
  }
  const rounds = Object.keys(compte).sort((a, b) => compte[b] - compte[a]);
  const out: Record<string, number> = {};
  rounds.forEach((r, i) => (out[r] = i));
  return out;
}

/**
 * Blend Elo / cotes bookmakers.
 * Le marché intègre blessures, forme et motivation — invisible pour l'Elo.
 * Un blend 0.7/0.3 bat presque toujours l'Elo seul.
 *
 * @param pElo    Probabilité issue de l'Elo.
 * @param pCotes  Probabilité implicite des cotes (déjà dévigorisée).
 */
export function blendAvecCotes(pElo: number, pCotes: number, poidsElo = 0.7): number {
  return poidsElo * pElo + (1 - poidsElo) * pCotes;
}

/**
 * Convertit une cote décimale en probabilité, en retirant la marge du book.
 * @param cotes  Les deux cotes du match, ex. [1.45, 2.75].
 */
export function probasDepuisCotes(cotes: [number, number]): [number, number] {
  const bruts = [1 / cotes[0], 1 / cotes[1]];
  const somme = bruts[0] + bruts[1];
  return [bruts[0] / somme, bruts[1] / somme];
}
