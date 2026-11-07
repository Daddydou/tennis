/**
 * STATISTIQUES — vue « Picks » : la qualité des choix d'un joueur du groupe.
 *
 * Chaque pick est d'abord ANALYSÉ une fois (gagné / perdu / en attente, adversaire, proba
 * du moteur), puis toutes les statistiques de la vue en sont des regroupements. Les points
 * viennent des colonnes de tn_picks, déjà calculées avec le barème de lib/scoring.ts.
 *
 * Réserve sur les probabilités : l'Elo disponible est l'Elo ACTUEL, pas celui du jour du
 * pick (cf. db/calibration.ts). Elles servent à ranger les picks du plus sûr au plus risqué,
 * pas à mesurer une précision au point près.
 */

import {
  adversaireDe,
  comparerTours,
  indexMatchsParJoueur,
  matchDecide,
  moyenne,
  part,
  probaElo,
  somme,
  type EloDe,
  type MatchStat,
  type PickStat,
  type TournoiStat,
} from './commun';

export type EtatPick = 'gagne' | 'perdu' | 'attente';
export type RaisonPerte = 'defaite' | 'abandon' | 'forfait';

export interface PickAnalyse {
  pick: PickStat;
  tournoi: TournoiStat | null;
  etat: EtatPick;
  adversaireId: string | null;
  /** Probabilité du moteur que le joueur batte son adversaire réel ; null si un Elo manque. */
  p: number | null;
  /** Renseigné seulement quand le pick est perdu. */
  raison: RaisonPerte | null;
}

/** Analyse chaque pick par rapport au match que son joueur a disputé à ce tour. */
export function analyserPicks(
  picks: PickStat[],
  matchs: MatchStat[],
  tournois: TournoiStat[],
  eloDe: EloDe,
): PickAnalyse[] {
  const parJoueur = indexMatchsParJoueur(matchs);
  const tournoiDe = new Map(tournois.map((t) => [t.id, t]));
  return picks.map((pick) => {
    const tournoi = tournoiDe.get(pick.tournament_id) ?? null;
    const m = parJoueur.get(`${pick.tournament_id}|${pick.round}|${pick.player_id}`);
    const adversaireId = m ? adversaireDe(m, pick.player_id) : null;
    const p =
      adversaireId !== null
        ? probaElo(pick.player_id, adversaireId, tournoi?.surface ?? null, eloDe)
        : null;
    if (!m || !matchDecide(m)) {
      return { pick, tournoi, etat: 'attente', adversaireId, p, raison: null };
    }
    if (m.winner_id === pick.player_id) {
      return { pick, tournoi, etat: 'gagne', adversaireId, p, raison: null };
    }
    const raison: RaisonPerte =
      m.status === 'walkover' ? 'forfait' : m.status === 'retired' ? 'abandon' : 'defaite';
    return { pick, tournoi, etat: 'perdu', adversaireId, p, raison };
  });
}

const decides = (a: PickAnalyse[]) => a.filter((x) => x.etat !== 'attente');

/* -------------------------------------------------------------------------- */
/*  10 — taux de picks justes, par tour                                        */
/* -------------------------------------------------------------------------- */

export interface TauxTour {
  round: string;
  n: number;
  gagnes: number;
  perdus: number;
  attente: number;
  taux: number | null;
}

export function tauxJustesParTour(analyses: PickAnalyse[]): { total: TauxTour; parTour: TauxTour[] } {
  const construire = (round: string, liste: PickAnalyse[]): TauxTour => {
    const gagnes = liste.filter((x) => x.etat === 'gagne').length;
    const perdus = liste.filter((x) => x.etat === 'perdu').length;
    return {
      round,
      n: liste.length,
      gagnes,
      perdus,
      attente: liste.length - gagnes - perdus,
      taux: part(gagnes, gagnes + perdus),
    };
  };
  const rounds = [...new Set(analyses.map((a) => a.pick.round))].sort(comparerTours);
  return {
    total: construire('Tous', analyses),
    parTour: rounds.map((r) => construire(r, analyses.filter((a) => a.pick.round === r))),
  };
}

