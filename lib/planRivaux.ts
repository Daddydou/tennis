/**
 * PLAN CONTRE LES RIVAUX — évalue des façons de picker sur des tournois tirés
 * au hasard (cf. planTableau.genererScenarios), pour répondre à deux questions
 * que l'espérance seule ne tranche pas :
 *
 *   1. Quel est le RISQUE d'un plan ? (moyenne, mauvais cas, bon cas) — c'est
 *      ce qui distingue les trois niveaux d'agressivité.
 *   2. Quelle est ma chance de FINIR DEVANT Laki et Thomas ? Et quels picks du
 *      prochain tour la maximisent, compte tenu de LEURS picks déjà posés ?
 *
 * Module PUR : il tourne dans le navigateur, donc la réponse suit chaque clic.
 *
 * HYPOTHÈSES (affichées à l'écran, pas cachées) :
 *   - Un rival dont un slot est encore libre y pose, une fois le tour connu,
 *     son meilleur survivant disponible (l'écran Picks historique).
 *   - Moi, quand le joueur visé par mon plan est éliminé, je prends de même le
 *     meilleur survivant disponible (c'est ce que fait le plan en se recalculant).
 *   - Tous les plans sont jugés sur les MÊMES tournois tirés : l'écart entre
 *     deux plans n'est pas du bruit de tirage.
 */

import { planifier } from './planPicks';
import { indexScenario, type Scenarios, type Tableau } from './planTableau';
import type { Esperances } from './optimizerProbabilites';
import type { Half, Slot } from './types';

export interface PlacePick {
  round: string;
  half: Half | null;
  /** Indice de joueur dans le tableau. */
  joueur: number;
}

export interface Participant {
  cle: string;
  nom: string;
  /** Points déjà acquis aux tours terminés (avant l'ouverture du scénario). */
  base: number;
  /** Picks posés pour les tours encore à jouer (leurs points sont aléatoires). */
  places: PlacePick[];
  /** Slots encore libres, tours à jouer uniquement. */
  slotsLibres: Slot[];
  /** Tous les joueurs déjà pickés par ce participant (ils ne peuvent plus l'être). */
  utilises: ReadonlySet<number>;
}

export interface Contexte {
  t: Tableau;
  sc: Scenarios;
  /** ordre[r] : indices de joueurs par espérance décroissante au tour r. */
  ordre: number[][];
}

export function creerContexte(t: Tableau, sc: Scenarios, esp: Esperances): Contexte {
  const ordre = t.rounds.map((round) =>
    [...t.ids.keys()]
      .filter((j) => (esp[t.ids[j]]?.[round] ?? 0) > 0)
      .sort((a, b) => (esp[t.ids[b]][round] ?? 0) - (esp[t.ids[a]][round] ?? 0)),
  );
  return { t, sc, ordre };
}

/**
 * Points gagnés par un participant sur chaque scénario (hors `base`), s'il
 * vise `cibles[i]` sur son i-ème slot libre (null = laisse le meilleur
 * survivant disponible).
 */
export function totaux(ctx: Contexte, p: Participant, cibles: (number | null)[]): Float64Array {
  const { t, sc, ordre } = ctx;
  const out = new Float64Array(sc.S);
  const parTour: { places: PlacePick[]; libres: { slot: Slot; i: number }[] }[] = t.rounds.map(() => ({
    places: [],
    libres: [],
  }));
  for (const pl of p.places) parTour[t.rounds.indexOf(pl.round)]?.places.push(pl);
  p.slotsLibres.forEach((slot, i) => parTour[t.rounds.indexOf(slot.round)]?.libres.push({ slot, i }));

  const pris = new Int32Array(t.n);
  for (let s = 0; s < sc.S; s++) {
    const stamp = s + 1;
    let tot = 0;
    for (let r = sc.r0; r < sc.R; r++) {
      const jour = parTour[r];
      if (!jour) continue;
      for (const pl of jour.places) tot += sc.pts[indexScenario(sc, s, r, pl.joueur)];
      for (const { slot, i } of jour.libres) {
        let choisi = -1;
        const cible = cibles[i];
        if (
          cible !== null &&
          cible !== undefined &&
          sc.vivant[indexScenario(sc, s, r, cible)] === 1 &&
          pris[cible] !== stamp &&
          !p.utilises.has(cible) &&
          (!slot.half || t.moitie[cible] === slot.half)
        ) {
          choisi = cible;
        } else {
          for (const j of ordre[r]) {
            if (pris[j] === stamp || p.utilises.has(j)) continue;
            if (sc.vivant[indexScenario(sc, s, r, j)] !== 1) continue;
            if (slot.half && t.moitie[j] !== slot.half) continue;
            choisi = j;
            break;
          }
        }
        if (choisi >= 0) {
          pris[choisi] = stamp;
          tot += sc.pts[indexScenario(sc, s, r, choisi)];
        }
      }
    }
    out[s] = tot;
  }
  return out;
}

