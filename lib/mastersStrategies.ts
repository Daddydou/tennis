/**
 * STRATÉGIES DE PICKS POUR UN MASTERS — module PUR (comme lib/mastersConseils.ts, dont il réutilise
 * l'affectation « un joueur une fois par phase »).
 *
 * Quatre façons de construire le plan de picks de TOUT le tournoi (les tours à venir compris) :
 *   - prudent   : maximise « espérance − 1 écart-type » (points réguliers, mauvais cas moins mauvais) ;
 *   - equilibre : maximise l'espérance de points (le plan historique de mastersConseils) ;
 *   - audacieux : maximise « espérance + 1 écart-type » (plus de chances de gros score, plus de risque) ;
 *   - rivaux    : choisit les picks qui maximisent la chance de FINIR DEVANT les autres participants
 *                 (Laki, Thomas), d'après LEURS picks déjà posés.
 *
 * Toutes les stratégies sont jugées sur les MÊMES tournois simulés (`sim.points`) : l'écart entre deux
 * plans n'est pas du bruit de tirage. Chaque plan est recalculé à chaque chargement de l'écran, donc après
 * chaque résultat importé (la simulation part de ce qui est déjà joué).
 *
 * HYPOTHÈSES (affichées à l'écran) :
 *   - Un rival à qui il reste des picks à poser joue, pour chacun, son meilleur plan en points espérés.
 *   - Seuls les points des PICKS sont comparés (le pronostic est à part).
 *   - Un tour dont tous les matchs sont joués est fermé : on n'y propose plus rien.
 */
import { K_AGRESSIVITE } from './planEcran';
import type { Moitie, PickMasters } from './masters';
import { proposerPicks, type PickConseille } from './mastersConseils';
import { TOURS_SIM, type ResultatSim, type TourSim } from './mastersSim';

export type StrategieMasters = 'prudent' | 'equilibre' | 'audacieux' | 'rivaux';
export const STRATEGIES_MASTERS: StrategieMasters[] = ['prudent', 'equilibre', 'audacieux', 'rivaux'];

/** Un rival (autre participant) et les picks qu'il a déjà posés. */
export interface RivalMasters {
  nom: string;
  picks: PickMasters[];
}

export interface StatsPlanMasters {
  /** Total des points de picks sur le tournoi (picks déjà posés compris), moyenne sur les tournois simulés. */
  moyenne: number;
  /** Mauvais cas : 1 tournoi sur 10 fait moins que ça. */
  mauvais: number;
  /** Bon cas : 1 tournoi sur 10 fait plus que ça. */
  bon: number;
  /** Chance de finir devant tous les rivaux (une égalité compte pour moitié) ; null sans rival. */
  devant: number | null;
}

export interface PlanMasters {
  strategie: StrategieMasters;
  picks: PickConseille[];
  stats: StatsPlanMasters;
}

export interface StrategiesMasters {
  prudent: PlanMasters;
  equilibre: PlanMasters;
  audacieux: PlanMasters;
  /** null quand il n'y a aucun rival à battre. */
  rivaux: PlanMasters | null;
  rivauxNoms: string[];
}

const JOURS = ['J1', 'J2', 'J3'] as const;
/** Nombre de tournois simulés utilisés pour CHERCHER le meilleur plan contre les rivaux (le bilan, lui, les prend tous). */
const SIMULATIONS_RECHERCHE = 4000;

/** Total des points d'une liste de picks dans chacun des `n` premiers tournois simulés. */
export function totauxDesPicks(sim: ResultatSim, picks: { round: string; playerId: string }[], n = sim.simulations): Float64Array {
  const K = sim.ordre.length;
  const T = TOURS_SIM.length;
  const out = new Float64Array(n);
  for (const p of picks) {
    const j = sim.ordre.indexOf(p.playerId);
    const t = TOURS_SIM.indexOf(p.round as TourSim);
    if (j < 0 || t < 0) continue;
    for (let s = 0; s < n; s++) out[s] += sim.points[(s * K + j) * T + t];
  }
  return out;
}

function quantile(trie: Float64Array, q: number): number {
  return trie[Math.min(trie.length - 1, Math.max(0, Math.floor(q * (trie.length - 1))))];
}

