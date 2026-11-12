/**
 * COUPE DAVIS DANS LE TOURNOI — rencontres rangées dans tn_matches, saisie des résultats, barème des picks.
 * Module PUR : aucun import React / Next / Supabase.
 *
 * La Coupe Davis est un tournoi comme les autres (tableau de 8 dont les « joueurs » sont des nations, tours
 * exacts QF, SF, F — voir lib/davisImport.ts). Une rencontre est UNE ligne de tn_matches ; ses matchs
 * (simple 1, simple 2, double éventuel) sont rangés dans `sets`, un élément par match :
 *
 *   { "g1": 1, "g2": 0, "ordre": 1, "statut": "termine", "jeux": [{ "g1": 6, "g2": 3 }, { "g1": 6, "g2": 4 }] }
 *
 * `g1` / `g2` valent 1 / 0 ou 0 / 1 (qui a gagné le match : l'écran générique affiche donc « 1-0 1-0 » pour un
 * 2-0 en matchs) ; `jeux` = les sets du côté 1 (joueur 1 de la ligne) contre le côté 2. Un élément sans `jeux`
 * (score de rencontre repris tel quel d'ailleurs, « 2-1 ») est ignoré : seul le point de victoire compte alors.
 *
 * Le barème des picks est celui de lib/davis.ts (pointsPickCote) ; son miroir SQL est tn_score_davis
 * (migration 0035). Toute modification se fait des deux côtés.
 */
import {
  ORDRES_MATCH,
  POINTS_PAR_MATCH_ECART,
  POINTS_VICTOIRE_RENCONTRE,
  TOURS_DAVIS,
  ecartJeux,
  matchJoue,
  orienterSets,
  parserScore,
  resultatRencontre,
  validerResultatMatch,
  type Cote,
  type MatchDavis,
  type OrdreMatch,
  type ScoreSets,
  type SetJeux,
  type StatutMatchDavis,
} from './davis';

/** Un tournoi est une Coupe Davis si ses tours sont exactement QF, SF, F (comme estMasters pour un Masters). */
export function estDavis(rounds: readonly string[] | null | undefined): boolean {
  return !!rounds && rounds.length === TOURS_DAVIS.length && TOURS_DAVIS.every((r, i) => rounds[i] === r);
}

/* ------------------------------------------------------------------ */
/*  Rangement dans tn_matches.sets                                     */
/* ------------------------------------------------------------------ */

export type StatutStocke = 'termine' | 'forfait' | 'abandon';

export interface MatchStocke {
  g1: 0 | 1;
  g2: 0 | 1;
  ordre: OrdreMatch;
  statut: StatutStocke;
  jeux: SetJeux[];
}

/** Matchs joués -> éléments de tn_matches.sets, dans l'ordre simple 1, simple 2, double. */
export function versStockage(matchs: MatchDavis[]): MatchStocke[] {
  return matchs
    .filter(matchJoue)
    .sort((a, b) => a.ordre - b.ordre)
    .map((m) => ({
      g1: m.gagnant === 1 ? 1 : 0,
      g2: m.gagnant === 2 ? 1 : 0,
      ordre: m.ordre,
      statut: m.statut as StatutStocke,
      jeux: m.sets.map((s) => ({ g1: s.g1, g2: s.g2 })),
    }));
}

const estOrdre = (x: unknown): x is OrdreMatch => x === 1 || x === 2 || x === 3;

/** tn_matches.sets -> matchs joués ; tout élément sans `jeux` (ou illisible) est ignoré, comme en SQL. */
export function depuisStockage(sets: unknown): MatchDavis[] {
  if (!Array.isArray(sets)) return [];
  const matchs: MatchDavis[] = [];
  sets.forEach((raw, i) => {
    const e = raw as Record<string, unknown> | null;
    if (!e || typeof e !== 'object' || !Array.isArray(e.jeux)) return;
    const g1 = Number(e.g1);
    const g2 = Number(e.g2);
    if (!Number.isFinite(g1) || !Number.isFinite(g2)) return;
    const jeux: SetJeux[] = [];
    for (const j of e.jeux as Record<string, unknown>[]) {
      const a = Number(j?.g1);
      const b = Number(j?.g2);
      if (Number.isFinite(a) && Number.isFinite(b)) jeux.push({ g1: a, g2: b });
    }
    const statut: StatutMatchDavis = e.statut === 'forfait' ? 'forfait' : e.statut === 'abandon' ? 'abandon' : 'termine';
    matchs.push({ ordre: estOrdre(e.ordre) ? e.ordre : ((i + 1) as OrdreMatch), joueur1: null, joueur2: null, statut, gagnant: g1 > g2 ? 1 : 2, sets: jeux });
  });
  return matchs;
}

/* ------------------------------------------------------------------ */
/*  Barème des picks (miroir de tn_score_davis)                        */
/* ------------------------------------------------------------------ */

export interface PointsPickDavis {
  /** 5 si la nation gagne la rencontre. */
  match: number;
  /** 3 par match d'écart (plancher 0). */
  matchs: number;
  /** Somme des écarts de jeux de ses matchs gagnés. */
  jeux: number;
  total: number;
}

