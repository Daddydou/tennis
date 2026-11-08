/**
 * CONSEILS POUR UN MASTERS — module PUR. À partir de la simulation (lib/mastersSim.ts), propose :
 *   - le PRONOSTIC qui rapporte le plus de points en espérance (classer les poules, vainqueur des deux
 *     demies, championne) — barème 4 / 2 / 8 / 16, 64 au maximum ;
 *   - les PICKS de chaque tour qui rapportent le plus, en respectant « un joueur une fois par phase »
 *     (trois joueurs différents par poule sur les trois journées ; puis demie et finale, deux joueurs
 *     différents) et les picks déjà posés.
 *
 * Les points espérés sont des moyennes sur des milliers de tournois simulés : ils changent à chaque
 * résultat (les propositions se recalculent à partir de ce qui est déjà joué).
 */
import { POINTS_PRONOSTIC, demisFinales, type Moitie, type PickMasters, type PronosticMasters } from './masters';
import type { ResultatSim, TourSim } from './mastersSim';

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

export interface EsperancePronostic {
  qualifies: number;
  places: number;
  finalistes: number;
  champion: number;
  total: number;
}

/** Points espérés d'un pronostic donné, d'après la simulation. */
export function esperancePronostic(sim: ResultatSim, p: PronosticMasters): EsperancePronostic {
  let qualifies = 0;
  let places = 0;
  for (const classement of [p.classementA, p.classementB]) {
    classement.forEach((id, i) => {
      places += POINTS_PRONOSTIC.placeExacte * (sim.rang[id]?.[i] ?? 0);
      if (i < 2) qualifies += POINTS_PRONOSTIC.qualifie * (sim.top2[id] ?? 0);
    });
  }
  const finalistes = POINTS_PRONOSTIC.finaliste * p.vainqueursDemis.reduce((s, id) => s + (sim.finaliste[id] ?? 0), 0);
  const champion = POINTS_PRONOSTIC.champion * (sim.champion[p.champion] ?? 0);
  return { qualifies, places, finalistes, champion, total: qualifies + places + finalistes + champion };
}

export interface PronosticPropose {
  pronostic: PronosticMasters;
  esperance: EsperancePronostic;
}

/**
 * Le pronostic qui maximise l'espérance de points : on essaie tous les classements des deux poules
 * (24 x 24), et pour chacun les vainqueurs des demies qu'il dessine et la championne (8 choix).
 */
export function proposerPronostic(sim: ResultatSim, poules: { A: string[]; B: string[] }): PronosticPropose {
  let meilleur: PronosticPropose | null = null;
  for (const pa of permutations(poules.A)) {
    for (const pb of permutations(poules.B)) {
      const [d1, d2] = demisFinales([pa[0], pa[1]], [pb[0], pb[1]]);
      for (const w1 of d1) {
        for (const w2 of d2) {
          for (const champion of [w1, w2]) {
            const pronostic: PronosticMasters = { classementA: pa, classementB: pb, vainqueursDemis: [w1, w2], champion };
            const esperance = esperancePronostic(sim, pronostic);
            if (!meilleur || esperance.total > meilleur.esperance.total + 1e-12) meilleur = { pronostic, esperance };
          }
        }
      }
    }
  }
  return meilleur!;
}

/* ------------------------------------------------------------------ */

export interface PickConseille {
  round: TourSim;
  half: Moitie | null;
  playerId: string;
  /** Points espérés de ce pick. */
  ep: number;
  /** Déjà posé (on ne le change pas dans le plan). */
  fixe: boolean;
  /** Les meilleurs autres choix possibles pour ce tour (hors joueurs déjà piqués dans la même phase). */
  alternatives: { playerId: string; ep: number }[];
}

const JOURS = ['J1', 'J2', 'J3'] as const;

/**
 * Plan de picks de tous les tours : pour chaque poule, les trois journées sont affectées à trois joueurs
 * DIFFÉRENTS (affectation optimale) ; puis demie et finale à deux joueurs différents. Les picks déjà posés
 * (`existants`) sont conservés et bloquent leur joueur pour le reste de la phase.
 */
