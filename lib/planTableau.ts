/**
 * TABLEAU DE PLAN — le modèle de match du tournoi, prêt pour les calculs du
 * plan de picks. Module PUR (ni Next ni Supabase) : il tourne aussi bien sur
 * le serveur que dans le navigateur, ce qui rend l'écran Picks réactif (un
 * clic recalcule le plan sans aller-retour réseau).
 *
 * Ce qu'il sait faire :
 *   - `creerTableau`      : joueurs, Elo effectif, moitiés, probabilités de
 *                           duel (Elo seul OU blend Elo/cotes, comme la
 *                           simulation de production), espérance et moment
 *                           d'ordre 2 des points de chaque duel — calculés à
 *                           la demande, une seule fois par duel ;
 *   - `fixer`             : un duel déjà joué (résultat et points réels) ;
 *   - `propagerMoments`   : espérance ET écart-type EXACTS (sans tirage) des
 *                           points de chaque joueur à chaque tour, depuis un
 *                           état du tableau ;
 *   - `genererScenarios`  : la fin du tournoi tirée au hasard S fois, sous
 *                           forme compacte, pour évaluer des stratégies.
 */

import { pVictoire, PROBABILITE_ELO_SEULE, type ProbabiliteMatch } from './elo';
import { tirerNetGames, creerRandom } from './montecarloTournoi';
import {
  distributionSets,
  eNetGamesParSetGagne,
  esperancePointsDepuisP,
  pSetDepuisMatch,
  type Esperances,
} from './optimizerProbabilites';
import { genererSlots } from './optimizerAffectation';
import { POINTS_PAR_NET_SET, POINTS_VICTOIRE } from './scoring';
import type { Half, Match, Player, Slot } from './types';

/** Issue d'un duel (réel ou tiré). `ptsA`/`ptsB` : points du barème du jeu. */
export interface ResultatDuel {
  gagnantEstA: boolean;
  ptsA: number;
  ptsB: number;
}

export interface Tableau {
  rounds: string[];
  bestOf: 3 | 5;
  ids: string[];
  /** Elo effectif (pondéré surface) par indice de joueur. */
  elo: number[];
  moitie: Half[];
  /** Positions du premier tour (indice de joueur, ou null pour un bye). */
  grille: (number | null)[];
  slots: Slot[];
  n: number;
  /** P(a bat b). */
  p(a: number, b: number): number;
  /** P(a gagne un set contre b). */
  ps(a: number, b: number): number;
  /** E[points de a | a joue b]. */
  ep(a: number, b: number): number;
  /** E[points² de a | a joue b]. */
  m2(a: number, b: number): number;
  /** Duel déjà joué ? Alors son résultat réel. */
  fixe(a: number, b: number): ResultatDuel | undefined;
  /** Fige un duel déjà joué (un même duel ne se rejoue jamais dans un tableau). */
  fixer(a: number, b: number, resultat: ResultatDuel): void;
  /** Tire un duel au hasard (ou rend le résultat réel s'il est fixé). */
  tirer(a: number, b: number, rnd: () => number): ResultatDuel;
}

/** Moyenne et variance du différentiel de jeux d'UN set gagné (loi de tirerNetGames). */
function momentsJeux(pSet: number): { m: number; v: number } {
  const centre = eNetGamesParSetGagne(pSet);
  const poids = [1, 2, 3, 4, 5, 6].map((d) => Math.exp(-Math.pow(d - centre, 2) / 2.5));
  const somme = poids.reduce((s, x) => s + x, 0);
  let m = 0;
  let m2 = 0;
  poids.forEach((w, i) => {
    const d = i + 1;
    m += (w / somme) * d;
    m2 += (w / somme) * d * d;
  });
  return { m, v: Math.max(0, m2 - m * m) };
}

/**
 * E[points²] d'un joueur dans un duel où il gagne un set avec la probabilité
 * `ps`. La variance vient de l'issue en sets ET du différentiel de jeux ;
 * la moyenne est calée sur l'espérance analytique `eAnalytique` du moteur,
 * pour que écart-type et espérance parlent du même chiffre.
 */
