/**
 * ELO MAISON — moteur paramétrable.
 *
 * Chaque match est d'abord PRÉDIT avec les notes connues avant lui, puis les notes sont mises
 * à jour : la prédiction ne voit jamais le résultat (pas de fuite d'information).
 *
 * Briques, toutes réglables (Params) et testées une à une par optimiser.mts :
 *  - note générale + note par surface, mélangées à la prédiction (poids `wSurface`) ;
 *  - facteur K dégressif avec l'expérience : K = k0 / (n + kDecal)^kForme (FiveThirtyEight :
 *    250 / (n + 5)^0,4), par note (générale / surface) ;
 *  - multiplicateur de K par niveau (Grand Chelem, Masters, circuit, Challenger, ITF, qualifs) ;
 *  - marge de victoire (« Weighted Elo », Angelini et al. 2022) : la mise à jour est
 *    multipliée selon la part de jeux gagnés ;
 *  - abandons : poids réduit ;
 *  - retour après une longue absence : K augmenté pendant quelques matchs ;
 *  - nouveaux joueurs : note de départ selon leur classement au premier match ;
 *  - 3 sets gagnants : la même différence de niveau donne une probabilité plus nette, déduite
 *    de la probabilité en 2 sets gagnants par la probabilité de set ;
 *  - moquette rangée avec le dur, ou à part.
 */
import type { MatchHisto, Niveau, Surface } from './donnees.mts';

export interface Params {
  k0: number;
  kDecal: number;
  kForme: number;
  /** Plancher de K (un vétéran continue d'apprendre un peu). */
  kMin: number;
  wSurface: number;
  niveau: Record<Niveau, number>;
  /** Poids d'un abandon (1 = match normal). */
  abandon: number;
  /** Marge de victoire : 0 = Elo classique ; λ > 0 amplifie les victoires nettes. */
  marge: number;
  /** Retour de blessure : jours d'absence au-delà desquels K est multiplié par `retourK`. */
  retourJours: number;
  retourK: number;
  /** Note de départ = 1500 + initPente × (ln 300 − ln rang), bornée. 0 = 1500 pour tous. */
  initPente: number;
  bo5: boolean;
  moquetteAvecDur: boolean;
  /** Échelle de la logistique (400 aux échecs). */
  echelle: number;
  /**
   * Apprentissage croisé entre surfaces : un match sur terre met aussi à jour les notes dur,
   * gazon, moquette, avec un K multiplié par `croise` (0 = surfaces indépendantes).
   */
  croise?: number;
  /**
   * Confiance dans la note de surface selon l'expérience sur cette surface :
   * poids réel = wSurface × n / (n + wSurfaceN). 0 = poids fixe.
   */
  wSurfaceN?: number;
}

export const PARAMS_538: Params = {
  k0: 250,
  kDecal: 5,
  kForme: 0.4,
  kMin: 0,
  wSurface: 0.5,
  niveau: { G: 1.1, M: 1, A: 1, F: 1, C: 1, S: 1, Q: 1, D: 1 },
  abandon: 1,
  marge: 0,
  retourJours: 100000,
  retourK: 1,
  initPente: 0,
  bo5: false,
  moquetteAvecDur: false,
  echelle: 400,
};

const SURF_IDX: Record<Surface, number> = { hard: 0, clay: 1, grass: 2, carpet: 3 };

export interface Note {
  general: number;
  surface: [number, number, number, number];
  n: number;
  nSurface: [number, number, number, number];
  dernierJour: number;
}

export interface Resultat {
  /** Probabilité (avant match) que le VAINQUEUR réel gagne. */
  p: Float64Array;
  notes: Map<string, Note>;
}

const logistique = (d: number, echelle: number) => 1 / (1 + Math.pow(10, -d / echelle));

/** Probabilité de gagner un set telle que la probabilité de match en 2 sets gagnants vaut p3. */
export function probaSet(p3: number): number {
  // p3 = s²(3 − 2s), croissante sur [0, 1] : dichotomie.
  let a = 0;
  let b = 1;
  for (let i = 0; i < 40; i++) {
    const s = (a + b) / 2;
    if (s * s * (3 - 2 * s) < p3) a = s;
    else b = s;
  }
  return (a + b) / 2;
}

/** Probabilité de match en 3 sets gagnants à partir de la probabilité en 2 sets gagnants. */
export function versBo5(p3: number): number {
  const s = probaSet(p3);
  const q = 1 - s;
  return s * s * s * (1 + 3 * q + 6 * q * q);
}

export function noteDepart(rang: number | null, p: Params): number {
  if (!p.initPente || !rang || rang <= 0) return 1500;
  return Math.max(1250, Math.min(1900, 1500 + p.initPente * (Math.log(300) - Math.log(rang))));
}

export function noteEffective(n: Note, surface: Surface, p: Params): number {
  const s = surface === 'carpet' && p.moquetteAvecDur ? 0 : SURF_IDX[surface];
  const w = p.wSurfaceN ? (p.wSurface * n.nSurface[s]) / (n.nSurface[s] + p.wSurfaceN) : p.wSurface;
  return w * n.surface[s] + (1 - w) * n.general;
}