export function proposerPicks(
  sim: ResultatSim,
  poules: { A: string[]; B: string[] },
  existants: PickMasters[],
  /** Valeur qu'on cherche à maximiser pour un pick (par défaut ses points espérés ; voir lib/mastersStrategies.ts). */
  valeur?: (id: string, tour: TourSim) => number,
): PickConseille[] {
  const epVrai = (id: string, tour: TourSim) => sim.ep[id]?.[tour] ?? 0;
  const v = valeur ?? epVrai;
  const ep = epVrai;
  const posé = (round: string, half: Moitie | null) => existants.find((p) => p.round === round && (p.half ?? null) === half)?.playerId ?? null;
  const out: PickConseille[] = [];
  const alternatives = (ids: string[], tour: TourSim, choisi: string, interdits: Set<string>) =>
    ids
      .filter((id) => id !== choisi && !interdits.has(id))
      .sort((a, b) => v(b, tour) - v(a, tour))
      .slice(0, 2)
      .map((id) => ({ playerId: id, ep: ep(id, tour) }));

  // Poules : une affectation par poule.
  const parJour: Record<(typeof JOURS)[number], PickConseille[]> = { J1: [], J2: [], J3: [] };
  for (const [ids, half] of [[poules.A, 'top'], [poules.B, 'bottom']] as [string[], Moitie][]) {
    const fixes = new Map<(typeof JOURS)[number], string>();
    for (const j of JOURS) {
      const p = posé(j, half);
      if (p) fixes.set(j, p);
    }
    const libres = JOURS.filter((j) => !fixes.has(j));
    const dispos = ids.filter((id) => ![...fixes.values()].includes(id));
    let meilleur: { choix: string[]; total: number } | null = null;
    const rec = (k: number, pris: string[], total: number) => {
      if (k === libres.length) {
        if (!meilleur || total > meilleur.total + 1e-12) meilleur = { choix: [...pris], total };
        return;
      }
      for (const id of dispos) {
        if (pris.includes(id)) continue;
        rec(k + 1, [...pris, id], total + v(id, libres[k]));
      }
    };
    rec(0, [], 0);
    const choix = new Map<(typeof JOURS)[number], string>(fixes);
    (meilleur as { choix: string[]; total: number } | null)?.choix.forEach((id, k) => choix.set(libres[k], id));
    for (const j of JOURS) {
      const id = choix.get(j);
      if (!id) continue;
      const interdits = new Set([...fixes.entries()].filter(([jour]) => jour !== j).map(([, v]) => v));
      parJour[j].push({ round: j, half, playerId: id, ep: ep(id, j), fixe: fixes.has(j), alternatives: fixes.has(j) ? [] : alternatives(ids, j, id, interdits) });
    }
  }
  for (const j of JOURS) out.push(...parJour[j]);

  // Phase finale : demie puis finale, deux joueurs différents.
  const tous = [...poules.A, ...poules.B];
  const sf0 = posé('SF', null);
  const f0 = posé('F', null);
  let sf = sf0;
  let f = f0;
  if (!sf0 || !f0) {
    let meilleur: { s: string; f: string; total: number } | null = null;
    for (const s of sf0 ? [sf0] : tous) {
      for (const fi of f0 ? [f0] : tous) {
        if (s === fi) continue;
        const total = v(s, 'SF') + v(fi, 'F');
        if (!meilleur || total > meilleur.total + 1e-12) meilleur = { s, f: fi, total };
      }
    }
    const m = meilleur as { s: string; f: string; total: number } | null;
    sf = m?.s ?? sf0;
    f = m?.f ?? f0;
  }
  if (sf) out.push({ round: 'SF', half: null, playerId: sf, ep: ep(sf, 'SF'), fixe: !!sf0, alternatives: sf0 ? [] : alternatives(tous, 'SF', sf, new Set(f0 ? [f0] : [])) });
  if (f) out.push({ round: 'F', half: null, playerId: f, ep: ep(f, 'F'), fixe: !!f0, alternatives: f0 ? [] : alternatives(tous, 'F', f, new Set(sf0 ? [sf0] : [])) });
  return out;
}
