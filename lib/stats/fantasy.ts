/**
 * STATISTIQUES — vue « Fantasy » : le score prévu contre le score réel.
 *
 * Source : tn_fantasy_historique (une ligne par tournoi : l'équipe, le score prévu quand elle
 * a été figée, le score réel une fois le tournoi fini). Seuls les tournois TERMINÉS comptent :
 * un score réel provisoire ferait mentir tous les chiffres.
 */

import { correlation, moyenne, part, somme, type TournoiStat } from './commun';

export interface HistoFantasyStat {
  tournament_id: string;
  e_predit: number | null;
  score_reel: number | null;
  termine: boolean;
  e_predit_anterieur: number | null;
  score_reel_anterieur: number | null;
  joueurs_sans_elo: number | null;
}

export interface LigneFantasy {
  tournoi: TournoiStat;
  predit: number;
  reel: number;
  /** réel - prévu : positif = l'équipe a fait mieux que prévu. */
  ecart: number;
  sansElo: number | null;
  anterieur: { predit: number; reel: number } | null;
}

export function lignesFantasy(histo: HistoFantasyStat[], tournois: TournoiStat[]): LigneFantasy[] {
  const tournoiDe = new Map(tournois.map((t) => [t.id, t]));
  const out: LigneFantasy[] = [];
  for (const h of histo) {
    const tournoi = tournoiDe.get(h.tournament_id);
    if (!tournoi || !h.termine || h.e_predit === null || h.score_reel === null) continue;
    const predit = Number(h.e_predit);
    const reel = Number(h.score_reel);
    out.push({
      tournoi,
      predit,
      reel,
      ecart: reel - predit,
      sansElo: h.joueurs_sans_elo,
      anterieur:
        h.e_predit_anterieur !== null && h.score_reel_anterieur !== null
          ? { predit: Number(h.e_predit_anterieur), reel: Number(h.score_reel_anterieur) }
          : null,
    });
  }
  return out.sort((a, b) => (a.tournoi.start_date ?? '').localeCompare(b.tournoi.start_date ?? ''));
}

/* -------------------------------------------------------------------------- */
/*  28 — prévu contre réel                                                     */
/* -------------------------------------------------------------------------- */

export interface BilanPrevu {
  n: number;
  /** Erreur absolue moyenne. */
  erreurMoyenne: number | null;
  /** Écart moyen signé : négatif = on surestime. */
  biais: number | null;
  /** Part des tournois où le réel dépasse le prévu. */
  partAuDessus: number | null;
  correlation: number | null;
  totalPredit: number;
  totalReel: number;
}

export function bilanPrevuReel(lignes: LigneFantasy[]): BilanPrevu {
  return {
    n: lignes.length,
    erreurMoyenne: moyenne(lignes.map((l) => Math.abs(l.ecart))),
    biais: moyenne(lignes.map((l) => l.ecart)),
    partAuDessus: part(lignes.filter((l) => l.ecart > 0).length, lignes.length),
    correlation: correlation(
      lignes.map((l) => l.predit),
      lignes.map((l) => l.reel),
    ),
    totalPredit: somme(lignes.map((l) => l.predit)),
    totalReel: somme(lignes.map((l) => l.reel)),
  };
}

/* -------------------------------------------------------------------------- */
/*  29 — calibration par tranche de score prévu                                */
/* -------------------------------------------------------------------------- */

export interface TrancheFantasy {
  libelle: string;
  n: number;
  predit: number | null;
  reel: number | null;
}

/** Trois tranches d'effectif égal (faibles, moyens, élevés prévus). */
export function calibrationFantasy(lignes: LigneFantasy[]): TrancheFantasy[] {
  if (lignes.length < 3) return [];
  const tries = [...lignes].sort((a, b) => a.predit - b.predit);
  const t = Math.floor(tries.length / 3);
  const morceaux = [
    { libelle: 'Scores prévus bas', liste: tries.slice(0, t) },
    { libelle: 'Scores prévus moyens', liste: tries.slice(t, tries.length - t) },
    { libelle: 'Scores prévus hauts', liste: tries.slice(tries.length - t) },
  ];
  return morceaux.map(({ libelle, liste }) => ({
    libelle,
    n: liste.length,
    predit: moyenne(liste.map((l) => l.predit)),
    reel: moyenne(liste.map((l) => l.reel)),
  }));
}

/* -------------------------------------------------------------------------- */
/*  30 — impact des joueurs sans Elo                                           */
/* -------------------------------------------------------------------------- */

export interface GroupeSansElo {
  libelle: string;
  n: number;
  erreurMoyenne: number | null;
  biais: number | null;
}

export function impactSansElo(lignes: LigneFantasy[]): GroupeSansElo[] {
  const groupe = (libelle: string, liste: LigneFantasy[]): GroupeSansElo => ({
    libelle,
    n: liste.length,
    erreurMoyenne: moyenne(liste.map((l) => Math.abs(l.ecart))),
    biais: moyenne(liste.map((l) => l.ecart)),
  });
  const connus = lignes.filter((l) => l.sansElo !== null);
  return [
    groupe('Tous les joueurs avaient un Elo', connus.filter((l) => l.sansElo === 0)),
    groupe('Au moins un joueur sans Elo', connus.filter((l) => (l.sansElo ?? 0) > 0)),
  ];
}

/* -------------------------------------------------------------------------- */
/*  31 — équipe d'avant et d'après                                             */
/* -------------------------------------------------------------------------- */

export function equipeAvantApres(lignes: LigneFantasy[]): {
  n: number;
  meilleureApres: number;
  moinsBonneApres: number;
  egales: number;
  gainMoyen: number | null;
} {
  const avec = lignes.filter((l): l is LigneFantasy & { anterieur: { predit: number; reel: number } } => l.anterieur !== null);
  return {
    n: avec.length,
    meilleureApres: avec.filter((l) => l.reel > l.anterieur.reel).length,
    moinsBonneApres: avec.filter((l) => l.reel < l.anterieur.reel).length,
    egales: avec.filter((l) => l.reel === l.anterieur.reel).length,
    gainMoyen: moyenne(avec.map((l) => l.reel - l.anterieur.reel)),
  };
}
