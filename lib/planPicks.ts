/**
 * PLAN DE PICKS — meilleure répartition des joueurs sur TOUS les slots restants
 * d'un tournoi. Module PUR (ni Next ni Supabase), utilisable côté navigateur.
 *
 * L'écran Picks historique recommande tour par tour : il classe les survivants
 * du tour affiché par espérance décroissante. Ce module regarde le tournoi en
 * entier : il résout d'un coup tous les slots restants (algorithme hongrois,
 * cf. optimizerAffectation.ts) sous la contrainte « un joueur ne sert qu'une
 * fois » — ce qui évite d'épuiser les favoris trop tôt.
 *
 * LE PLAN SE RECALCULE. Il n'est jamais figé : après chaque tour, on le
 * relance avec
 *   - les résultats réels (les espérances viennent d'un état du tableau
 *     reconstruit des survivants du tour, cf. planTableau.ts) ;
 *   - les picks déjà validés, qui sortent du lot (`exclus`) ;
 *   - les picks que l'utilisateur vient de choisir à l'écran (`imposes`) : ils
 *     restent, et le reste du plan s'adapte immédiatement.
 * Les picks des tours à venir ne sont que des suggestions : un joueur prévu
 * pour les quarts et éliminé avant disparaît du plan, remplacé par le
 * meilleur choix restant.
 *
 * AGRESSIVITÉ. Avec `risque = { ecart, k }`, le plan maximise E + k·σ au lieu de
 * E : k < 0 favorise les points réguliers (prudent), k > 0 les paris à forte
 * variance (audacieux). Le total affiché reste l'ESPÉRANCE du plan.
 *
 * Entrée : `esperances[joueur][tour]` = E[points | joueur pické à ce tour],
 * INCONDITIONNELLE (elle inclut la probabilité d'être encore en lice).
 */

import { affectationHongroise } from './optimizerAffectation';
import type { Esperances } from './optimizerProbabilites';
import type { Half, Slot } from './types';

export interface PickImpose {
  round: string;
  half: Half | null;
  playerId: string;
}

export interface EntreePlan {
  /** Slots à planifier (typiquement les slots restants, du tour courant à la finale). */
  slots: Slot[];
  /** E[joueur][tour], depuis l'état actuel du tableau. */
  esperances: Esperances;
  /** Moitié de tableau de chaque joueur (un slot « top » n'accepte que des joueurs du haut). */
  moitie: Record<string, Half>;
  /** Joueurs déjà pickés par ce participant : ne peuvent plus l'être. */
  exclus?: ReadonlySet<string>;
  /** Plan agressif ou prudent : on maximise E + k·σ. Absent = pur espérance. */
  risque?: { ecart: Esperances; k: number };
  /** Picks décidés à l'écran : gardés tels quels, le reste du plan s'adapte. */
  imposes?: PickImpose[];
}

export interface PickPlanifie {
  round: string;
  half: Half | null;
  playerId: string;
  /** Espérance de points de ce pick, sur ce tour. */
  ePoints: number;
  /** Écart-type de ces points (si fourni dans `risque`). */
  ecart?: number;
  /** Pick décidé par l'utilisateur (non recalculé). */
  fixe?: boolean;
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
const cleSlot = (s: { round: string; half: Half | null }) => `${s.round}|${s.half ?? ''}`;

/** Grand décalage : tout joueur éligible vaut plus qu'un slot vide, quel que soit son risque. */
const DECALAGE = 1000;

/** Joueurs pouvant rapporter quelque chose sur au moins un des slots. */
function candidats(entree: EntreePlan, slots: Slot[], exclus: ReadonlySet<string>, interdit?: string): string[] {
  const tours = new Set(slots.map((s) => s.round));
  return Object.keys(entree.esperances).filter((id) => {
    if (id === interdit) return false;
    if (exclus.has(id)) return false;
    for (const r of tours) if ((entree.esperances[id]?.[r] ?? 0) > 0) return true;
    return false;
  });
}

function resoudre(entree: EntreePlan, interdit?: string): Plan {
  const { esperances, moitie, risque } = entree;

  // 1. Picks imposés : ils sortent du lot, leurs joueurs aussi.
  const imposes = (entree.imposes ?? []).filter((p) => p.playerId !== interdit);
  const clesImposees = new Set(imposes.map(cleSlot));
  const exclus = new Set<string>([...(entree.exclus ?? []), ...imposes.map((p) => p.playerId)]);
  const libres = entree.slots.filter((s) => !clesImposees.has(cleSlot(s)));

  const ids = candidats(entree, libres, exclus, interdit);

  // 2. Le reste, par affectation hongroise.
  const gains: number[][] = libres.map((slot) =>
    ids.map((id) => {
      if (slot.half && moitie[id] !== slot.half) return 0;
      const e = esperances[id]?.[slot.round] ?? 0;
      if (!risque || risque.k === 0) return e;
      if (e <= 0) return 0;
      return DECALAGE + e + risque.k * (risque.ecart[id]?.[slot.round] ?? 0);
    }),
  );
  const affectation = ids.length ? affectationHongroise(gains) : libres.map(() => -1);

  const parSlot = new Map<string, PickPlanifie>();
  const sansJoueur: Slot[] = [];
  libres.forEach((slot, i) => {
    const colonne = affectation[i];
    const id = colonne >= 0 ? ids[colonne] : null;
    const e = id ? (esperances[id]?.[slot.round] ?? 0) : 0;
    const eligible = id !== null && (!slot.half || moitie[id] === slot.half) && e > 0;
    if (!eligible || id === null) {
      sansJoueur.push(slot);
      return;
    }
    parSlot.set(cleSlot(slot), {
      round: slot.round,
      half: slot.half,
      playerId: id,
      ePoints: arrondi(e),
      ...(risque ? { ecart: arrondi(risque.ecart[id]?.[slot.round] ?? 0) } : {}),
    });
  });
  for (const p of imposes) {
    parSlot.set(cleSlot(p), {
      round: p.round,
      half: p.half,
      playerId: p.playerId,
      ePoints: arrondi(esperances[p.playerId]?.[p.round] ?? 0),
      ...(risque ? { ecart: arrondi(risque.ecart[p.playerId]?.[p.round] ?? 0) } : {}),
      fixe: true,
    });
  }

  // 3. Dans l'ordre des slots donnés.
  const picks: PickPlanifie[] = [];
  let total = 0;
  for (const s of entree.slots) {
    const p = parSlot.get(cleSlot(s));
    if (!p) continue;
    picks.push(p);
    total += p.ePoints;
  }
  return { picks, total: arrondi(total), sansJoueur };
}

/** Le meilleur plan sur les slots donnés. */
export function planifier(entree: EntreePlan): Plan {
  return resoudre(entree);
}

/**
 * Le meilleur plan, avec pour chaque pick son « plan B » : ce que devient le
 * plan si ce joueur n'est pas disponible. Sert à afficher « si tu ne peux pas
 * prendre X, prends Y (−1,8 pt) ». Les picks imposés n'ont pas de plan B.
 */
export function planAvecPlanB(entree: EntreePlan): PlanDetaille {
  const base = resoudre(entree);
  const picks = base.picks.map((p): PickAvecPlanB => {
    if (p.fixe) return { ...p, planB: null };
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
