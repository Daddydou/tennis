/**
 * ELO MAISON — moteur (module PUR : ni Next, ni Supabase, ni Node).
 *
 * Une seule version du calcul, partagée par la recherche (recherche/elo-maison/, réglage et
 * évaluation sur 1990-2026) et la production (db/eloMaison.ts, mise à jour quotidienne).
 * Protocole, chiffres et choix : recherche/elo-maison/RESULTATS.md.
 *
 * Chaque match est d'abord PRÉDIT avec les notes connues avant lui, puis les notes sont mises
 * à jour : la prédiction ne voit jamais le résultat.
 *
 * Briques (toutes réglables par Params, testées une à une) :
 *  - note générale + note par surface, mélangées à la prédiction (poids `wSurface`) ;
 *  - facteur K dégressif : K = k0 / (n + kDecal)^kForme, avec un plancher `kMin` ;
 *  - multiplicateur de K par niveau (Grand Chelem, Masters, circuit, Challenger, ITF, qualifs) ;
 *  - marge de victoire (« Weighted Elo », Angelini et al. 2022) selon la part de jeux gagnés ;
 *  - abandons pondérés ;
 *  - 3 sets gagnants : probabilité déduite de celle en 2 sets via la probabilité de set ;
 *  - recalibrage final (Platt) ajusté sur la validation 2018-2021.
 * Testées sans effet, gardées désactivées : apprentissage croisé entre surfaces, poids de
 * surface selon l'expérience, note de départ selon le classement, retour de blessure.
 */

export type NiveauElo = 'G' | 'M' | 'A' | 'F' | 'C' | 'S' | 'Q' | 'D';
// G Grand Chelem · M Masters 1000 / WTA 1000 · A autres tournois du circuit · F Finals
// C Challenger / WTA 125 / ITF ≥ 60 K · S Futures / ITF · Q qualifications du circuit · D Davis, BJK, United Cup
export type SurfaceElo = 'hard' | 'clay' | 'grass' | 'carpet';

export interface ParamsElo {
  k0: number;
  kDecal: number;
  kForme: number;
  kMin: number;
  wSurface: number;
  niveau: Record<NiveauElo, number>;
  abandon: number;
  marge: number;
  retourJours: number;
  retourK: number;
  initPente: number;
  bo5: boolean;
  moquetteAvecDur: boolean;
  echelle: number;
  croise?: number;
  wSurfaceN?: number;
}