export function probabilite(a: Note, b: Note, surface: Surface, bestOf: 3 | 5, p: Params): number {
  const p3 = logistique(noteEffective(a, surface, p) - noteEffective(b, surface, p), p.echelle);
  return bestOf === 5 && p.bo5 ? versBo5(p3) : p3;
}

const facteurK = (n: number, p: Params) => Math.max(p.kMin, p.k0 / Math.pow(n + p.kDecal, p.kForme));

export function rejouer(matchs: MatchHisto[], p: Params, notesDepart?: Map<string, Note>): Resultat {
  const notes = notesDepart ?? new Map<string, Note>();
  const out = new Float64Array(matchs.length);
  const get = (cle: string, rang: number | null, jour: number): Note => {
    let n = notes.get(cle);
    if (!n) {
      const r = noteDepart(rang, p);
      n = { general: r, surface: [r, r, r, r], n: 0, nSurface: [0, 0, 0, 0], dernierJour: jour };
      notes.set(cle, n);
    }
    return n;
  };

  for (let i = 0; i < matchs.length; i++) {
    const m = matchs[i];
    const g = get(m.gagnant, m.rangG, m.jour);
    const l = get(m.perdant, m.rangP, m.jour);
    const s = m.surface === 'carpet' && p.moquetteAvecDur ? 0 : SURF_IDX[m.surface];

    // --- Prédiction (avant le match) ---
    const pv = probabilite(g, l, m.surface, m.bestOf, p);
    out[i] = pv;

    // --- Mise à jour ---
    // Chaque note est mise à jour avec SA propre attente (générale contre générale, surface
    // contre surface), comme chez FiveThirtyEight et Tennis Abstract.
    let mult = p.niveau[m.niveau] ?? 1;
    if (m.abandon) mult *= p.abandon;
    if (p.marge > 0 && m.jeuxG + m.jeuxP > 0) {
      const part = m.jeuxG / (m.jeuxG + m.jeuxP); // 0,5 → match serré ; 1 → 6-0 6-0
      mult *= 1 + p.marge * (2 * part - 1);
    }
    const retour = (x: Note) => (m.jour - x.dernierJour > p.retourJours ? p.retourK : 1);

    const eG = logistique(g.general - l.general, p.echelle);
    g.general += facteurK(g.n, p) * mult * retour(g) * (1 - eG);
    l.general -= facteurK(l.n, p) * mult * retour(l) * (1 - eG);

    const rg = retour(g);
    const rl = retour(l);
    for (let t = 0; t < 4; t++) {
      const poids = t === s ? 1 : (p.croise ?? 0);
      if (poids === 0) continue;
      const eS = logistique(g.surface[t] - l.surface[t], p.echelle);
      g.surface[t] += poids * facteurK(g.nSurface[t], p) * mult * rg * (1 - eS);
      l.surface[t] -= poids * facteurK(l.nSurface[t], p) * mult * rl * (1 - eS);
    }

    g.n++;
    l.n++;
    g.nSurface[s]++;
    l.nSurface[s]++;
    g.dernierJour = m.jour;
    l.dernierJour = m.jour;
  }
  return { p: out, notes };
}

/* ----------------------------------------------------------------------------------- */
/*  Mesures                                                                             */
/* ----------------------------------------------------------------------------------- */

export interface Mesure {
  n: number;
  logLoss: number;
  brier: number;
  exactitude: number;
}

/** Log-loss, Brier, exactitude sur les matchs sélectionnés (p = probabilité du vainqueur réel). */
export function mesurer(p: Float64Array, garder: (i: number) => boolean): Mesure {
  let n = 0;
  let ll = 0;
  let br = 0;
  let ok = 0;
  for (let i = 0; i < p.length; i++) {
    if (!garder(i)) continue;
    const q = Math.min(1 - 1e-9, Math.max(1e-9, p[i]));
    n++;
    ll -= Math.log(q);
    br += (1 - q) * (1 - q);
    if (q > 0.5) ok++;
    else if (q === 0.5) ok += 0.5;
  }
  return { n, logLoss: ll / n, brier: br / n, exactitude: ok / n };
}

/** Courbe de calibration : par tranche de probabilité du favori, proportion réelle de victoires. */
export function calibration(p: Float64Array, garder: (i: number) => boolean, tranches = 10) {
  const somme = new Array(tranches).fill(0);
  const gagne = new Array(tranches).fill(0);
  const nb = new Array(tranches).fill(0);
  for (let i = 0; i < p.length; i++) {
    if (!garder(i)) continue;
    // Point de vue du favori : probabilité ≥ 0,5.
    const fav = p[i] >= 0.5 ? p[i] : 1 - p[i];
    const favGagne = p[i] >= 0.5 ? 1 : 0;
    const t = Math.min(tranches - 1, Math.floor((fav - 0.5) * 2 * tranches));
    somme[t] += fav;
    gagne[t] += favGagne;
    nb[t]++;
  }
  return nb.map((n, t) => ({
    tranche: `${(50 + (t * 50) / tranches).toFixed(0)}-${(50 + ((t + 1) * 50) / tranches).toFixed(0)} %`,
    n,
    predit: n ? somme[t] / n : null,
    reel: n ? gagne[t] / n : null,
  }));
}
