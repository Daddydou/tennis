/**
 * SIMULATION D'UN TOURNOI MASTERS — module PUR (règles : lib/masters.ts).
 *
 * Joue des milliers de fois le tournoi à partir de l'Elo des 8 joueurs et de ce qui est DÉJÀ joué :
 * poules (avec départage), demies croisées, finale. Sert à calculer, pour chaque joueur :
 *   - la probabilité de chaque rang dans sa poule, d'être qualifié, finaliste, champion ;
 *   - l'espérance de points d'un PICK à chaque tour (barème du jeu : voir `pointsDuMatch`).
 * lib/mastersConseils.ts en tire le pronostic et les picks qui rapportent le plus.
 *
 * Journées 2 et 3 : leurs duels dépendent des résultats de la journée 1 (les vainqueurs se rencontrent,
 * les perdants aussi, puis les deux duels restants). S'ils sont déjà dans la base, on les prend tels
 * quels ; sinon on les déduit des résultats (réels ou simulés) de la journée précédente.
 *
 * Les scores en sets et en jeux sont simulés avec le modèle de lib/optimizerProbabilites.ts
 * (probabilité de set déduite de la probabilité de match, écart de jeux moyen croissant avec la
 * domination). Forfaits et abandons ne sont pas simulés. Un départage qui exige plus que les règles
 * (égalité parfaite) est tiré au hasard.
 */
import { pVictoire } from './elo';
import { classementPoule, demisFinales, pouleDeMoitie, type MatchPoule, type SetJeux } from './masters';
import type { LigneMatchMasters } from './mastersVue';
import { eNetGamesParSetGagne, pSetDepuisMatch } from './optimizerProbabilites';
import { POINTS_PAR_NET_SET, POINTS_VICTOIRE } from './scoring';

export type TourSim = 'J1' | 'J2' | 'J3' | 'SF' | 'F';
export const TOURS_SIM: TourSim[] = ['J1', 'J2', 'J3', 'SF', 'F'];

/**
 * Points d'un joueur sur un match (barème du jeu) : victoire = 5 de base + l'écart de jeux de chaque set gagné
 * + 3 par set d'avance ; défaite = seulement l'écart de jeux de chaque set gagné malgré la défaite.
 */
export function pointsDuMatch(sets: SetJeux[], estJoueur1: boolean, gagne: boolean): number {
  let points = gagne ? POINTS_VICTOIRE : 0;
  let setsG = 0;
  let setsP = 0;
  for (const s of sets) {
    const moi = estJoueur1 ? s.g1 : s.g2;
    const lui = estJoueur1 ? s.g2 : s.g1;
    if (moi > lui) {
      setsG++;
      points += moi - lui;
    } else if (lui > moi) setsP++;
  }
  if (gagne) points += POINTS_PAR_NET_SET * (setsG - setsP);
  return points;
}

/**
 * Journée 2 d'une poule de 4 : les deux vainqueurs de la journée 1 se rencontrent, les deux perdants aussi.
 */
export function duelsJournee2(w1: string, w2: string, l1: string, l2: string): [string, string][] {
  return [
    [w1, w2],
    [l1, l2],
  ];
}

/** Duels d'une poule pas encore joués, une fois `dejaJoues` écartés (journée 3 : les deux qui restent). */
export function duelsRestants(ids: string[], dejaJoues: [string, string][]): [string, string][] {
  const vus = new Set(dejaJoues.map(([a, b]) => [a, b].sort().join('|')));
  const out: [string, string][] = [];
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) if (!vus.has([ids[a], ids[b]].sort().join('|'))) out.push([ids[a], ids[b]]);
  return out;
}

/** Générateur pseudo-aléatoire reproductible (mulberry32) : mêmes entrées, mêmes propositions. */
export function alea(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Poids d'un écart de jeux 1..6 sur un set gagné, d'espérance `mu` (2,0 à 4,4) : loi exp(-λ(m-1)) normalisée. */
function loiEcart(mu: number): number[] {
  const moy = (lambda: number) => {
    let z = 0;
    let e = 0;
    for (let m = 1; m <= 6; m++) {
      const w = Math.exp(-lambda * (m - 1));
      z += w;
      e += m * w;
    }
    return e / z;
  };
  let lo = -3;
  let hi = 6;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (moy(mid) > mu) lo = mid;
    else hi = mid;
  }
  const lambda = (lo + hi) / 2;
  const w = Array.from({ length: 6 }, (_, k) => Math.exp(-lambda * k));
  const z = w.reduce((a, b) => a + b, 0);
  let cumul = 0;
  return w.map((x) => (cumul += x / z));
}

interface ModeleDuel {
  pSet: number;
  /** Lois cumulées de l'écart de jeux, quand le set est gagné par le joueur 1 / par le joueur 2. */
  ecartG1: number[];
  ecartG2: number[];
}

