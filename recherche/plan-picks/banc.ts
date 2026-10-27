/**
 * BANC D'ESSAI — STRATÉGIES DE PICKS SUR TOUT LE TOURNOI
 *
 * Compare, sur les mêmes tournois, plusieurs façons de répartir ses picks :
 *   - glouton   : l'écran actuel — à chaque tour, le meilleur survivant disponible ;
 *   - elo       : le survivant au meilleur Elo (repère naïf) ;
 *   - statique  : un plan global calculé UNE fois au tirage, suivi tel quel ;
 *   - recalcule : un plan global recalculé au début de CHAQUE tour (résultats
 *                 réels + picks déjà posés), seul le tour courant est joué.
 *
 * Deux façons de mesurer :
 *   - `tirerScenario` : le tournoi est tiré au hasard selon le modèle Elo (des
 *     milliers de fois) → l'espérance de chaque stratégie, sans bruit de
 *     tirage, mais DANS le modèle ;
 *   - `scenarioReel` : le tournoi réellement joué → points réellement
 *     marqués, bruités (un seul tirage par tournoi) mais sans modèle.
 *
 * Aucune stratégie ne voit le futur : à l'ouverture du tour r, elle ne connaît
 * que les survivants de ce tour (et les picks déjà posés).
 */

import { creerRandom, simulerMatch } from '../../lib/montecarloTournoi';
import type { Esperances } from '../../lib/optimizerProbabilites';
import { propager, type Tableau } from '../../lib/planTableau';
import { planifier } from '../../lib/planPicks';
import { pointsAtRound } from '../../lib/scoring';
import type { Half, Match, Slot } from '../../lib/types';

// Le modèle de tournoi (tableau, espérances exactes) vit maintenant dans
// lib/planTableau.ts, partagé avec l'écran Picks ; le banc le réutilise.
export { creerTableau as construireTableau, propager, type Tableau } from '../../lib/planTableau';

/* -------------------------------------------------------------------------- */
/*  Scénarios                                                                  */
/* -------------------------------------------------------------------------- */

export interface Scenario {
  /** survivants[r] : positions à l'ouverture du tour r (bye = null). */
  survivants: (number | null)[][];
  /** points[r][joueur] : points réellement marqués au tour r. */
  points: Float64Array[];
}

/** Un tournoi tiré au hasard selon le modèle. */
export function tirerScenario(t: Tableau, rnd: () => number): Scenario {
  return tirerDepuis(t, t.grille, 0, rnd);
}

/**
 * La fin d'un tournoi tirée au hasard, à partir des survivants `depart` de
 * l'ouverture du tour `r0`. Les tours avant `r0` restent vides.
 */
export function tirerDepuis(
  t: Tableau,
  depart: (number | null)[],
  r0: number,
  rnd: () => number,
): Scenario {
  const survivants: (number | null)[][] = [];
  const points: Float64Array[] = [];
  let actuels = [...depart];
  for (let r = 0; r < r0; r++) {
    survivants.push([]);
    points.push(new Float64Array(t.n));
  }
  for (let r = r0; r < t.rounds.length; r++) {
    survivants.push(actuels);
    const pts = new Float64Array(t.n);
    const suivants: (number | null)[] = [];
    for (let i = 0; i < actuels.length; i += 2) {
      const a = actuels[i];
      const b = actuels[i + 1] ?? null;
      if (a !== null && b === null) suivants.push(a);
      else if (b !== null && a === null) suivants.push(b);
      else if (a === null || b === null) suivants.push(null);
      else {
        const res = simulerMatch(t.elo[a], t.elo[b], t.bestOf, rnd);
        pts[a] = res.ptsA;
        pts[b] = res.ptsB;
        suivants.push(res.gagnantEstA ? a : b);
      }
    }
    points.push(pts);
    actuels = suivants;
  }
  return { survivants, points };
}