/** Paramètres publiés par FiveThirtyEight (référence de comparaison). */
export const PARAMS_538: ParamsElo = {
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

/**
 * Paramètres de PRODUCTION : ceux retenus par recherche/elo-maison/optimiser.mts
 * (resultats/params-optimaux.json, réglés sur 2008-2017, arrêt précoce sur 2018-2021).
 * Les changer = refaire l'évaluation, pas les retoucher à la main.
 */
export const PARAMS_PRODUCTION: ParamsElo = {
  k0: 250,
  kDecal: 8.8,
  kForme: 0.4,
  kMin: 24.75,
  wSurface: 0.4025,
  niveau: { G: 1.1, M: 0.9, A: 1, F: 0.72, C: 0.8, S: 1.21, Q: 1.1, D: 0.9 },
  abandon: 1.25,
  marge: 0.768,
  retourJours: 100000,
  retourK: 1,
  initPente: 0,
  bo5: true,
  moquetteAvecDur: false,
  echelle: 507.15,
};

/** Recalibrage (Platt) : p' = σ(c · logit p), c ajusté sur la validation 2018-2021. */
export const RECALIBRAGE_PRODUCTION = 0.862;

/** Version du modèle, écrite dans tn_elo_maison_suivi (changer de paramètres = ré-amorcer). */
export const VERSION_ELO_MAISON = '2026-10-22';

export const NOTE_DEPART = 1500;

const SURF_IDX: Record<SurfaceElo, number> = { hard: 0, clay: 1, grass: 2, carpet: 3 };

export interface NoteElo {
  general: number;
  /** dur, terre, gazon, moquette */
  surface: [number, number, number, number];
  n: number;
  nSurface: [number, number, number, number];
  /** Jour (depuis 1970) du dernier match. */
  dernierJour: number;
}

/** Ce que le moteur lit d'un match. */
export interface MatchElo {
  jour: number;
  niveau: NiveauElo;
  surface: SurfaceElo;
  bestOf: 3 | 5;
  gagnant: string;
  perdant: string;
  jeuxG: number;
  jeuxP: number;
  abandon: boolean;
  rangG?: number | null;
  rangP?: number | null;
}

const logistique = (d: number, echelle: number) => 1 / (1 + Math.pow(10, -d / echelle));

/** Probabilité de gagner un set telle que la probabilité de match en 2 sets gagnants vaut p3. */
export function probaSet(p3: number): number {
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

export function noteDepart(rang: number | null | undefined, p: ParamsElo): number {
  if (!p.initPente || !rang || rang <= 0) return NOTE_DEPART;
  return Math.max(1250, Math.min(1900, NOTE_DEPART + p.initPente * (Math.log(300) - Math.log(rang))));
}

export function nouvelleNote(initiale = NOTE_DEPART, jour = 0): NoteElo {
  return { general: initiale, surface: [initiale, initiale, initiale, initiale], n: 0, nSurface: [0, 0, 0, 0], dernierJour: jour };
}

const indexSurface = (surface: SurfaceElo, p: ParamsElo) => (surface === 'carpet' && p.moquetteAvecDur ? 0 : SURF_IDX[surface]);

/** Note effective sur une surface : mélange note de surface / note générale. */
export function noteEffective(n: NoteElo, surface: SurfaceElo, p: ParamsElo): number {
  const s = indexSurface(surface, p);
  const w = p.wSurfaceN ? (p.wSurface * n.nSurface[s]) / (n.nSurface[s] + p.wSurfaceN) : p.wSurface;
  return w * n.surface[s] + (1 - w) * n.general;
}

/** Probabilité (avant recalibrage) que `a` batte `b`. */
export function probabilite(a: NoteElo, b: NoteElo, surface: SurfaceElo, bestOf: 3 | 5, p: ParamsElo): number {
  const p3 = logistique(noteEffective(a, surface, p) - noteEffective(b, surface, p), p.echelle);
  return bestOf === 5 && p.bo5 ? versBo5(p3) : p3;
}

/** Recalibrage de Platt. */
export function recalibrer(prob: number, c: number): number {
  const q = Math.min(1 - 1e-9, Math.max(1e-9, prob));
  return 1 / (1 + Math.exp(-c * Math.log(q / (1 - q))));
}

const facteurK = (n: number, p: ParamsElo) => Math.max(p.kMin, p.k0 / Math.pow(n + p.kDecal, p.kForme));

/** Met à jour les deux notes après un match (en place). */
export function majMatch(g: NoteElo, l: NoteElo, m: MatchElo, p: ParamsElo): void {
  const s = indexSurface(m.surface, p);
  let mult = p.niveau[m.niveau] ?? 1;
  if (m.abandon) mult *= p.abandon;
  if (p.marge > 0 && m.jeuxG + m.jeuxP > 0) {
    const part = m.jeuxG / (m.jeuxG + m.jeuxP); // 0,5 → match serré ; 1 → 6-0 6-0
    mult *= 1 + p.marge * (2 * part - 1);
  }
  const rg = m.jour - g.dernierJour > p.retourJours ? p.retourK : 1;
  const rl = m.jour - l.dernierJour > p.retourJours ? p.retourK : 1;

  // Chaque note avec SA propre attente (générale contre générale, surface contre surface).
  const eG = logistique(g.general - l.general, p.echelle);
  g.general += facteurK(g.n, p) * mult * rg * (1 - eG);
  l.general -= facteurK(l.n, p) * mult * rl * (1 - eG);
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

/**
 * Rejoue des matchs (triés par date) : renvoie la probabilité AVANT match du vainqueur réel
 * (non recalibrée) et les notes finales. `notes` peut porter un état de départ.
 */
export function rejouer(matchs: MatchElo[], p: ParamsElo, notes = new Map<string, NoteElo>()) {
  const proba = new Float64Array(matchs.length);
  const get = (cle: string, rang: number | null | undefined, jour: number) => {
    let n = notes.get(cle);
    if (!n) {
      n = nouvelleNote(noteDepart(rang, p), jour);
      notes.set(cle, n);
    }
    return n;
  };
  for (let i = 0; i < matchs.length; i++) {
    const m = matchs[i];
    const g = get(m.gagnant, m.rangG, m.jour);
    const l = get(m.perdant, m.rangP, m.jour);
    proba[i] = probabilite(g, l, m.surface, m.bestOf, p);
    majMatch(g, l, m, p);
  }
  return { p: proba, notes };
}

/* -------------------------------------------------------------------------- */
/*  Colonnes lues par l'app                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Valeurs à écrire dans les colonnes au format `ta_elo` (elo_overall, elo_hard, elo_clay,
 * elo_grass), pour que l'app — qui calcule 0,6 × surface + 0,4 × général et une logistique
 * d'échelle 400 (lib/elo.ts, db/elo.ts) — retrouve EXACTEMENT la probabilité de l'Elo maison
 * recalibré (hors conversion 3 sets gagnants, que le moteur de l'app ne fait pas).
 *
 * Probabilité maison : σ(c · ln10 · (Ea − Eb) / échelle), avec E = w·S + (1−w)·G.
 * App : 10^((Aa − Ab)/400), avec A = 0,6·S' + 0,4·G'. Il suffit que A = 1500 + α(E − 1500)
 * avec α = 400 · c / échelle : on pose G' = 1500 + α(G − 1500), puis S' tel que
 * 0,6·S' + 0,4·G' = 1500 + α(E_s − 1500).
 */
export function colonnesApp(
  n: NoteElo,
  p: ParamsElo = PARAMS_PRODUCTION,
  c = RECALIBRAGE_PRODUCTION,
  poidsSurfaceApp = 0.6,
): { elo_overall: number; elo_hard: number; elo_clay: number; elo_grass: number } {
  const alpha = (400 * c) / p.echelle;
  const gApp = NOTE_DEPART + alpha * (n.general - NOTE_DEPART);
  const colonne = (surface: SurfaceElo) => {
    const cible = NOTE_DEPART + alpha * (noteEffective(n, surface, p) - NOTE_DEPART);
    return (cible - (1 - poidsSurfaceApp) * gApp) / poidsSurfaceApp;
  };
  const r = (x: number) => Math.round(x * 10) / 10;
  return { elo_overall: r(gApp), elo_hard: r(colonne('hard')), elo_clay: r(colonne('clay')), elo_grass: r(colonne('grass')) };
}

/* -------------------------------------------------------------------------- */
/*  Résultats de l'API tennis → matchs du moteur                               */
/* -------------------------------------------------------------------------- */

/** « 7-6(5) 3-6 6-2 », « 6-1 3-0 RET », « W/O » → jeux, abandon, forfait. */
export function lireScoreTexte(score: string): { jeuxG: number; jeuxP: number; abandon: boolean; forfait: boolean } {
  const s = (score ?? '').toUpperCase();
  if (!s.trim() || /W\/O|WALKOVER/.test(s) || s.includes('UNFINISHED')) return { jeuxG: 0, jeuxP: 0, abandon: false, forfait: true };
  let g = 0;
  let q = 0;
  for (const m of s.matchAll(/(\d+)-(\d+)(?:\(\d+\))?/g)) {
    const a = +m[1];
    const b = +m[2];
    // Super tie-break noté « 10-8 » à la place d'un 3e set : compte pour un jeu.
    if (a >= 10 || b >= 10) {
      if (a > b) g += 1;
      else q += 1;
      continue;
    }
    g += a;
    q += b;
  }
  return { jeuxG: g, jeuxP: q, abandon: /RET|ABD|ABN|DEF/.test(s), forfait: g + q === 0 };
}

/** Niveau d'un match de l'API (rankId du tournoi, roundId 0-3 = qualifications). */
export function niveauApi(rankId: number | null | undefined, roundId: number | null | undefined, nomTournoi: string): NiveauElo {
  const rank = rankId ?? 2;
  const qualif = Number(roundId) <= 3;
  if (qualif) return rank >= 2 ? 'Q' : rank === 1 ? 'C' : 'S';
  if (rank >= 4) return 'G';
  if (rank === 3) return 'M';
  if (rank === 2) return /cup|davis|billie jean/i.test(nomTournoi) ? 'D' : 'A';
  // ITF féminin < 60 K et Futures : niveau S, comme dans l'archive.
  const itf = nomTournoi.match(/^[WM](\d+)\b/);
  if (rank === 0 || (itf && +itf[1] < 60)) return 'S';
  return 'C';
}

const SURFACE_API: Record<number, SurfaceElo> = { 1: 'hard', 2: 'clay', 3: 'hard', 4: 'carpet', 5: 'grass' };
export const surfaceApi = (courtId: number | null | undefined): SurfaceElo => SURFACE_API[courtId ?? 1] ?? 'hard';