/** Chance que `moi` finisse devant TOUS les rivaux (égalité pour moitié). */
function chanceDevant(moi: Float64Array, rivaux: Float64Array[]): number {
  let score = 0;
  for (let s = 0; s < moi.length; s++) {
    let meilleurRival = -Infinity;
    for (const r of rivaux) if (r[s] > meilleurRival) meilleurRival = r[s];
    score += moi[s] > meilleurRival ? 1 : moi[s] === meilleurRival ? 0.5 : 0;
  }
  return score / moi.length;
}

export function statsDuPlanMasters(sim: ResultatSim, picks: { round: string; playerId: string }[], rivauxTot: Float64Array[]): StatsPlanMasters {
  const tot = totauxDesPicks(sim, picks);
  const trie = Float64Array.from(tot).sort();
  let somme = 0;
  for (const x of tot) somme += x;
  return {
    moyenne: somme / tot.length,
    mauvais: quantile(trie, 0.1),
    bon: quantile(trie, 0.9),
    devant: rivauxTot.length ? chanceDevant(tot, rivauxTot) : null,
  };
}

/** Plan « espérance + k écart-types » : même affectation que le plan historique, avec une autre valeur par pick. */
function planAvecRisque(sim: ResultatSim, poules: { A: string[]; B: string[] }, existants: PickMasters[], k: number, fermes: ReadonlySet<TourSim>): PickConseille[] {
  const valeur = (id: string, tour: TourSim) => (sim.ep[id]?.[tour] ?? 0) + k * (sim.ecart[id]?.[tour] ?? 0);
  return proposerPicks(sim, poules, existants, k === 0 ? undefined : valeur).filter((p) => p.fixe || !fermes.has(p.round));
}

/** Les picks d'un rival : ceux qu'il a posés, plus pour chaque tour encore ouvert son meilleur plan en points espérés. */
export function picksCompletsDuRival(sim: ResultatSim, poules: { A: string[]; B: string[] }, rival: RivalMasters, fermes: ReadonlySet<TourSim>): PickMasters[] {
  return planAvecRisque(sim, poules, rival.picks, 0, fermes).map((p) => ({ round: p.round, half: p.half, playerId: p.playerId }));
}

interface Option {
  picks: PickMasters[];
  pts: Float64Array;
  /** Points espérés des picks de l'option (sert à départager deux options à chance égale). */
  ep: number;
}

function optionsPoule(sim: ResultatSim, ids: string[], half: Moitie, existants: PickMasters[], fermes: ReadonlySet<TourSim>, n: number): Option[] {
  const fixes = new Map<string, string>();
  for (const j of JOURS) {
    const p = existants.find((x) => x.round === j && x.half === half);
    if (p) fixes.set(j, p.playerId);
  }
  const libres = JOURS.filter((j) => !fixes.has(j) && !fermes.has(j));
  const dispos = ids.filter((id) => ![...fixes.values()].includes(id));
  const options: Option[] = [];
  const rec = (k: number, pris: string[]) => {
    if (k === libres.length) {
      const picks = pris.map((id, i): PickMasters => ({ round: libres[i], half, playerId: id }));
      options.push({ picks, pts: totauxDesPicks(sim, picks, n), ep: picks.reduce((s, p) => s + (sim.ep[p.playerId]?.[p.round as TourSim] ?? 0), 0) });
      return;
    }
    for (const id of dispos) if (!pris.includes(id)) rec(k + 1, [...pris, id]);
  };
  rec(0, []);
  return options;
}

function optionsFinale(sim: ResultatSim, tous: string[], existants: PickMasters[], fermes: ReadonlySet<TourSim>, n: number): Option[] {
  const sf0 = existants.find((x) => x.round === 'SF')?.playerId ?? null;
  const f0 = existants.find((x) => x.round === 'F')?.playerId ?? null;
  const sfs: (string | null)[] = !sf0 && !fermes.has('SF') ? tous : [null];
  const fs: (string | null)[] = !f0 && !fermes.has('F') ? tous : [null];
  const options: Option[] = [];
  for (const s of sfs) {
    for (const f of fs) {
      const sf = s ?? sf0;
      const fi = f ?? f0;
      if (sf && fi && sf === fi) continue;
      const picks: PickMasters[] = [];
      if (s) picks.push({ round: 'SF', half: null, playerId: s });
      if (f) picks.push({ round: 'F', half: null, playerId: f });
      options.push({ picks, pts: totauxDesPicks(sim, picks, n), ep: picks.reduce((x, p) => x + (sim.ep[p.playerId]?.[p.round as TourSim] ?? 0), 0) });
    }
  }
  return options;
}