/* -------------------------------------------------------------------------- */
/*  11 — sûrs contre risqués                                                   */
/* -------------------------------------------------------------------------- */

export interface TrancheRisque {
  libelle: string;
  n: number;
  gagnes: number;
  taux: number | null;
  /** Probabilité moyenne annoncée par le moteur sur ces picks. */
  pMoyenne: number | null;
  pointsMoyens: number | null;
}

const TRANCHES_RISQUE: { libelle: string; min: number; max: number }[] = [
  { libelle: 'Très sûrs (≥ 80 %)', min: 0.8, max: 1.01 },
  { libelle: 'Favoris (65–80 %)', min: 0.65, max: 0.8 },
  { libelle: 'Équilibrés (50–65 %)', min: 0.5, max: 0.65 },
  { libelle: 'Paris (< 50 %)', min: 0, max: 0.5 },
];

export function suretePicks(analyses: PickAnalyse[]): { tranches: TrancheRisque[]; sansProba: number } {
  const jouables = decides(analyses);
  const tranches = TRANCHES_RISQUE.map((t) => {
    const liste = jouables.filter((x) => x.p !== null && x.p >= t.min && x.p < t.max);
    const gagnes = liste.filter((x) => x.etat === 'gagne').length;
    return {
      libelle: t.libelle,
      n: liste.length,
      gagnes,
      taux: part(gagnes, liste.length),
      pMoyenne: moyenne(liste.map((x) => x.p as number)),
      pointsMoyens: moyenne(liste.map((x) => x.pick.points ?? 0)),
    };
  });
  return { tranches, sansProba: jouables.filter((x) => x.p === null).length };
}

/* -------------------------------------------------------------------------- */
/*  12 — chance contre talent                                                  */
/* -------------------------------------------------------------------------- */

export interface ChanceTalent {
  /** Picks décidés qui ont une espérance enregistrée. */
  n: number;
  points: number;
  esperance: number;
  /** points - espérance : positif = plus de réussite que prévu. */
  ecart: number;
  parTournoi: { tournoi: string; points: number; esperance: number; ecart: number }[];
  plusChanceux: { analyse: PickAnalyse; ecart: number }[];
  plusMalchanceux: { analyse: PickAnalyse; ecart: number }[];
}

export function chanceContreTalent(analyses: PickAnalyse[], nTop = 5): ChanceTalent {
  const liste = decides(analyses).filter((x) => x.pick.e_points !== null);
  const ecartDe = (x: PickAnalyse) => (x.pick.points ?? 0) - (x.pick.e_points as number);
  const parTournoiMap = new Map<string, { points: number; esperance: number }>();
  for (const x of liste) {
    const nom = x.tournoi?.name ?? '?';
    const c = parTournoiMap.get(nom) ?? { points: 0, esperance: 0 };
    c.points += x.pick.points ?? 0;
    c.esperance += x.pick.e_points as number;
    parTournoiMap.set(nom, c);
  }
  const points = somme(liste.map((x) => x.pick.points ?? 0));
  const esperance = somme(liste.map((x) => x.pick.e_points as number));
  const tries = liste.map((a) => ({ analyse: a, ecart: ecartDe(a) })).sort((a, b) => b.ecart - a.ecart);
  return {
    n: liste.length,
    points,
    esperance,
    ecart: points - esperance,
    parTournoi: [...parTournoiMap].map(([tournoi, c]) => ({ tournoi, ...c, ecart: c.points - c.esperance })),
    plusChanceux: tries.slice(0, nTop),
    plusMalchanceux: tries.slice(-nTop).reverse(),
  };
}

/* -------------------------------------------------------------------------- */
/*  13 — meilleurs et pires picks                                              */
/* -------------------------------------------------------------------------- */

export function meilleursEtPires(
  analyses: PickAnalyse[],
  n = 8,
): { meilleurs: PickAnalyse[]; pires: PickAnalyse[] } {
  const jouables = decides(analyses).sort((a, b) => (b.pick.points ?? 0) - (a.pick.points ?? 0));
  return { meilleurs: jouables.slice(0, n), pires: jouables.slice(-n).reverse() };
}