/** Le tournoi réellement joué, ou null si ses données sont incomplètes. */
export function scenarioReel(t: Tableau, matches: Match[]): Scenario | null {
  const survivants: (number | null)[][] = [];
  const points: Float64Array[] = [];
  let actuels = [...t.grille];
  for (let r = 0; r < t.rounds.length; r++) {
    const round = t.rounds[r];
    survivants.push(actuels);
    const pts = new Float64Array(t.n);
    const suivants: (number | null)[] = [];
    for (let i = 0; i < actuels.length; i += 2) {
      const a = actuels[i];
      const b = actuels[i + 1] ?? null;
      if (a !== null && b === null) {
        suivants.push(a);
        continue;
      }
      if (b !== null && a === null) {
        suivants.push(b);
        continue;
      }
      if (a === null || b === null) {
        suivants.push(null);
        continue;
      }
      const m = matches.find(
        (x) =>
          x.round === round &&
          x.players.some((j) => j.id === t.ids[a]) &&
          x.players.some((j) => j.id === t.ids[b]) &&
          x.players.some((j) => j.winner),
      );
      if (!m) return null;
      const vainqueur = m.players.find((j) => j.winner)?.id;
      if (!vainqueur) return null;
      pts[a] = pointsAtRound(matches, t.ids[a], round, t.bestOf);
      pts[b] = pointsAtRound(matches, t.ids[b], round, t.bestOf);
      suivants.push(vainqueur === t.ids[a] ? a : b);
    }
    points.push(pts);
    actuels = suivants;
  }
  return { survivants, points };
}

/* -------------------------------------------------------------------------- */
/*  Stratégies                                                                 */
/* -------------------------------------------------------------------------- */

export interface Etat {
  t: Tableau;
  /** Indice du tour courant. */
  r: number;
  survivants: (number | null)[];
  utilises: ReadonlySet<number>;
  slotsDuTour: Slot[];
  slotsRestants: Slot[];
  /** E[joueur][tour] depuis cet état (inconditionnelle). */
  esp: Esperances;
}

/** Un pick (indice de joueur, ou null si rien de jouable) par slot du tour. */
export type Politique = (e: Etat) => (number | null)[];

const cleSlot = (s: Slot) => `${s.round}|${s.half ?? ''}`;

function meilleur(e: Etat, slot: Slot, valeur: (j: number) => number, pris: Set<number>): number | null {
  let best: number | null = null;
  let bestV = -Infinity;
  for (const j of e.survivants) {
    if (j === null || e.utilises.has(j) || pris.has(j)) continue;
    if (slot.half && e.t.moitie[j] !== slot.half) continue;
    const v = valeur(j);
    if (v > bestV) {
      bestV = v;
      best = j;
    }
  }
  return best;
}

const espAuTour = (e: Etat) => (j: number) => e.esp[e.t.ids[j]]?.[e.t.rounds[e.r]] ?? 0;

/** L'écran actuel : meilleur survivant disponible, tour par tour. */
export const glouton: Politique = (e) => {
  const pris = new Set<number>();
  return e.slotsDuTour.map((s) => {
    const j = meilleur(e, s, espAuTour(e), pris);
    if (j !== null) pris.add(j);
    return j;
  });
};

/** Repère naïf : le survivant au meilleur Elo. */
export const eloMax: Politique = (e) => {
  const pris = new Set<number>();
  return e.slotsDuTour.map((s) => {
    const j = meilleur(e, s, (k) => e.t.elo[k], pris);
    if (j !== null) pris.add(j);
    return j;
  });
};

function planEtPicks(e: Etat, esperances: Esperances, exclus: Set<number>, slots: Slot[]) {
  const moitie: Record<string, Half> = {};
  e.t.ids.forEach((id, j) => (moitie[id] = e.t.moitie[j]));
  return planifier({
    slots,
    esperances,
    moitie,
    exclus: new Set([...exclus].map((j) => e.t.ids[j])),
  });
}