/**
 * Les picks (tours à venir) qui maximisent la chance de finir devant tous les rivaux, par recherche
 * exhaustive sur les affectations permises (un joueur une fois par phase), à chance égale le plus de points espérés.
 */
export function planContreRivaux(
  sim: ResultatSim,
  poules: { A: string[]; B: string[] },
  existants: PickMasters[],
  rivaux: RivalMasters[],
  fermes: ReadonlySet<TourSim>,
): PickConseille[] | null {
  if (rivaux.length === 0) return null;
  const n = Math.min(sim.simulations, SIMULATIONS_RECHERCHE);
  const rivauxTot = rivaux.map((r) => totauxDesPicks(sim, picksCompletsDuRival(sim, poules, r, fermes), n));
  const base = totauxDesPicks(sim, existants, n);
  // d = mon total − celui du meilleur rival, tournoi par tournoi : on cherche à le rendre positif le plus souvent.
  const d0 = new Float64Array(n);
  for (let s = 0; s < n; s++) d0[s] = base[s] - Math.max(...rivauxTot.map((r) => r[s]));

  const tous = [...poules.A, ...poules.B];
  const optA = optionsPoule(sim, poules.A, 'top', existants, fermes, n);
  const optB = optionsPoule(sim, poules.B, 'bottom', existants, fermes, n);
  const optF = optionsFinale(sim, tous, existants, fermes, n);

  let meilleur: { picks: PickMasters[]; score: number; ep: number } | null = null;
  const dA = new Float64Array(n);
  const dAB = new Float64Array(n);
  for (const a of optA) {
    for (let s = 0; s < n; s++) dA[s] = d0[s] + a.pts[s];
    for (const b of optB) {
      for (let s = 0; s < n; s++) dAB[s] = dA[s] + b.pts[s];
      for (const f of optF) {
        let gain = 0;
        for (let s = 0; s < n; s++) {
          const x = dAB[s] + f.pts[s];
          gain += x > 0 ? 1 : x === 0 ? 0.5 : 0;
        }
        const ep = a.ep + b.ep + f.ep;
        if (!meilleur || gain > meilleur.score + 1e-9 || (Math.abs(gain - meilleur.score) <= 1e-9 && ep > meilleur.ep + 1e-9)) {
          meilleur = { picks: [...a.picks, ...b.picks, ...f.picks], score: gain, ep };
        }
      }
    }
  }
  const choisis = new Set((meilleur as { picks: PickMasters[] } | null)?.picks.map((p) => `${p.round}|${p.playerId}`) ?? []);
  // On réutilise l'affectation du plan historique en rendant les picks choisis imbattables : même ordre, mêmes champs.
  const valeur = (id: string, tour: TourSim) => (choisis.has(`${tour}|${id}`) ? 1e6 : 0) + (sim.ep[id]?.[tour] ?? 0);
  return proposerPicks(sim, poules, existants, valeur)
    .filter((p) => p.fixe || !fermes.has(p.round))
    .map((p) => ({ ...p, alternatives: [] }));
}

/** Les quatre plans, avec leurs bilans, sur les mêmes tournois simulés. */
export function planifierStrategies(
  sim: ResultatSim,
  poules: { A: string[]; B: string[] },
  existants: PickMasters[],
  rivaux: RivalMasters[] = [],
  fermes: ReadonlySet<TourSim> = new Set(),
): StrategiesMasters {
  const rivauxTot = rivaux.map((r) => totauxDesPicks(sim, picksCompletsDuRival(sim, poules, r, fermes)));
  const plan = (strategie: StrategieMasters, picks: PickConseille[]): PlanMasters => ({ strategie, picks, stats: statsDuPlanMasters(sim, picks, rivauxTot) });
  const contre = planContreRivaux(sim, poules, existants, rivaux, fermes);
  return {
    prudent: plan('prudent', planAvecRisque(sim, poules, existants, K_AGRESSIVITE.prudent, fermes)),
    equilibre: plan('equilibre', planAvecRisque(sim, poules, existants, K_AGRESSIVITE.equilibre, fermes)),
    audacieux: plan('audacieux', planAvecRisque(sim, poules, existants, K_AGRESSIVITE.audacieux, fermes)),
    rivaux: contre ? plan('rivaux', contre) : null,
    rivauxNoms: rivaux.map((r) => r.nom),
  };
}