export interface Bilan {
  /** Points totaux attendus du participant (base comprise). */
  moyenne: number;
  /** Mauvais cas : 10 % des tournois font moins. */
  p10: number;
  /** Bon cas : 10 % des tournois font plus. */
  p90: number;
  /** Chance de finir 1er (égalités partagées). null sans rival. */
  pPremier: number | null;
  /** Chance de finir devant chacun des rivaux (égalités = ½). */
  devant: number[];
}

function quantile(tri: Float64Array, q: number): number {
  if (tri.length === 0) return 0;
  const k = Math.min(tri.length - 1, Math.max(0, Math.round(q * (tri.length - 1))));
  return tri[k];
}

/** Totaux (base comprise) des rivaux, calculés UNE fois : leur politique ne dépend pas de la mienne. */
export function totauxRivaux(ctx: Contexte, rivaux: Participant[]): Float64Array[] {
  return rivaux.map((r) => {
    const x = totaux(
      ctx,
      r,
      r.slotsLibres.map(() => null),
    );
    for (let s = 0; s < x.length; s++) x[s] += r.base;
    return x;
  });
}

/** Moyenne, mauvais/bon cas et chances de victoire d'un jeu de picks. */
export function bilan(
  ctx: Contexte,
  moi: Participant,
  cibles: (number | null)[],
  rivauxTot: Float64Array[] = [],
): Bilan {
  const x = totaux(ctx, moi, cibles);
  const S = x.length;
  let somme = 0;
  let premier = 0;
  const devant = rivauxTot.map(() => 0);
  for (let s = 0; s < S; s++) {
    const mien = x[s] + moi.base;
    x[s] = mien;
    somme += mien;
    if (rivauxTot.length) {
      let meilleurRival = -Infinity;
      let ex = 0;
      rivauxTot.forEach((rt, k) => {
        const v = rt[s];
        if (v > meilleurRival) {
          meilleurRival = v;
          ex = 1;
        } else if (v === meilleurRival) ex += 1;
        devant[k] += mien > v ? 1 : mien === v ? 0.5 : 0;
      });
      premier += mien > meilleurRival ? 1 : mien === meilleurRival ? 1 / (1 + ex) : 0;
    }
  }
  const tri = Float64Array.from(x).sort();
  return {
    moyenne: somme / S,
    p10: quantile(tri, 0.1),
    p90: quantile(tri, 0.9),
    pPremier: rivauxTot.length ? premier / S : null,
    devant: devant.map((d) => d / S),
  };
}

/* -------------------------------------------------------------------------- */
/*  Recherche : les picks du prochain tour qui maximisent la chance de gagner   */
/* -------------------------------------------------------------------------- */

export interface Proposition {
  /** Picks visés, un par slot libre de `moi.slotsLibres` (null = rien de jouable). */
  cibles: (number | null)[];
  bilan: Bilan;
}

export interface StatsRival {
  nom: string;
  /** Points totaux attendus (picks posés + meilleur survivant sur les slots libres). */
  moyenne: number;
  p10: number;
  p90: number;
}

export interface ResultatRecherche {
  /** Ce qu'on attend des rivaux, d'après leurs picks posés. */
  rivaux: StatsRival[];
  /** Le plan « espérance » de référence. */
  reference: Proposition;
  /** Les meilleures propositions, la meilleure en premier. */
  propositions: Proposition[];
  /** La proposition recommandée : la meilleure, sauf si son avance sur la référence est dans le bruit. */
  recommandee: Proposition;
}

export interface OptionsRecherche {
  /** Candidats retenus par slot de décision (par espérance). */
  parSlot?: number;
  /** Nombre de propositions renvoyées. */
  garder?: number;
  /** Écart de chance de victoire en dessous duquel on garde la référence (bruit de tirage). */
  seuilBruit?: number;
  /** Picks déjà choisis à l'écran : gardés comme cibles, la recherche porte sur le reste. */
  imposes?: { round: string; half: Half | null; joueur: number }[];
}

/**
 * Cherche, parmi les combinaisons de joueurs pour les slots du PROCHAIN tour à
 * décider, celle qui maximise la chance de finir devant les rivaux. Le reste du
 * plan (tours suivants) est complété au mieux en espérance, et se recalculera.
 */