function secondMoment(ps: number, bestOf: 3 | 5, eAnalytique: number): number {
  const jeux = momentsJeux(ps);
  let e1 = 0;
  let e2 = 0;
  for (const v of distributionSets(ps, bestOf).values()) {
    const moyenne =
      (v.won > v.lost ? POINTS_VICTOIRE : 0) + Math.max(0, v.won - v.lost) * POINTS_PAR_NET_SET + v.won * jeux.m;
    const variance = v.won * jeux.v;
    e1 += v.p * moyenne;
    e2 += v.p * (moyenne * moyenne + variance);
  }
  return Math.max(0, e2 - e1 * e1) + eAnalytique * eAnalytique;
}

/** Tout ce qu'il faut pour reconstruire un tableau — sérialisable, donc transportable vers le navigateur. */
export interface SpecTableau {
  ids: string[];
  elo: number[];
  moitie: Half[];
  grille: (number | null)[];
  rounds: string[];
  bestOf: 3 | 5;
  probabiliteMatch?: ProbabiliteMatch;
}

/** Depuis les lignes du tableau et les joueurs du moteur (côté serveur). */
export function specDepuisMatches(
  matches: Match[],
  players: Record<string, Player>,
  rounds: string[],
  bestOf: 3 | 5,
  surface: 'hard' | 'clay' | 'grass',
  poidsSurface = 0.6,
  probabiliteMatch?: ProbabiliteMatch,
): SpecTableau {
  const eloDe = (id: string): number => {
    const pl = players[id];
    if (!pl) return 1500;
    const s = surface === 'clay' ? pl.eloClay : surface === 'grass' ? pl.eloGrass : pl.eloHard;
    return poidsSurface * s + (1 - poidsSurface) * pl.eloOverall;
  };

  const premiers = matches.filter((m) => m.round === rounds[0]).sort((a, b) => a.position - b.position);
  const ids: string[] = [];
  const indice = new Map<string, number>();
  const prendre = (id: string): number => {
    let i = indice.get(id);
    if (i === undefined) {
      i = ids.length;
      ids.push(id);
      indice.set(id, i);
    }
    return i;
  };
  const grille: (number | null)[] = [];
  for (const m of premiers) {
    for (const j of m.players) grille.push(j.isBye || !j.id ? null : prendre(j.id));
  }
  // Un joueur absent du premier tour mais présent plus loin (repêchage…) reste
  // adressable : on l'ajoute après coup.
  for (const m of matches) for (const j of m.players) if (j.id && !j.isBye) prendre(j.id);

  const moitie: Half[] = new Array(ids.length).fill('top');
  grille.forEach((g, pos) => {
    if (g !== null) moitie[g] = pos < grille.length / 2 ? 'top' : 'bottom';
  });

  return { ids, elo: ids.map(eloDe), moitie, grille, rounds, bestOf, probabiliteMatch };
}

export function creerTableau(
  matches: Match[],
  players: Record<string, Player>,
  rounds: string[],
  bestOf: 3 | 5,
  surface: 'hard' | 'clay' | 'grass',
  poidsSurface = 0.6,
  probabiliteMatch: ProbabiliteMatch = PROBABILITE_ELO_SEULE,
): Tableau {
  return creerTableauDepuisSpec(
    specDepuisMatches(matches, players, rounds, bestOf, surface, poidsSurface, probabiliteMatch),
  );
}