/* -------------------------------------------------------------------------- */
/*  14 — décomposition des points                                              */
/* -------------------------------------------------------------------------- */

export interface Composante {
  libelle: string;
  gains: number;
  pertes: number;
  net: number;
}

export function decompositionPoints(analyses: PickAnalyse[]): {
  composantes: Composante[];
  total: number;
  nbPicks: number;
} {
  const liste = decides(analyses);
  const composante = (libelle: string, valeurs: (number | null)[]): Composante => {
    const v = valeurs.map((x) => x ?? 0);
    const gains = somme(v.filter((x) => x > 0));
    const pertes = somme(v.filter((x) => x < 0));
    return { libelle, gains, pertes, net: gains + pertes };
  };
  return {
    composantes: [
      composante('Victoire du match', liste.map((x) => x.pick.points_match)),
      composante('Sets', liste.map((x) => x.pick.points_sets)),
      composante('Jeux', liste.map((x) => x.pick.points_games)),
    ],
    total: somme(liste.map((x) => x.pick.points ?? 0)),
    nbPicks: liste.length,
  };
}

/* -------------------------------------------------------------------------- */
/*  15 — les points perdus                                                     */
/* -------------------------------------------------------------------------- */

export function pointsPerdus(analyses: PickAnalyse[]): {
  perdus: number;
  parRaison: Record<RaisonPerte, number>;
  esperanceEnJeu: number;
  liste: PickAnalyse[];
} {
  const perdus = analyses.filter((x) => x.etat === 'perdu');
  const parRaison: Record<RaisonPerte, number> = { defaite: 0, abandon: 0, forfait: 0 };
  for (const x of perdus) if (x.raison) parRaison[x.raison]++;
  return {
    perdus: perdus.length,
    parRaison,
    esperanceEnJeu: somme(perdus.map((x) => x.pick.e_points ?? 0)),
    liste: [...perdus].sort((a, b) => (b.pick.e_points ?? 0) - (a.pick.e_points ?? 0)).slice(0, 10),
  };
}

/* -------------------------------------------------------------------------- */
/*  16 — stratégie de stock : quels joueurs à quel tour                         */
/* -------------------------------------------------------------------------- */

export interface LigneStrategie {
  round: string;
  n: number;
  eloMoyen: number | null;
  pointsMoyens: number | null;
  taux: number | null;
}