export function chercherContreRivaux(
  ctx: Contexte,
  moi: Participant,
  rivaux: Participant[],
  esp: Esperances,
  options: OptionsRecherche = {},
): ResultatRecherche {
  const { t } = ctx;
  const M = options.parSlot ?? 6;
  const garder = options.garder ?? 5;
  const seuil = options.seuilBruit ?? 0.01;
  const rivTot = totauxRivaux(ctx, rivaux);
  const statsRivaux: StatsRival[] = rivaux.map((r, k) => {
    const tri = Float64Array.from(rivTot[k]).sort();
    return {
      nom: r.nom,
      moyenne: rivTot[k].reduce((s, x) => s + x, 0) / Math.max(1, rivTot[k].length),
      p10: quantile(tri, 0.1),
      p90: quantile(tri, 0.9),
    };
  });
  const imposes = options.imposes ?? [];
  const estImpose = (s: Slot) => imposes.some((i) => i.round === s.round && i.half === s.half);
  const moitie: Record<string, Half> = {};
  t.ids.forEach((id, j) => (moitie[id] = t.moitie[j]));
  const exclusIds = new Set([...moi.utilises, ...imposes.map((i) => i.joueur)].map((j) => t.ids[j]));

  const planSans = (decides: { slot: Slot; joueur: number }[]) => {
    const restants = moi.slotsLibres.filter((s) => !estImpose(s) && !decides.some((d) => d.slot === s));
    const plan = planifier({
      slots: restants,
      esperances: esp,
      moitie,
      exclus: new Set([...exclusIds, ...decides.map((d) => t.ids[d.joueur])]),
    });
    const cibles: (number | null)[] = moi.slotsLibres.map(() => null);
    for (const i of imposes) {
      const k = moi.slotsLibres.findIndex((s) => s.round === i.round && s.half === i.half);
      if (k >= 0) cibles[k] = i.joueur;
    }
    for (const d of decides) cibles[moi.slotsLibres.indexOf(d.slot)] = d.joueur;
    for (const p of plan.picks) {
      const i = moi.slotsLibres.findIndex((s) => s.round === p.round && s.half === p.half);
      if (i >= 0) cibles[i] = t.ids.indexOf(p.playerId);
    }
    return cibles;
  };

  const reference: Proposition = { cibles: planSans([]), bilan: null as unknown as Bilan };
  reference.bilan = bilan(ctx, moi, reference.cibles, rivTot);

  const aDecider = moi.slotsLibres.filter((s) => !estImpose(s));
  if (aDecider.length === 0) {
    return { rivaux: statsRivaux, reference, propositions: [reference], recommandee: reference };
  }

  const tourDecision = aDecider[0].round;
  const slotsDecision = aDecider.filter((s) => s.round === tourDecision);
  const dejaImposes = new Set(imposes.map((i) => i.joueur));
  const candidatsPar = slotsDecision.map((slot) =>
    [...t.ids.keys()]
      .filter((j) => !moi.utilises.has(j) && !dejaImposes.has(j) && (!slot.half || t.moitie[j] === slot.half))
      .map((j) => ({ j, e: esp[t.ids[j]]?.[tourDecision] ?? 0 }))
      .filter((x) => x.e > 0)
      .sort((a, b) => b.e - a.e)
      .slice(0, M)
      .map((x) => x.j),
  );

  const combos: { slot: Slot; joueur: number }[][] = [];
  const parcourir = (i: number, acc: { slot: Slot; joueur: number }[]) => {
    if (i === slotsDecision.length) {
      combos.push(acc);
      return;
    }
    for (const j of candidatsPar[i]) {
      if (acc.some((d) => d.joueur === j)) continue;
      parcourir(i + 1, [...acc, { slot: slotsDecision[i], joueur: j }]);
    }
  };
  parcourir(0, []);

  const evaluees: Proposition[] = combos.map((c) => {
    const cibles = planSans(c);
    return { cibles, bilan: bilan(ctx, moi, cibles, rivTot) };
  });
  const triees = [...evaluees].sort(
    (a, b) => (b.bilan.pPremier ?? 0) - (a.bilan.pPremier ?? 0) || b.bilan.moyenne - a.bilan.moyenne,
  );
  const meilleure = triees[0] ?? reference;
  const recommandee =
    (meilleure.bilan.pPremier ?? 0) - (reference.bilan.pPremier ?? 0) < seuil ? reference : meilleure;
  return { rivaux: statsRivaux, reference, propositions: triees.slice(0, garder), recommandee };
}