/**
 * Points d'un pick (la nation du côté `cote` de la ligne). `statut` = statut de la ligne tn_matches :
 * 'completed' / 'retired' / 'walkover' comptent, tout le reste (à venir, en cours) vaut 0.
 */
export function pointsPickDavis(sets: unknown, cote: Cote, gagneRencontre: boolean, statut: string): PointsPickDavis {
  const zero = { match: 0, matchs: 0, jeux: 0, total: 0 };
  if (['bye', 'scheduled', 'live', 'in_progress'].includes(statut)) return zero;
  let victoires = 0;
  let defaites = 0;
  let jeux = 0;
  if (statut !== 'walkover') {
    for (const m of depuisStockage(sets)) {
      if (m.gagnant === cote) {
        victoires += 1;
        jeux += ecartJeux(m);
      } else defaites += 1;
    }
  }
  const match = gagneRencontre ? POINTS_VICTOIRE_RENCONTRE : 0;
  const matchs = Math.max(0, victoires - defaites) * POINTS_PAR_MATCH_ECART;
  return { match, matchs, jeux, total: match + matchs + jeux };
}

/* ------------------------------------------------------------------ */
/*  Saisie d'une rencontre                                             */
/* ------------------------------------------------------------------ */

/** Ce que l'écran envoie pour un match : `score` = sets écrits du point de vue du VAINQUEUR (« 6-4 3-6 6-3 »). */
export interface SaisieMatch {
  ordre: OrdreMatch;
  statut: StatutMatchDavis;
  gagnant: Cote | null;
  score: string;
}

export type StatutLigne = 'scheduled' | 'live' | 'completed';

export type ResultatSaisie =
  | {
      ok: true;
      matchs: MatchDavis[];
      stockage: MatchStocke[];
      /** Côté vainqueur de la rencontre ; null tant qu'elle n'est pas décidée. */
      gagnant: Cote | null;
      score: ScoreSets | null;
      /** Statut de la ligne tn_matches. */
      statut: StatutLigne;
    }
  | { ok: false; erreurs: string[] };

/**
 * Valide la saisie d'une rencontre et prépare ce qui sera écrit. Règles : chaque match est cohérent
 * (validerResultatMatch) ; le double ne se joue que si les deux simples sont joués et partagés (1-1) ; la
 * rencontre est décidée dès qu'une nation a deux matchs.
 */
export function construireResultat(saisie: SaisieMatch[]): ResultatSaisie {
  const erreurs: string[] = [];
  const matchs: MatchDavis[] = [];
  for (const ordre of ORDRES_MATCH) {
    const s = saisie.find((x) => x.ordre === ordre);
    const nom = ordre === 3 ? 'Double' : `Simple ${ordre}`;
    if (!s) {
      matchs.push({ ordre, joueur1: null, joueur2: null, statut: 'a_venir', gagnant: null, sets: [] });
      continue;
    }
    const lu = parserScore(s.score);
    if (lu === null) {
      erreurs.push(`${nom} : score illisible (écris par exemple 6-4 3-6 7-6(5)).`);
      continue;
    }
    const joue = s.statut === 'termine' || s.statut === 'forfait' || s.statut === 'abandon';
    for (const e of validerResultatMatch(s.statut, s.gagnant, lu)) erreurs.push(`${nom} : ${e}`);
    matchs.push({
      ordre,
      joueur1: null,
      joueur2: null,
      statut: s.statut,
      gagnant: joue ? s.gagnant : null,
      sets: joue && s.gagnant !== null ? orienterSets(lu, s.gagnant) : [],
    });
  }
  if (erreurs.length) return { ok: false, erreurs };

  const [s1, s2, d] = [matchs[0], matchs[1], matchs[2]];
  if (matchJoue(d)) {
    if (!matchJoue(s1) || !matchJoue(s2)) erreurs.push('Le double ne se joue qu’après les deux simples.');
    else if (s1.gagnant === s2.gagnant) erreurs.push('Le double ne se joue que si les nations sont à 1-1 après les deux simples.');
  }
  if (erreurs.length) return { ok: false, erreurs };

  const res = resultatRencontre({ id: '', tour: 'QF', position: 1, nation1: null, nation2: null, debut: null, matchs });
  const unMatchJoue = matchs.some(matchJoue);
  return {
    ok: true,
    matchs,
    stockage: versStockage(matchs),
    gagnant: res.gagnant,
    score: res.score,
    statut: res.gagnant !== null ? 'completed' : unMatchJoue ? 'live' : 'scheduled',
  };
}

/** Saisie à afficher pour une rencontre déjà enregistrée (score réécrit du point de vue du vainqueur). */
export function saisieDepuisStockage(sets: unknown): SaisieMatch[] {
  return depuisStockage(sets).map((m) => {
    const dansLeSens = m.gagnant === 1 ? m.sets : m.sets.map((s) => ({ g1: s.g2, g2: s.g1 }));
    return {
      ordre: m.ordre,
      statut: m.statut,
      gagnant: m.gagnant,
      score: m.statut === 'forfait' ? '' : dansLeSens.map((s) => `${s.g1}-${s.g2}`).join(' '),
    };
  });
}