export function strategieDeStock(analyses: PickAnalyse[], eloDe: EloDe): LigneStrategie[] {
  const rounds = [...new Set(analyses.map((a) => a.pick.round))].sort(comparerTours);
  return rounds.map((round) => {
    const liste = analyses.filter((a) => a.pick.round === round);
    const jouees = decides(liste);
    const elos = liste
      .map((a) => eloDe(a.pick.player_id, a.tournoi?.surface ?? null))
      .filter((e): e is number => e !== null);
    return {
      round,
      n: liste.length,
      eloMoyen: moyenne(elos),
      pointsMoyens: moyenne(jouees.map((a) => a.pick.points ?? 0)),
      taux: part(jouees.filter((a) => a.etat === 'gagne').length, jouees.length),
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  17 et 18 — fétiches et bêtes noires                                        */
/* -------------------------------------------------------------------------- */

export interface BilanJoueurPick {
  joueurId: string;
  n: number;
  gagnes: number;
  perdus: number;
  points: number;
  moyenne: number | null;
}

function bilanParJoueur(analyses: PickAnalyse[]): BilanJoueurPick[] {
  const m = new Map<string, PickAnalyse[]>();
  for (const a of decides(analyses)) m.set(a.pick.player_id, [...(m.get(a.pick.player_id) ?? []), a]);
  return [...m].map(([joueurId, liste]) => {
    const points = somme(liste.map((x) => x.pick.points ?? 0));
    return {
      joueurId,
      n: liste.length,
      gagnes: liste.filter((x) => x.etat === 'gagne').length,
      perdus: liste.filter((x) => x.etat === 'perdu').length,
      points,
      moyenne: points / liste.length,
    };
  });
}

/** Les joueurs que tu prends le plus souvent. */
export function fetiches(analyses: PickAnalyse[], n = 8): BilanJoueurPick[] {
  return bilanParJoueur(analyses)
    .filter((j) => j.n >= 2)
    .sort((a, b) => b.n - a.n || b.points - a.points)
    .slice(0, n);
}

/** Les joueurs qui te rapportent le moins (au moins 2 picks, total le plus bas). */
export function betesNoires(analyses: PickAnalyse[], n = 8): BilanJoueurPick[] {
  const tous = bilanParJoueur(analyses);
  const moyenneGenerale = moyenne(decides(analyses).map((x) => x.pick.points ?? 0)) ?? 0;
  return tous
    .filter((j) => j.n >= 2 && (j.moyenne ?? 0) < moyenneGenerale)
    .sort((a, b) => (a.moyenne ?? 0) - (b.moyenne ?? 0) || b.n - a.n)
    .slice(0, n);
}

/* -------------------------------------------------------------------------- */
/*  19 — suivre le plan ou pas                                                 */
/* -------------------------------------------------------------------------- */

export interface ReservationStat {
  tournament_id: string;
  participant_id: string | null;
  round: string;
  half: string | null;
  player_id: string;
}

export function suiviDuPlan(reservations: ReservationStat[], picks: PickStat[]): {
  total: number;
  validees: number;
  autreJoueur: number;
  enAttente: number;
} {
  let validees = 0;
  let autreJoueur = 0;
  for (const r of reservations) {
    const pick = picks.find(
      (p) =>
        p.tournament_id === r.tournament_id &&
        p.participant_id === r.participant_id &&
        p.round === r.round &&
        (p.half ?? '') === (r.half ?? ''),
    );
    if (!pick) continue;
    if (pick.player_id === r.player_id) validees++;
    else autreJoueur++;
  }
  return {
    total: reservations.length,
    validees,
    autreJoueur,
    enAttente: reservations.length - validees - autreJoueur,
  };
}

/* -------------------------------------------------------------------------- */
/*  20 — toi contre le simulateur                                              */
/* -------------------------------------------------------------------------- */

export interface PickSimule {
  tournament_id: string;
  participant_id: string | null;
  round: string;
  half: string | null;
  player_id: string;
}

export function moiContreSimulateur(
  simules: PickSimule[],
  picks: PickStat[],
  matchs: MatchStat[],
): {
  emplacements: number;
  identiques: number;
  decides: number;
  reelGagnes: number;
  simulesGagnes: number;
} {
  const parJoueur = indexMatchsParJoueur(matchs);
  const issue = (t: string, round: string, joueur: string): 'gagne' | 'perdu' | 'attente' => {
    const m = parJoueur.get(`${t}|${round}|${joueur}`);
    if (!m || !matchDecide(m)) return 'attente';
    return m.winner_id === joueur ? 'gagne' : 'perdu';
  };
  let emplacements = 0;
  let identiques = 0;
  let nbDecides = 0;
  let reelGagnes = 0;
  let simulesGagnes = 0;
  for (const s of simules) {
    const reel = picks.find(
      (p) =>
        p.tournament_id === s.tournament_id &&
        p.participant_id === s.participant_id &&
        p.round === s.round &&
        (p.half ?? '') === (s.half ?? ''),
    );
    if (!reel) continue;
    emplacements++;
    if (reel.player_id === s.player_id) identiques++;
    const ir = issue(s.tournament_id, s.round, reel.player_id);
    const is = issue(s.tournament_id, s.round, s.player_id);
    if (ir !== 'attente' && is !== 'attente') {
      nbDecides++;
      if (ir === 'gagne') reelGagnes++;
      if (is === 'gagne') simulesGagnes++;
    }
  }
  return { emplacements, identiques, decides: nbDecides, reelGagnes, simulesGagnes };
}
