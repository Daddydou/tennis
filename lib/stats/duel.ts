/**
 * STATISTIQUES — vue « Duel » : toi contre Laki et Thomas.
 *
 * Tout part d'un seul tableau « total par tournoi et par joueur du groupe » (picks +
 * bracket), calculé avec les chiffres du Dashboard (pointsStock.ts). Les neuf statistiques de
 * cette vue en sont des regroupements : aucune ne recalcule de points.
 */

import {
  cleStock,
  ecartType,
  moyenne,
  somme,
  type PickStat,
  type PointsTournoiStat,
  type StockStat,
  type TournoiStat,
} from './commun';

export interface LigneTournoiDuel {
  tournoi: TournoiStat;
  /** Total (picks + bracket) par clé de stock ; absent = n'a pas joué ce tournoi. */
  totaux: Record<string, number>;
  /** Détail picks / bracket par clé de stock. */
  details: Record<string, { picks: number; bracket: number | null }>;
  /** Clé(s) du ou des vainqueurs (plusieurs en cas d'égalité) ; vide si moins de 2 joueurs. */
  gagnants: string[];
  /** Total du meilleur, pour mesurer l'écart au vainqueur. */
  meilleur: number | null;
}

/** Tournois triés par date de début, du plus ancien au plus récent. */
export function trierParDate(tournois: TournoiStat[]): TournoiStat[] {
  return [...tournois].sort(
    (a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? '') || a.name.localeCompare(b.name),
  );
}