/** Repli quand le joueur prévu n'est plus là : le meilleur disponible du slot. */
function completerParGlouton(e: Etat, voulus: (number | null)[]): (number | null)[] {
  const pris = new Set<number>(voulus.filter((j): j is number => j !== null));
  return voulus.map((j, i) => {
    if (j !== null) return j;
    const k = meilleur(e, e.slotsDuTour[i], espAuTour(e), pris);
    if (k !== null) pris.add(k);
    return k;
  });
}

/** Un plan global calculé une fois au tirage, suivi tel quel (repli glouton). */
export function creerStatique(t: Tableau): Politique {
  const departEsp = propager(t, t.grille, 0);
  const moitie: Record<string, Half> = {};
  t.ids.forEach((id, j) => (moitie[id] = t.moitie[j]));
  const plan = planifier({ slots: t.slots, esperances: departEsp, moitie });
  const voulu = new Map(plan.picks.map((p) => [`${p.round}|${p.half ?? ''}`, t.ids.indexOf(p.playerId)]));
  return (e) => {
    const vivants = new Set(e.survivants.filter((j): j is number => j !== null));
    const choix = e.slotsDuTour.map((s) => {
      const j = voulu.get(cleSlot(s));
      return j !== undefined && vivants.has(j) && !e.utilises.has(j) ? j : null;
    });
    return completerParGlouton(e, choix);
  };
}

/** Plan global recalculé à l'ouverture de chaque tour ; seul le tour courant est joué. */
export const recalcule: Politique = (e) => {
  const plan = planEtPicks(e, e.esp, new Set(e.utilises), e.slotsRestants);
  const idx = new Map(e.t.ids.map((id, j) => [id, j]));
  const choix = e.slotsDuTour.map((s) => {
    const p = plan.picks.find((q) => q.round === s.round && q.half === s.half);
    return p ? (idx.get(p.playerId) ?? null) : null;
  });
  return completerParGlouton(e, choix);
};

/**
 * Plan recalculé + « valeur d'attente » estimée par simulation.
 *
 * Le plan global compte un joueur gardé pour plus tard à sa valeur
 * inconditionnelle, alors qu'au moment venu on choisira parmi les survivants :
 * garder un bon joueur vaut un peu plus que ça. Ici, pour chaque slot du tour
 * on essaie quelques candidats ; pour chacun on tire `K` fins de tournoi et on
 * y rejoue `recalcule` ; on garde le candidat dont (points attendus ce tour +
 * points moyens des tours suivants) est le plus haut. Mêmes tirages pour tous
 * les candidats, pour que l'écart entre eux ne soit pas du bruit.
 */
export function creerRollout(K = 64, M = 4, graine = 11): Politique {
  const rnd = creerRandom(graine);
  return (e) => {
    const { t, r } = e;
    const nbTours = t.rounds.length;
    const base = recalcule(e);
    if (r >= nbTours - 1) return base;

    const subs = Array.from({ length: K }, () => tirerDepuis(t, e.survivants, r, rnd));
    const espSub: (Esperances | undefined)[][] = subs.map(() => []);
    const espDe = (k: number, rr: number) => (espSub[k][rr] ??= propager(t, subs[k].survivants[rr], rr));

    const futur = (k: number, deja: Set<number>): number => {
      const util = new Set(deja);
      let tot = 0;
      for (let rr = r + 1; rr < nbTours; rr++) {
        const picks = recalcule({
          t,
          r: rr,
          survivants: subs[k].survivants[rr],
          utilises: util,
          slotsDuTour: t.slots.filter((s) => s.round === t.rounds[rr]),
          slotsRestants: t.slots.filter((s) => t.rounds.indexOf(s.round) >= rr),
          esp: espDe(k, rr),
        });
        for (const j of picks) {
          if (j === null) continue;
          util.add(j);
          tot += subs[k].points[rr][j];
        }
      }
      return tot;
    };

    const choix = [...base];
    e.slotsDuTour.forEach((slot, i) => {
      const dejaPrisCeTour = new Set(choix.filter((j, q): j is number => j !== null && q !== i));
      const classes = e.survivants
        .filter((j): j is number => j !== null && !e.utilises.has(j) && !dejaPrisCeTour.has(j))
        .filter((j) => !slot.half || t.moitie[j] === slot.half)
        .sort((a, b) => espAuTour(e)(b) - espAuTour(e)(a))
        .slice(0, M);
      const candidats = new Set<number>(classes);
      if (base[i] !== null) candidats.add(base[i] as number);

      let meilleurJ: number | null = choix[i];
      let meilleurV = -Infinity;
      for (const c of candidats) {
        const util = new Set(e.utilises);
        for (const j of dejaPrisCeTour) util.add(j);
        util.add(c);
        let somme = 0;
        for (let k = 0; k < K; k++) somme += futur(k, util);
        const v = espAuTour(e)(c) + somme / K;
        if (v > meilleurV) {
          meilleurV = v;
          meilleurJ = c;
        }
      }
      choix[i] = meilleurJ;
    });
    return choix;
  };
}

