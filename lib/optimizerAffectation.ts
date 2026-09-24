/**
 * OPTIMISEUR — affectation optimale (algorithme hongrois), slots et
 * recommandations par tour. Cf. l'en-tête de lib/optimizer.ts, point d'entrée
 * qui réexporte ce fichier.
 */

import type { Esperances } from './optimizerProbabilites';
import type { Half, Player, Slot } from './types';

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
 * Résout l'affectation optimale joueur → slot sous contrainte d'unicité :
 * tous les slots sont traités simultanément, ce qui évite d'épuiser les
 * favoris en début de tournoi.
 *
 * ⚠ EN RÉSERVE — NON BRANCHÉE. L'application ne l'appelle pas : l'écran Picks
 * travaille TOUR PAR TOUR (`genererSlots` + `recommanderPourTour`, qui classe
 * les survivants du tour affiché par espérance décroissante et grise les
 * joueurs déjà pickés). L'unicité est donc respectée, mais la répartition des
 * favoris sur la durée du tournoi reste à la main de l'utilisateur — c'est
 * exactement ce que le backtest de lib/optimizer.ts mesure comme « glouton ».
 *
 * La fonction est conservée pour un éventuel écran « plan de tournoi » qui
 * proposerait les 12 picks d'un coup ; en l'état, elle n'influence rien.
 * L'algorithme hongrois qu'elle utilise, lui, sert bien en production : c'est
 * `composerEquipe` (lib/fantasy.ts) qui l'appelle pour l'équipe Fantasy.
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