export function creerTableauDepuisSpec(spec: SpecTableau): Tableau {
  const { ids, elo, moitie, grille, rounds, bestOf } = spec;
  const probabiliteMatch = spec.probabiliteMatch ?? PROBABILITE_ELO_SEULE;
  const n = ids.length;

  const NAN = Number.NaN;
  const P = new Float64Array(n * n).fill(NAN);
  const PS = new Float64Array(n * n).fill(NAN);
  const EP = new Float64Array(n * n).fill(NAN);
  const M2 = new Float64Array(n * n).fill(NAN);
  const fixes = new Map<number, ResultatDuel>();

  function calculer(a: number, b: number): void {
    const ab = a * n + b;
    const ba = b * n + a;
    const f = fixes.get(ab);
    if (f) {
      P[ab] = f.gagnantEstA ? 1 : 0;
      P[ba] = 1 - P[ab];
      PS[ab] = PS[ba] = 0.5;
      EP[ab] = f.ptsA;
      EP[ba] = f.ptsB;
      M2[ab] = f.ptsA * f.ptsA;
      M2[ba] = f.ptsB * f.ptsB;
      return;
    }
    const pm = probabiliteMatch(ids[a], ids[b], pVictoire(elo[a], elo[b]));
    const ps = pSetDepuisMatch(pm, bestOf);
    const eA = esperancePointsDepuisP(pm, bestOf).total;
    const eB = esperancePointsDepuisP(1 - pm, bestOf).total;
    P[ab] = pm;
    P[ba] = 1 - pm;
    PS[ab] = ps;
    PS[ba] = 1 - ps;
    EP[ab] = eA;
    EP[ba] = eB;
    M2[ab] = secondMoment(ps, bestOf, eA);
    M2[ba] = secondMoment(1 - ps, bestOf, eB);
  }

  const lire = (T: Float64Array, a: number, b: number): number => {
    const k = a * n + b;
    if (Number.isNaN(T[k])) calculer(a, b);
    return T[k];
  };

  const seuil = Math.floor(bestOf / 2) + 1;

  return {
    rounds,
    bestOf,
    ids,
    elo,
    moitie,
    grille,
    slots: genererSlots(rounds),
    n,
    p: (a, b) => lire(P, a, b),
    ps: (a, b) => lire(PS, a, b),
    ep: (a, b) => lire(EP, a, b),
    m2: (a, b) => lire(M2, a, b),
    fixe: (a, b) => fixes.get(a * n + b),
    fixer(a, b, r) {
      fixes.set(a * n + b, r);
      fixes.set(b * n + a, { gagnantEstA: !r.gagnantEstA, ptsA: r.ptsB, ptsB: r.ptsA });
      for (const T of [P, PS, EP, M2]) {
        T[a * n + b] = NAN;
        T[b * n + a] = NAN;
      }
    },
    tirer(a, b, rnd) {
      const f = fixes.get(a * n + b);
      if (f) return f;
      const ps = lire(PS, a, b);
      let setsA = 0;
      let setsB = 0;
      let jeuxA = 0;
      let jeuxB = 0;
      while (setsA < seuil && setsB < seuil) {
        if (rnd() < ps) {
          setsA += 1;
          jeuxA += tirerNetGames(ps, rnd);
        } else {
          setsB += 1;
          jeuxB += tirerNetGames(1 - ps, rnd);
        }
      }
      const gagnantEstA = setsA > setsB;
      return {
        gagnantEstA,
        ptsA: (gagnantEstA ? POINTS_VICTOIRE : 0) + Math.max(0, setsA - setsB) * POINTS_PAR_NET_SET + jeuxA,
        ptsB: (!gagnantEstA ? POINTS_VICTOIRE : 0) + Math.max(0, setsB - setsA) * POINTS_PAR_NET_SET + jeuxB,
      };
    },
  };
}

