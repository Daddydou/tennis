/**
 * STATISTIQUES — vue « Modèle & marché » : le moteur Elo contre les bookmakers, et la santé
 * des imports.
 *
 * Même réserve que partout : les Elo sont ACTUELS (ils contiennent déjà le résultat). Deux
 * sources d'Elo se comparent honnêtement entre elles (même biais des deux côtés). Elo contre
 * cotes, non : le marché ne connaît pas le résultat, l'Elo si, donc l'avantage de l'Elo est
 * surestimé.
 */

import { brier, logLoss } from '../cotes';
import {
  cleDuelCotes,
  matchJoue,
  moyenne,
  part,
  perdantDe,
  probaElo,
  probaMarche,
  type DuelCotes,
  type EloDe,
  type MatchStat,
  type TournoiStat,
} from './commun';

/* -------------------------------------------------------------------------- */
/*  42 — Elo maison contre Tennis Abstract                                     */
/* -------------------------------------------------------------------------- */

export interface ScoreSource {
  n: number;
  /** Part de matchs où le favori de cette source a gagné. */
  precision: number | null;
  /** Brier moyen : plus c'est bas, mieux c'est (0,25 = pile ou face). */
  brier: number | null;
  logLoss: number | null;
}

/** Mesure les deux sources sur les MÊMES matchs (ceux où chacune connaît les deux joueurs). */
export function comparerSourcesElo(
  matchs: MatchStat[],
  tournois: TournoiStat[],
  eloTa: EloDe,
  eloMaison: EloDe,
): { communs: number; couvertureTa: number; couvertureMaison: number; ta: ScoreSource; maison: ScoreSource } {
  const tournoiDe = new Map(tournois.map((t) => [t.id, t]));
  const joues = matchs.filter(matchJoue);
  let couvertureTa = 0;
  let couvertureMaison = 0;
  const ta: number[] = [];
  const maison: number[] = [];
  for (const m of joues) {
    const surface = tournoiDe.get(m.tournament_id)?.surface ?? null;
    const gagnant = m.winner_id as string;
    const perdant = perdantDe(m) as string;
    const pTa = probaElo(gagnant, perdant, surface, eloTa);
    const pMa = probaElo(gagnant, perdant, surface, eloMaison);
    if (pTa !== null) couvertureTa++;
    if (pMa !== null) couvertureMaison++;
    if (pTa !== null && pMa !== null) {
      ta.push(pTa);
      maison.push(pMa);
    }
  }
  // p = probabilité attribuée au VAINQUEUR réel : le « gagne » du score est donc toujours vrai.
  const score = (ps: number[]): ScoreSource => ({
    n: ps.length,
    precision: part(ps.filter((p) => p > 0.5).length, ps.length),
    brier: moyenne(ps.map((p) => brier(p, true))),
    logLoss: moyenne(ps.map((p) => logLoss(p, true))),
  });
  return { communs: ta.length, couvertureTa, couvertureMaison, ta: score(ta), maison: score(maison) };
}

/* -------------------------------------------------------------------------- */
/*  43 — bookmakers contre Elo                                                 */
/* -------------------------------------------------------------------------- */

export function bookmakersContreElo(
  matchs: MatchStat[],
  tournois: TournoiStat[],
  cotes: Map<string, DuelCotes>,
  eloDe: EloDe,
): {
  n: number;
  ecartMoyen: number | null;
  marche: ScoreSource;
  elo: ScoreSource;
  /** Duels où Elo et marché désignent un favori différent. */
  desaccords: { n: number; marcheJuste: number; eloJuste: number };
} {
  const tournoiDe = new Map(tournois.map((t) => [t.id, t]));
  const pMarche: number[] = [];
  const pElo: number[] = [];
  const desaccords = { n: 0, marcheJuste: 0, eloJuste: 0 };
  for (const m of matchs.filter(matchJoue)) {
    const gagnant = m.winner_id as string;
    const perdant = perdantDe(m) as string;
    const surface = tournoiDe.get(m.tournament_id)?.surface ?? null;
    const pm = probaMarche(cotes, m.tournament_id, gagnant, perdant);
    const pe = probaElo(gagnant, perdant, surface, eloDe);
    if (pm === null || pe === null) continue;
    pMarche.push(pm);
    pElo.push(pe);
    if (pm > 0.5 !== pe > 0.5 && pm !== 0.5 && pe !== 0.5) {
      desaccords.n++;
      if (pm > 0.5) desaccords.marcheJuste++;
      else desaccords.eloJuste++;
    }
  }
  const score = (ps: number[]): ScoreSource => ({
    n: ps.length,
    precision: part(ps.filter((p) => p > 0.5).length, ps.length),
    brier: moyenne(ps.map((p) => brier(p, true))),
    logLoss: moyenne(ps.map((p) => logLoss(p, true))),
  });
  return {
    n: pMarche.length,
    ecartMoyen: moyenne(pMarche.map((p, i) => Math.abs(p - pElo[i]))),
    marche: score(pMarche),
    elo: score(pElo),
    desaccords,
  };
}

