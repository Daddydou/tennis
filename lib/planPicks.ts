/**
 * PLAN DE PICKS — meilleure répartition des joueurs sur TOUS les slots restants
 * d'un tournoi. Module PUR (ni Next ni Supabase).
 *
 * L'écran Picks actuel recommande tour par tour : il classe les survivants du
 * tour affiché par espérance décroissante. Ce module regarde le tournoi en
 * entier : il résout d'un coup tous les slots restants (algorithme hongrois,
 * cf. optimizerAffectation.ts) sous la contrainte « un joueur ne sert qu'une
 * fois » — ce qui évite d'épuiser les favoris trop tôt.
 *
 * LE PLAN SE RECALCULE. Il n'est jamais figé : après chaque tour, on le
 * relance avec
 *   - les résultats réels (les espérances viennent d'une simulation partant
 *     des survivants du tour, cf. db/projections.ts) ;
 *   - les picks déjà validés, qui sortent du lot (`exclus`).
 * Les picks des tours à venir ne sont que des suggestions : un joueur prévu
 * pour les quarts et éliminé avant disparaît du plan, remplacé par le
 * meilleur choix restant.
 *
 * Entrée : `esperances[joueur][tour]` = E[points | joueur pické à ce tour],
 * INCONDITIONNELLE (elle inclut la probabilité d'être encore en lice).
 */

import { affectationHongroise } from './optimizerAffectation';
import type { Esperances } from './optimizerProbabilites';
import type { Half, Slot } from './types';

export interface EntreePlan {
  /** Slots à planifier (typiquement les slots restants, du tour courant à la finale). */
  slots: Slot[];
  /** E[joueur][tour], depuis l'état actuel du tableau. */
  esperances: Esperances;
  /** Moitié de tableau de chaque joueur (un slot « top » n'accepte que des joueurs du haut). */
  moitie: Record<string, Half>;
  /** Joueurs déjà pickés par ce participant : ne peuvent plus l'être. */
  exclus?: ReadonlySet<string>;
}

export interface PickPlanifie {
  round: string;
  half: Half | null;
  playerId: string;
  /** Espérance de points de ce pick, sur ce tour. */
  ePoints: number;
}

export interface Plan {
  /** Un pick par slot rempli, dans l'ordre des slots donnés. */
  picks: PickPlanifie[];
  /** Somme des espérances du plan. */
  total: number;
  /** Slots sans aucun joueur utile (tous éliminés ou déjà pickés). */
  sansJoueur: Slot[];
}

export interface PickAvecPlanB extends PickPlanifie {
  /**
   * Meilleur remplaçant si ce joueur n'est pas disponible (ou pas souhaité) :
   * le plan est re-résolu sans lui. `perte` = points d'espérance perdus sur
   * l'ENSEMBLE du plan (≥ 0), pas seulement sur ce slot.
   */
  planB: { playerId: string; ePoints: number; perte: number } | null;
}

export interface PlanDetaille extends Plan {
  picks: PickAvecPlanB[];
}

const arrondi = (x: number) => Math.round(x * 100) / 100;

/** Joueurs pouvant rapporter quelque chose sur au moins un des slots. */
function candidats(entree: EntreePlan, interdit?: string): string[] {
  const tours = new Set(entree.slots.map((s) => s.round));
  return Object.keys(entree.esperances).filter((id) => {
    if (id === interdit) return false;
    if (entree.exclus?.has(id)) return false;
    for (const r of tours) if ((entree.esperances[id]?.[r] ?? 0) > 0) return true;
    return false;
  });
}

function resoudre(entree: EntreePlan, interdit?: string): Plan {
  const ids = candidats(entree, interdit);
  const { slots, esperances, moitie } = entree;

  const gains: number[][] = slots.map((slot) =>
    ids.map((id) => {
      if (slot.half && moitie[id] !== slot.half) return 0;
      return esperances[id]?.[slot.round] ?? 0;
    }),
  );

  const affectation = ids.length ? affectationHongroise(gains) : slots.map(() => -1);

  const picks: PickPlanifie[] = [];
  const sansJoueur: Slot[] = [];
  let total = 0;
  slots.forEach((slot, i) => {
    const colonne = affectation[i];
    const gain = colonne >= 0 ? gains[i][colonne] : 0;
    if (colonne < 0 || gain <= 0) {
      sansJoueur.push(slot);
      return;
    }
    total += gain;
    picks.push({ round: slot.round, half: slot.half, playerId: ids[colonne], ePoints: arrondi(gain) });
  });

  return { picks, total: arrondi(total), sansJoueur };
}

/** Le meilleur plan sur les slots donnés. */
export function planifier(entree: EntreePlan): Plan {
  return resoudre(entree);
}

/**
 * Le meilleur plan, avec pour chaque pick son « plan B » : ce que devient le
 * plan si ce joueur n'est pas disponible. Sert à afficher « si tu ne peux pas
 * prendre X, prends Y (−1,8 pt) ».
 */
export function planAvecPlanB(entree: EntreePlan): PlanDetaille {
  const base = resoudre(entree);
  const picks = base.picks.map((p): PickAvecPlanB => {
    const sans = resoudre(entree, p.playerId);
    const remplacant = sans.picks.find((q) => q.round === p.round && q.half === p.half);
    return {
      ...p,
      planB: remplacant
        ? {
            playerId: remplacant.playerId,
            ePoints: remplacant.ePoints,
            perte: Math.max(0, arrondi(base.total - sans.total)),
          }
        : null,
    };
  });
  return { ...base, picks };
}