/** Les participants (indice de joueur, ou null) à l'ouverture du tour `r0`, dans l'ordre du tableau. */
export function ouvertureDuTour(t: Tableau, matches: Match[], r0: number): (number | null)[] {
  if (r0 === 0) return [...t.grille];
  const index = new Map(t.ids.map((id, j) => [id, j]));
  const duels = matches.filter((m) => m.round === t.rounds[r0]).sort((a, b) => a.position - b.position);
  const out: (number | null)[] = [];
  for (const m of duels) {
    for (const j of m.players) out.push(j.isBye || !j.id ? null : (index.get(j.id) ?? null));
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Espérance et écart-type exacts                                             */
/* -------------------------------------------------------------------------- */

export interface Moments {
  /** E[points au tour R] — inconditionnelle (inclut la probabilité d'être là). */
  esp: Esperances;
  /** Écart-type de ces points. */
  ecart: Esperances;
  /** P(le joueur est encore en lice à l'ouverture de ce tour). */
  presence: Esperances;
}

/**
 * Espérance et écart-type EXACTS des points de chaque joueur, tour par tour,
 * depuis les participants `actuels` de l'ouverture du tour `depuis`. Calcul
 * sans tirage : deux joueurs de sous-arbres disjoints sont indépendants, donc
 *   E[a, R]  = Σ_b P(a là) · P(b là) · E(a contre b)
 *   E[a², R] = Σ_b P(a là) · P(b là) · E(a² contre b).
 */
export function propagerMoments(t: Tableau, actuels: (number | null)[], depuis: number): Moments {
  const { rounds, ids } = t;
  const esp: Esperances = {};
  const e2: Esperances = {};
  const presence: Esperances = {};
  type Noeud = { j: number[]; pr: number[] };
  let niveau: Noeud[] = actuels.map((a) => (a === null ? { j: [], pr: [] } : { j: [a], pr: [1] }));
  const noterPresence = (nd: Noeud, round: string) => {
    nd.j.forEach((j, x) => ((presence[ids[j]] ??= {})[round] = nd.pr[x]));
  };

  for (let r = depuis; r < rounds.length; r++) {
    const round = rounds[r];
    const suivant: Noeud[] = [];
    for (let i = 0; i < niveau.length; i += 2) {
      const A = niveau[i];
      const B = niveau[i + 1] ?? { j: [], pr: [] };
      noterPresence(A, round);
      noterPresence(B, round);
      if (A.j.length === 0) {
        suivant.push(B); // bye : l'autre passe, sans point
        continue;
      }
      if (B.j.length === 0) {
        suivant.push(A);
        continue;
      }
      const gagne = new Map<number, number>();
      for (let x = 0; x < A.j.length; x++) {
        for (let y = 0; y < B.j.length; y++) {
          const a = A.j[x];
          const b = B.j[y];
          const w = A.pr[x] * B.pr[y];
          const ra = (esp[ids[a]] ??= {});
          const rb = (esp[ids[b]] ??= {});
          ra[round] = (ra[round] ?? 0) + w * t.ep(a, b);
          rb[round] = (rb[round] ?? 0) + w * t.ep(b, a);
          const qa = (e2[ids[a]] ??= {});
          const qb = (e2[ids[b]] ??= {});
          qa[round] = (qa[round] ?? 0) + w * t.m2(a, b);
          qb[round] = (qb[round] ?? 0) + w * t.m2(b, a);
          const pa = t.p(a, b);
          gagne.set(a, (gagne.get(a) ?? 0) + w * pa);
          gagne.set(b, (gagne.get(b) ?? 0) + w * (1 - pa));
        }
      }
      suivant.push({ j: [...gagne.keys()], pr: [...gagne.values()] });
    }
    niveau = suivant;
  }

  const ecart: Esperances = {};
  for (const id of Object.keys(e2)) {
    ecart[id] = {};
    for (const round of Object.keys(e2[id])) {
      const m = esp[id]?.[round] ?? 0;
      ecart[id][round] = Math.sqrt(Math.max(0, e2[id][round] - m * m));
    }
  }
  return { esp, ecart, presence };
}

/** Raccourci : l'espérance seule. */
export function propager(t: Tableau, actuels: (number | null)[], depuis: number): Esperances {
  return propagerMoments(t, actuels, depuis).esp;
}

/* -------------------------------------------------------------------------- */
/*  Scénarios                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * S fins de tournoi tirées au hasard, stockées à plat (Uint8) :
 *   vivant[(s·R + r)·n + j] = 1 si j joue (ou est exempté) au tour r du scénario s ;
 *   pts[(s·R + r)·n + j]    = points marqués par j à ce tour.
 * Un tour avant `r0` reste vide.
 */
export interface Scenarios {
  S: number;
  R: number;
  n: number;
  r0: number;
  vivant: Uint8Array;
  pts: Uint8Array;
}

export const indexScenario = (sc: Scenarios, s: number, r: number, j: number) => (s * sc.R + r) * sc.n + j;

export function genererScenarios(
  t: Tableau,
  depart: (number | null)[],
  r0: number,
  S: number,
  graine = 2026,
): Scenarios {
  const R = t.rounds.length;
  const n = t.n;
  const rnd = creerRandom(graine);
  const vivant = new Uint8Array(S * R * n);
  const pts = new Uint8Array(S * R * n);
  for (let s = 0; s < S; s++) {
    let actuels = depart;
    for (let r = r0; r < R; r++) {
      const base = (s * R + r) * n;
      const suivants: (number | null)[] = [];
      for (let i = 0; i < actuels.length; i += 2) {
        const a = actuels[i];
        const b = actuels[i + 1] ?? null;
        if (a !== null) vivant[base + a] = 1;
        if (b !== null) vivant[base + b] = 1;
        if (a !== null && b === null) suivants.push(a);
        else if (b !== null && a === null) suivants.push(b);
        else if (a === null || b === null) suivants.push(null);
        else {
          const res = t.tirer(a, b, rnd);
          pts[base + a] = Math.min(255, res.ptsA);
          pts[base + b] = Math.min(255, res.ptsB);
          suivants.push(res.gagnantEstA ? a : b);
        }
      }
      actuels = suivants;
    }
  }
  return { S, R, n, r0, vivant, pts };
}