function modeleDuel(elo1: number, elo2: number): ModeleDuel {
  const pm = Math.min(0.999, Math.max(0.001, pVictoire(elo1, elo2)));
  const pSet = pSetDepuisMatch(pm, 3);
  return { pSet, ecartG1: loiEcart(eNetGamesParSetGagne(pSet)), ecartG2: loiEcart(eNetGamesParSetGagne(1 - pSet)) };
}

/** Jeux d'un set gagné avec cet écart : 7-6 pour 1, 6-(6-m) sinon. */
function jeuxDuSet(ecart: number): [number, number] {
  return ecart === 1 ? [7, 6] : [6, 6 - ecart];
}

function tirerEcart(loi: number[], u: number): number {
  const i = loi.findIndex((c) => u <= c);
  return (i < 0 ? 5 : i) + 1;
}

function simulerMatch(m: ModeleDuel, rnd: () => number): { gagne1: boolean; sets: SetJeux[] } {
  const sets: SetJeux[] = [];
  let s1 = 0;
  let s2 = 0;
  while (s1 < 2 && s2 < 2) {
    if (rnd() < m.pSet) {
      s1++;
      const [g, p] = jeuxDuSet(tirerEcart(m.ecartG1, rnd()));
      sets.push({ g1: g, g2: p });
    } else {
      s2++;
      const [g, p] = jeuxDuSet(tirerEcart(m.ecartG2, rnd()));
      sets.push({ g1: p, g2: g });
    }
  }
  return { gagne1: s1 === 2, sets };
}

/* ------------------------------------------------------------------ */

export interface EntreeSim {
  poules: { A: string[]; B: string[] };
  /** Elo effectif de chaque joueur (surface déjà mélangée, échelle de l'app). */
  elo: Map<string, number>;
  /** État réel : matchs programmés et résultats déjà joués. */
  matchs: LigneMatchMasters[];
  simulations?: number;
  graine?: number;
}

export interface ResultatSim {
  simulations: number;
  /** rang[id][r-1] = probabilité d'être r-ième de sa poule. */
  rang: Record<string, number[]>;
  top2: Record<string, number>;
  finaliste: Record<string, number>;
  champion: Record<string, number>;
  /** Probabilité que le joueur joue un match à ce tour. */
  joue: Record<string, Record<TourSim, number>>;
  /** Espérance de points d'un pick sur ce joueur à ce tour (0 s'il ne joue pas). */
  ep: Record<string, Record<TourSim, number>>;
}

const DECIDES = ['completed', 'walkover', 'retired'];

interface DuelEtat {
  p1: string;
  p2: string;
  /** Résultat réel s'il est connu. */
  reel: { gagne1: boolean; sets: SetJeux[] } | null;
}

function duelDepuisLigne(l: LigneMatchMasters): DuelEtat | null {
  if (!l.player1Id || !l.player2Id) return null;
  const decide = DECIDES.includes(l.status) && l.winnerId !== null;
  return {
    p1: l.player1Id,
    p2: l.player2Id,
    reel: decide ? { gagne1: l.winnerId === l.player1Id, sets: (l.sets ?? []).map((s) => ({ g1: s.g1 ?? 0, g2: s.g2 ?? 0 })) } : null,
  };
}