/** Le tableau de base : une ligne par tournoi où au moins un joueur du groupe a des points. */
export function tableauDuel(
  tournois: TournoiStat[],
  lignes: PointsTournoiStat[],
): LigneTournoiDuel[] {
  const out: LigneTournoiDuel[] = [];
  for (const t of trierParDate(tournois)) {
    const siennes = lignes.filter((l) => l.tournoiId === t.id);
    if (siennes.length === 0) continue;
    const totaux: Record<string, number> = {};
    const details: LigneTournoiDuel['details'] = {};
    for (const l of siennes) {
      const cle = cleStock(l.stockId);
      totaux[cle] = l.picks + (l.bracket ?? 0);
      details[cle] = { picks: l.picks, bracket: l.bracket };
    }
    const cles = Object.keys(totaux);
    let gagnants: string[] = [];
    let meilleur: number | null = null;
    if (cles.length >= 2) {
      meilleur = Math.max(...cles.map((c) => totaux[c]));
      gagnants = cles.filter((c) => totaux[c] === meilleur);
    }
    out.push({ tournoi: t, totaux, details, gagnants, meilleur });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  1 à 4 — série, régularité, extrêmes, écart au vainqueur                     */
/* -------------------------------------------------------------------------- */

export interface ResumeStock {
  cle: string;
  nom: string;
  nbTournois: number;
  total: number;
  moyenne: number | null;
  ecartType: number | null;
  victoires: number;
  meilleur: { tournoi: string; points: number } | null;
  pire: { tournoi: string; points: number } | null;
  /** Écart moyen entre son total et celui du vainqueur, sur les tournois à 2 joueurs ou plus. */
  ecartMoyenAuVainqueur: number | null;
  /** Plus longue série de tournois gagnés d'affilée. */
  meilleureSerie: number;
}

export function resumeParStock(tableau: LigneTournoiDuel[], stocks: StockStat[]): ResumeStock[] {
  return stocks.map((s) => {
    const cle = cleStock(s.id);
    const siennes = tableau.filter((l) => cle in l.totaux);
    const valeurs = siennes.map((l) => l.totaux[cle]);
    let meilleur: ResumeStock['meilleur'] = null;
    let pire: ResumeStock['pire'] = null;
    for (const l of siennes) {
      const p = l.totaux[cle];
      if (!meilleur || p > meilleur.points) meilleur = { tournoi: l.tournoi.name, points: p };
      if (!pire || p < pire.points) pire = { tournoi: l.tournoi.name, points: p };
    }
    const comparables = siennes.filter((l) => l.meilleur !== null);
    let serie = 0;
    let meilleureSerie = 0;
    for (const l of tableau) {
      if (l.gagnants.includes(cle)) {
        serie++;
        meilleureSerie = Math.max(meilleureSerie, serie);
      } else if (l.gagnants.length > 0) {
        serie = 0;
      }
    }
    return {
      cle,
      nom: s.nom,
      nbTournois: siennes.length,
      total: somme(valeurs),
      moyenne: moyenne(valeurs),
      ecartType: ecartType(valeurs),
      victoires: tableau.filter((l) => l.gagnants.includes(cle)).length,
      meilleur,
      pire,
      ecartMoyenAuVainqueur: moyenne(comparables.map((l) => (l.meilleur as number) - l.totaux[cle])),
      meilleureSerie,
    };
  });
}

/** Points cumulés après chaque tournoi (une courbe par stock), pour le graphique. */
export function cumuls(
  tableau: LigneTournoiDuel[],
  stocks: StockStat[],
): { etiquettes: string[]; series: { cle: string; nom: string; valeurs: number[] }[] } {
  const series = stocks.map((s) => {
    const cle = cleStock(s.id);
    let cumul = 0;
    return {
      cle,
      nom: s.nom,
      valeurs: tableau.map((l) => {
        cumul += l.totaux[cle] ?? 0;
        return cumul;
      }),
    };
  });
  return { etiquettes: tableau.map((l) => `${l.tournoi.name} (${l.tournoi.tour})`), series };
}

/* -------------------------------------------------------------------------- */
/*  5 à 7 — par surface, catégorie, circuit                                    */
/* -------------------------------------------------------------------------- */

export interface GroupeDuel {
  libelle: string;
  nbTournois: number;
  /** Par clé de stock : total, moyenne par tournoi joué, victoires. */
  parStock: Record<string, { total: number; nb: number; moyenne: number | null; victoires: number }>;
}

/** Regroupe les tournois selon `cleGroupe` (surface, catégorie, circuit...). */
export function repartition(
  tableau: LigneTournoiDuel[],
  stocks: StockStat[],
  cleGroupe: (t: TournoiStat) => string,
): GroupeDuel[] {
  const groupes = new Map<string, LigneTournoiDuel[]>();
  for (const l of tableau) {
    const g = cleGroupe(l.tournoi);
    groupes.set(g, [...(groupes.get(g) ?? []), l]);
  }
  return [...groupes]
    .map(([libelle, lignes]) => {
      const parStock: GroupeDuel['parStock'] = {};
      for (const s of stocks) {
        const cle = cleStock(s.id);
        const siennes = lignes.filter((l) => cle in l.totaux);
        const total = somme(siennes.map((l) => l.totaux[cle]));
        parStock[cle] = {
          total,
          nb: siennes.length,
          moyenne: siennes.length === 0 ? null : total / siennes.length,
          victoires: lignes.filter((l) => l.gagnants.includes(cle)).length,
        };
      }
      return { libelle, nbTournois: lignes.length, parStock };
    })
    .sort((a, b) => b.nbTournois - a.nbTournois || a.libelle.localeCompare(b.libelle));
}

/* -------------------------------------------------------------------------- */
/*  8 — selon le moment du tournoi                                             */
/* -------------------------------------------------------------------------- */

export interface LigneParTour {
  round: string;
  parStock: Record<string, { nb: number; points: number; moyenne: number | null }>;
}

/** Points des picks par tour (premier tour contre finale), pour chaque stock. */
export function picksParTour(picks: PickStat[], stocks: StockStat[], ordre: (a: string, b: string) => number): LigneParTour[] {
  const rounds = [...new Set(picks.map((p) => p.round))].sort(ordre);
  return rounds.map((round) => {
    const parStock: LigneParTour['parStock'] = {};
    for (const s of stocks) {
      const siens = picks.filter((p) => p.round === round && p.participant_id === s.id);
      const pts = siens.map((p) => p.points ?? 0);
      parStock[cleStock(s.id)] = { nb: siens.length, points: somme(pts), moyenne: moyenne(pts) };
    }
    return { round, parStock };
  });
}

/* -------------------------------------------------------------------------- */
/*  9 — matrice des duels                                                      */
/* -------------------------------------------------------------------------- */

export interface DuelDeuxStocks {
  a: StockStat;
  b: StockStat;
  /** Tournois joués par les deux. */
  communs: number;
  victoiresA: number;
  victoiresB: number;
  egalites: number;
  /** Somme de (A - B) sur les tournois communs : positif, A mène. */
  ecartCumule: number;
}

export function matriceDesDuels(tableau: LigneTournoiDuel[], stocks: StockStat[]): DuelDeuxStocks[] {
  const out: DuelDeuxStocks[] = [];
  for (let i = 0; i < stocks.length; i++) {
    for (let j = i + 1; j < stocks.length; j++) {
      const ca = cleStock(stocks[i].id);
      const cb = cleStock(stocks[j].id);
      const communs = tableau.filter((l) => ca in l.totaux && cb in l.totaux);
      out.push({
        a: stocks[i],
        b: stocks[j],
        communs: communs.length,
        victoiresA: communs.filter((l) => l.totaux[ca] > l.totaux[cb]).length,
        victoiresB: communs.filter((l) => l.totaux[cb] > l.totaux[ca]).length,
        egalites: communs.filter((l) => l.totaux[ca] === l.totaux[cb]).length,
        ecartCumule: somme(communs.map((l) => l.totaux[ca] - l.totaux[cb])),
      });
    }
  }
  return out;
}