/* -------------------------------------------------------------------------- */
/*  44 — les cotes qui bougent                                                 */
/* -------------------------------------------------------------------------- */

export interface MouvementCote {
  tournoi: string;
  vainqueurId: string;
  perdantId: string;
  /** Variation de la probabilité du vainqueur entre le premier et le dernier relevé. */
  variation: number;
}

export function mouvementDesCotes(
  matchs: MatchStat[],
  tournois: TournoiStat[],
  cotes: Map<string, DuelCotes>,
): {
  duels: number;
  versLeVainqueur: number;
  variationMoyenne: number | null;
  favorisBattus: { n: number; marcheAvaitReculer: number };
  plusGrosMouvements: MouvementCote[];
} {
  const tournoiDe = new Map(tournois.map((t) => [t.id, t]));
  const mouvements: MouvementCote[] = [];
  const favorisBattus = { n: 0, marcheAvaitReculer: 0 };
  for (const m of matchs.filter(matchJoue)) {
    const gagnant = m.winner_id as string;
    const perdant = perdantDe(m) as string;
    const d = cotes.get(cleDuelCotes(m.tournament_id, gagnant, perdant));
    if (!d || d.nbCaptures < 2) continue;
    const pourGagnant = (pA: number) => (d.joueurA === gagnant ? pA : 1 - pA);
    const avant = pourGagnant(d.premier.pA);
    const apres = pourGagnant(d.dernier.pA);
    mouvements.push({
      tournoi: tournoiDe.get(m.tournament_id)?.name ?? '?',
      vainqueurId: gagnant,
      perdantId: perdant,
      variation: apres - avant,
    });
    // Le favori du premier relevé a-t-il perdu ? Sa cote avait-elle déjà reculé ?
    if (avant < 0.5) {
      favorisBattus.n++;
      // Le favori battu est le perdant : sa probabilité a reculé si celle du vainqueur a monté.
      if (apres > avant) favorisBattus.marcheAvaitReculer++;
    }
  }
  return {
    duels: mouvements.length,
    versLeVainqueur: mouvements.filter((x) => x.variation > 0).length,
    variationMoyenne: moyenne(mouvements.map((x) => x.variation)),
    favorisBattus,
    plusGrosMouvements: [...mouvements].sort((a, b) => Math.abs(b.variation) - Math.abs(a.variation)).slice(0, 5),
  };
}

/* -------------------------------------------------------------------------- */
/*  45 — santé de l'import                                                     */
/* -------------------------------------------------------------------------- */

export interface LogImportStat {
  tournament_id: string;
  source: string;
  ok: boolean;
  matchs_total: number | null;
  matchs_changes: number | null;
  avertissements: unknown;
  erreur: string | null;
  duree_ms: number | null;
  created_at: string;
}

export interface SurveillanceStat {
  tournament_id: string;
  actif: boolean;
  echecs_consecutifs: number;
  dernier_succes_at: string | null;
  arrete_at: string | null;
  motif_arret: string | null;
}

export function santeDesImports(
  logs: LogImportStat[],
  surveillances: SurveillanceStat[],
  tournois: TournoiStat[],
): {
  total: number;
  ok: number;
  tauxOk: number | null;
  dureeMoyenneMs: number | null;
  avertissements: number;
  parSource: { source: string; n: number; ok: number }[];
  derniereErreur: { tournoi: string; erreur: string; le: string } | null;
  surveillances: { actives: number; arretees: { tournoi: string; motif: string | null }[]; enEchec: number };
} {
  const nomDe = new Map(tournois.map((t) => [t.id, t.name]));
  const parSource = new Map<string, { n: number; ok: number }>();
  for (const l of logs) {
    const c = parSource.get(l.source) ?? { n: 0, ok: 0 };
    c.n++;
    if (l.ok) c.ok++;
    parSource.set(l.source, c);
  }
  const enErreur = logs
    .filter((l) => !l.ok && l.erreur)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return {
    total: logs.length,
    ok: logs.filter((l) => l.ok).length,
    tauxOk: part(logs.filter((l) => l.ok).length, logs.length),
    dureeMoyenneMs: moyenne(logs.map((l) => l.duree_ms).filter((d): d is number => d !== null)),
    avertissements: logs.reduce((s, l) => s + (Array.isArray(l.avertissements) ? l.avertissements.length : 0), 0),
    parSource: [...parSource].map(([source, c]) => ({ source, ...c })).sort((a, b) => b.n - a.n),
    derniereErreur: enErreur
      ? {
          tournoi: nomDe.get(enErreur.tournament_id) ?? enErreur.tournament_id,
          erreur: (enErreur.erreur as string).slice(0, 160),
          le: enErreur.created_at,
        }
      : null,
    surveillances: {
      actives: surveillances.filter((s) => s.actif).length,
      arretees: surveillances
        .filter((s) => s.arrete_at !== null)
        .map((s) => ({ tournoi: nomDe.get(s.tournament_id) ?? s.tournament_id, motif: s.motif_arret })),
      enEchec: surveillances.filter((s) => s.echecs_consecutifs > 0).length,
    },
  };
}