export function simulerMasters(e: EntreeSim): ResultatSim {
  const N = e.simulations ?? 10000;
  const rnd = alea(e.graine ?? 2026);
  const tous = [...e.poules.A, ...e.poules.B];
  const eloDe = (id: string) => e.elo.get(id) ?? 1500;

  const cacheModele = new Map<string, ModeleDuel>();
  const modele = (a: string, b: string) => {
    const cle = `${a}|${b}`;
    let m = cacheModele.get(cle);
    if (!m) {
      m = modeleDuel(eloDe(a), eloDe(b));
      cacheModele.set(cle, m);
    }
    return m;
  };

  const vide = () => Object.fromEntries(tous.map((id) => [id, 0])) as Record<string, number>;
  const rangN = Object.fromEntries(tous.map((id) => [id, [0, 0, 0, 0]])) as Record<string, number[]>;
  const top2N = vide();
  const finN = vide();
  const champN = vide();
  const joueN = Object.fromEntries(tous.map((id) => [id, { J1: 0, J2: 0, J3: 0, SF: 0, F: 0 }])) as Record<string, Record<TourSim, number>>;
  const epN = Object.fromEntries(tous.map((id) => [id, { J1: 0, J2: 0, J3: 0, SF: 0, F: 0 }])) as Record<string, Record<TourSim, number>>;

  // Duels réels de chaque poule et de chaque journée, tels qu'ils sont dans la base.
  const reelsPoule = (poule: 'A' | 'B', round: 'J1' | 'J2' | 'J3'): DuelEtat[] =>
    e.matchs
      .filter((l) => l.round === round && l.half !== null && pouleDeMoitie(l.half) === poule)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map(duelDepuisLigne)
      .filter((d): d is DuelEtat => d !== null);
  const reels = {
    A: { J1: reelsPoule('A', 'J1'), J2: reelsPoule('A', 'J2'), J3: reelsPoule('A', 'J3') },
    B: { J1: reelsPoule('B', 'J1'), J2: reelsPoule('B', 'J2'), J3: reelsPoule('B', 'J3') },
  };
  const ligneFinale = (round: 'SF' | 'F', position: number) => e.matchs.find((l) => l.round === round && (l.position ?? 0) === position);

  /** Joue un duel (réel s'il l'est, sinon simulé) et enregistre points et présence du tour. */
  const jouer = (d: DuelEtat, tour: TourSim): { gagnant: string; perdant: string; sets: SetJeux[] } => {
    const r = d.reel ?? simulerMatch(modele(d.p1, d.p2), rnd);
    const gagnant = r.gagne1 ? d.p1 : d.p2;
    const perdant = r.gagne1 ? d.p2 : d.p1;
    joueN[d.p1][tour]++;
    joueN[d.p2][tour]++;
    epN[d.p1][tour] += pointsDuMatch(r.sets, true, r.gagne1);
    epN[d.p2][tour] += pointsDuMatch(r.sets, false, !r.gagne1);
    return { gagnant, perdant, sets: r.sets };
  };

  /** Une poule jouée en entier. Renvoie son classement (ids du 1er au 4e). */
  const jouerPoule = (poule: 'A' | 'B'): string[] => {
    const ids = e.poules[poule];
    const matchs: MatchPoule[] = [];
    const jouerJour = (duels: DuelEtat[], tour: 'J1' | 'J2' | 'J3') => {
      const res = duels.map((d) => {
        const r = jouer(d, tour);
        matchs.push({ player1Id: d.p1, player2Id: d.p2, winnerId: r.gagnant, sets: r.sets });
        return r;
      });
      return res;
    };
    const j1 = reels[poule].J1.length === 2 ? reels[poule].J1 : [{ p1: ids[0], p2: ids[3], reel: null }, { p1: ids[1], p2: ids[2], reel: null }];
    const r1 = jouerJour(j1, 'J1');
    const [w1, w2] = [r1[0].gagnant, r1[1].gagnant];
    const [l1, l2] = [r1[0].perdant, r1[1].perdant];
    const enDuels = (paires: [string, string][]): DuelEtat[] => paires.map(([p1, p2]) => ({ p1, p2, reel: null }));
    const j2 = reels[poule].J2.length === 2 ? reels[poule].J2 : enDuels(duelsJournee2(w1, w2, l1, l2));
    jouerJour(j2, 'J2');
    const j3 = reels[poule].J3.length === 2 ? reels[poule].J3 : enDuels(duelsRestants(ids, [...j1, ...j2].map((d): [string, string] => [d.p1, d.p2])));
    jouerJour(j3, 'J3');
    // Ordre d'entrée mélangé : une égalité parfaite non départagée par les règles se joue à pile ou face.
    const melange = [...ids].sort(() => rnd() - 0.5);
    return classementPoule(melange, matchs).map((l) => l.playerId);
  };

  for (let n = 0; n < N; n++) {
    const cA = jouerPoule('A');
    const cB = jouerPoule('B');
    for (const c of [cA, cB]) {
      c.forEach((id, i) => {
        rangN[id][i]++;
        if (i < 2) top2N[id]++;
      });
    }
    const [d1, d2] = demisFinales([cA[0], cA[1]], [cB[0], cB[1]]);
    const demis: [string, string][] = [d1, d2];
    const finalistes = demis.map((paire, i) => {
      const l = ligneFinale('SF', i);
      const reel = l ? duelDepuisLigne(l) : null;
      const duel: DuelEtat = reel && reel.reel ? reel : { p1: paire[0], p2: paire[1], reel: null };
      return jouer(duel, 'SF').gagnant;
    });
    for (const f of finalistes) finN[f]++;
    const lf = ligneFinale('F', 0);
    const reelF = lf ? duelDepuisLigne(lf) : null;
    const champion = jouer(reelF && reelF.reel ? reelF : { p1: finalistes[0], p2: finalistes[1], reel: null }, 'F').gagnant;
    champN[champion]++;
  }

  const sur = (v: Record<string, number>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x / N]));
  const parTour = (t: Record<string, Record<TourSim, number>>) =>
    Object.fromEntries(Object.entries(t).map(([k, x]) => [k, Object.fromEntries(TOURS_SIM.map((r) => [r, x[r] / N]))])) as Record<string, Record<TourSim, number>>;
  return {
    simulations: N,
    rang: Object.fromEntries(Object.entries(rangN).map(([k, x]) => [k, x.map((v) => v / N)])),
    top2: sur(top2N),
    finaliste: sur(finN),
    champion: sur(champN),
    joue: parTour(joueN),
    ep: parTour(epN),
  };
}