/* -------------------------------------------------------------------------- */
/*  Exécution                                                                  */
/* -------------------------------------------------------------------------- */

/** Points totaux d'une stratégie sur un scénario. */
export function jouer(
  t: Tableau,
  sc: Scenario,
  politique: Politique,
  espParTour: Esperances[],
): number {
  const utilises = new Set<number>();
  let total = 0;
  for (let r = 0; r < t.rounds.length; r++) {
    const slotsRestants = t.slots.filter((s) => t.rounds.indexOf(s.round) >= r);
    const slotsDuTour = t.slots.filter((s) => s.round === t.rounds[r]);
    const picks = politique({
      t,
      r,
      survivants: sc.survivants[r],
      utilises,
      slotsDuTour,
      slotsRestants,
      esp: espParTour[r],
    });
    for (const j of picks) {
      if (j === null) continue;
      utilises.add(j);
      total += sc.points[r][j];
    }
  }
  return total;
}

/** Espérances connues à l'ouverture de chaque tour du scénario (partagées par toutes les stratégies). */
export function espParTourDe(t: Tableau, sc: Scenario): Esperances[] {
  return t.rounds.map((_, r) => propager(t, sc.survivants[r], r));
}

export interface Stats {
  moyenne: number;
  /** Erreur-type de la moyenne. */
  et: number;
}

export interface ResultatSim {
  n: number;
  parPolitique: Record<string, Stats>;
  /** Écart moyen (A − B) sur les MÊMES scénarios, avec son erreur-type. */
  ecarts: Record<string, Stats>;
}

export function simuler(
  t: Tableau,
  politiques: Record<string, Politique>,
  n: number,
  paires: [string, string][],
  graine = 7,
): ResultatSim {
  const rnd = creerRandom(graine);
  const noms = Object.keys(politiques);
  const sommes: Record<string, number[]> = Object.fromEntries(noms.map((k) => [k, [] as number[]]));
  for (let i = 0; i < n; i++) {
    const sc = tirerScenario(t, rnd);
    const esp = espParTourDe(t, sc);
    for (const k of noms) sommes[k].push(jouer(t, sc, politiques[k], esp));
  }
  const stats = (xs: number[]): Stats => {
    const m = xs.reduce((s, x) => s + x, 0) / xs.length;
    const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1);
    return { moyenne: m, et: Math.sqrt(v / xs.length) };
  };
  const ecarts: Record<string, Stats> = {};
  for (const [a, b] of paires) ecarts[`${a} − ${b}`] = stats(sommes[a].map((x, i) => x - sommes[b][i]));
  return { n, parPolitique: Object.fromEntries(noms.map((k) => [k, stats(sommes[k])])), ecarts };
}
