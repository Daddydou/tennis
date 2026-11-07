/**
 * STATISTIQUES — vue « Circuit » : ce qui s'est passé sur les courts, indépendamment de nos
 * picks. Tout vient de tn_matches (scores par set) et des joueurs des tournois suivis.
 *
 * Réserve : les Elo sont les Elo ACTUELS. Une « surprise » ou un « favori » est donc jugé à
 * l'aune d'un Elo qui contient déjà le résultat (cf. db/calibration.ts) : à lire comme un
 * classement des affiches, pas comme une mesure exacte.
 */

import {
  comparerTours,
  etapeDepuisFinale,
  jeuxDuMatch,
  matchDecide,
  matchJoue,
  moyenne,
  part,
  perdantDe,
  probaElo,
  type EloDe,
  type JoueurStat,
  type MatchStat,
  type SetStat,
  type TournoiStat,
} from './commun';

const nomDe = (joueurs: Map<string, JoueurStat>, id: string | null) =>
  (id ? joueurs.get(id)?.name : null) ?? '?';

/* -------------------------------------------------------------------------- */
/*  32 et 33 — surprises                                                       */
/* -------------------------------------------------------------------------- */

export interface Surprise {
  tournoi: string;
  round: string;
  vainqueur: string;
  perdant: string;
  /** Probabilité du moteur pour le vainqueur (petite = grosse surprise). */
  pVainqueur: number;
  score: string;
}

export function formaterScore(sets: SetStat[] | null): string {
  return (sets ?? []).map((s) => `${s.g1 ?? 0}-${s.g2 ?? 0}`).join(' ');
}

export function surprises(
  matchs: MatchStat[],
  tournois: TournoiStat[],
  joueurs: Map<string, JoueurStat>,
  eloDe: EloDe,
): {
  analyses: number;
  victoiresFavori: number;
  top: Surprise[];
  parTour: { round: string; n: number; surprises: number; part: number | null }[];
} {
  const tournoiDe = new Map(tournois.map((t) => [t.id, t]));
  const liste: (Surprise & { round: string })[] = [];
  const parTourMap = new Map<string, { n: number; s: number }>();
  let victoiresFavori = 0;
  let analyses = 0;
  for (const m of matchs.filter(matchJoue)) {
    const t = tournoiDe.get(m.tournament_id);
    const gagnant = m.winner_id as string;
    const perdant = perdantDe(m) as string;
    const p = probaElo(gagnant, perdant, t?.surface ?? null, eloDe);
    if (p === null || p === 0.5) continue;
    analyses++;
    const c = parTourMap.get(m.round) ?? { n: 0, s: 0 };
    c.n++;
    if (p > 0.5) victoiresFavori++;
    else {
      c.s++;
      liste.push({
        tournoi: t?.name ?? '?',
        round: m.round,
        vainqueur: nomDe(joueurs, gagnant),
        perdant: nomDe(joueurs, perdant),
        pVainqueur: p,
        score: formaterScore(m.sets),
      });
    }
    parTourMap.set(m.round, c);
  }
  return {
    analyses,
    victoiresFavori,
    top: liste.sort((a, b) => a.pVainqueur - b.pVainqueur).slice(0, 10),
    parTour: [...parTourMap]
      .map(([round, c]) => ({ round, n: c.n, surprises: c.s, part: part(c.s, c.n) }))
      .sort((a, b) => comparerTours(a.round, b.round)),
  };
}

/* -------------------------------------------------------------------------- */
/*  34 — où tombent les favoris                                                */
/* -------------------------------------------------------------------------- */

export interface SortieFavori {
  tournoi: string;
  joueur: string;
  /** 'Titre' ou l'étape où il est tombé. */
  sortie: string;
}

/** Les 4 meilleurs Elo de chaque tableau, et jusqu'où ils vont. */
export function sortieDesFavoris(
  matchs: MatchStat[],
  tournois: TournoiStat[],
  joueurs: Map<string, JoueurStat>,
  eloDe: EloDe,
  nFavoris = 4,
): { repartition: { etape: string; n: number }[]; lignes: SortieFavori[]; nbFavoris: number } {
  const lignes: SortieFavori[] = [];
  for (const t of tournois) {
    const dujeu = matchs.filter((m) => m.tournament_id === t.id && matchDecide(m));
    if (dujeu.length === 0) continue;
    const ids = new Set<string>();
    for (const m of matchs.filter((x) => x.tournament_id === t.id)) {
      if (m.player1_id) ids.add(m.player1_id);
      if (m.player2_id) ids.add(m.player2_id);
    }
    const favoris = [...ids]
      .map((id) => ({ id, elo: eloDe(id, t.surface) }))
      .filter((x): x is { id: string; elo: number } => x.elo !== null)
      .sort((a, b) => b.elo - a.elo)
      .slice(0, nFavoris);
    const finale = dujeu.find((m) => m.round === 'F');
    for (const f of favoris) {
      const defaite = dujeu.find((m) => m.round !== 'J1' && perdantDe(m) === f.id);
      let sortie: string | null = null;
      if (defaite) sortie = etapeDepuisFinale(defaite.round);
      else if (finale && finale.winner_id === f.id) sortie = 'Titre';
      if (sortie) lignes.push({ tournoi: t.name, joueur: nomDe(joueurs, f.id), sortie });
    }
  }
  const compte = new Map<string, number>();
  for (const l of lignes) compte.set(l.sortie, (compte.get(l.sortie) ?? 0) + 1);
  const ordre = ['Avant les huitièmes', 'Huitième', 'Quart', 'Demi-finale', 'Finale', 'Titre'];
  return {
    repartition: ordre.filter((e) => compte.has(e)).map((etape) => ({ etape, n: compte.get(etape) as number })),
    lignes,
    nbFavoris: lignes.length,
  };
}

/* -------------------------------------------------------------------------- */
/*  35 — formats : 2 sets ou 3 (et 3 ou 5)                                      */
/* -------------------------------------------------------------------------- */

export interface LigneFormat {
  libelle: string;
  matchs: number;
  allesAuBoutDesSets: number;
  part: number | null;
  jeuxMoyens: number | null;
}

/** Matchs menés « au bout » (3e set en bo3, 5e en bo5) selon la catégorie, la surface ou le circuit. */
export function formatsDeMatchs(
  matchs: MatchStat[],
  tournois: TournoiStat[],
  cle: (t: TournoiStat) => string,
): LigneFormat[] {
  const tournoiDe = new Map(tournois.map((t) => [t.id, t]));
  const groupes = new Map<string, MatchStat[]>();
  for (const m of matchs) {
    // Un abandon coupe le match : il fausserait le nombre de sets.
    if (m.status !== 'completed' || !matchJoue(m)) continue;
    const t = tournoiDe.get(m.tournament_id);
    if (!t) continue;
    groupes.set(cle(t), [...(groupes.get(cle(t)) ?? []), m]);
  }
  return [...groupes]
    .map(([libelle, liste]) => {
      const auBout = liste.filter((m) => {
        const t = tournoiDe.get(m.tournament_id)!;
        return (m.sets?.length ?? 0) >= (t.best_of === 5 ? 5 : 3);
      }).length;
      return {
        libelle,
        matchs: liste.length,
        allesAuBoutDesSets: auBout,
        part: part(auBout, liste.length),
        jeuxMoyens: moyenne(liste.map((m) => jeuxDuMatch(m).j1 + jeuxDuMatch(m).j2)),
      };
    })
    .sort((a, b) => b.matchs - a.matchs);
}

/* -------------------------------------------------------------------------- */
/*  36 — tie-breaks                                                            */
/* -------------------------------------------------------------------------- */

/** Un set joué au tie-break (7-6 ou 6-7), vu du côté 1 ou 2. */
function estTieBreak(s: SetStat): boolean {
  const g1 = s.g1 ?? 0;
  const g2 = s.g2 ?? 0;
  return (g1 === 7 && g2 === 6) || (g1 === 6 && g2 === 7);
}

export function tieBreaks(
  matchs: MatchStat[],
  joueurs: Map<string, JoueurStat>,
): {
  sets: number;
  tieBreaks: number;
  top: { joueur: string; gagnes: number; joues: number; taux: number | null }[];
} {
  let sets = 0;
  let total = 0;
  const parJoueur = new Map<string, { g: number; n: number }>();
  for (const m of matchs.filter(matchJoue)) {
    for (const s of m.sets ?? []) {
      sets++;
      if (!estTieBreak(s)) continue;
      total++;
      const gagnant = (s.g1 ?? 0) > (s.g2 ?? 0) ? m.player1_id : m.player2_id;
      for (const id of [m.player1_id, m.player2_id]) {
        if (!id) continue;
        const c = parJoueur.get(id) ?? { g: 0, n: 0 };
        c.n++;
        if (id === gagnant) c.g++;
        parJoueur.set(id, c);
      }
    }
  }
  const top = [...parJoueur]
    .filter(([, c]) => c.n >= 3)
    .map(([id, c]) => ({ joueur: nomDe(joueurs, id), gagnes: c.g, joues: c.n, taux: part(c.g, c.n) }))
    .sort((a, b) => b.gagnes - a.gagnes || (b.taux ?? 0) - (a.taux ?? 0))
    .slice(0, 8);
  return { sets, tieBreaks: total, top };
}

/* -------------------------------------------------------------------------- */
/*  37 — abandons et forfaits                                                  */
/* -------------------------------------------------------------------------- */

export function abandonsEtForfaits(
  matchs: MatchStat[],
  tournois: TournoiStat[],
  joueurs: Map<string, JoueurStat>,
): {
  abandons: number;
  forfaits: number;
  parTournoi: { tournoi: string; abandons: number; forfaits: number }[];
  parSurface: { surface: string; abandons: number; forfaits: number; matchs: number }[];
  parJoueur: { joueur: string; n: number }[];
} {
  const tournoiDe = new Map(tournois.map((t) => [t.id, t]));
  const parTournoi = new Map<string, { a: number; f: number }>();
  const parSurface = new Map<string, { a: number; f: number; m: number }>();
  const parJoueur = new Map<string, number>();
  let abandons = 0;
  let forfaits = 0;
  for (const m of matchs) {
    const t = tournoiDe.get(m.tournament_id);
    if (!t) continue;
    const surf = t.surface ?? 'inconnue';
    const s = parSurface.get(surf) ?? { a: 0, f: 0, m: 0 };
    if (matchDecide(m)) s.m++;
    if (m.status === 'retired' || m.status === 'walkover') {
      const c = parTournoi.get(t.name) ?? { a: 0, f: 0 };
      if (m.status === 'retired') {
        abandons++;
        c.a++;
        s.a++;
      } else {
        forfaits++;
        c.f++;
        s.f++;
      }
      parTournoi.set(t.name, c);
      const p = perdantDe(m);
      if (p) parJoueur.set(p, (parJoueur.get(p) ?? 0) + 1);
    }
    parSurface.set(surf, s);
  }
  return {
    abandons,
    forfaits,
    parTournoi: [...parTournoi]
      .map(([tournoi, c]) => ({ tournoi, abandons: c.a, forfaits: c.f }))
      .sort((a, b) => b.abandons + b.forfaits - (a.abandons + a.forfaits))
      .slice(0, 8),
    parSurface: [...parSurface].map(([surface, c]) => ({ surface, abandons: c.a, forfaits: c.f, matchs: c.m })),
    parJoueur: [...parJoueur]
      .map(([id, n]) => ({ joueur: nomDe(joueurs, id), n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8),
  };
}

/* -------------------------------------------------------------------------- */
/*  38 — spécialistes et polyvalents                                           */
/* -------------------------------------------------------------------------- */

export interface EloSurfaces {
  dur: number;
  terre: number;
  gazon: number;
}

export interface ProfilSurface {
  joueur: string;
  matchs: number;
  ecart: number;
  meilleure: 'dur' | 'terre' | 'gazon';
  elos: EloSurfaces;
}

export function profilsDeSurface(
  matchs: MatchStat[],
  joueurs: Map<string, JoueurStat>,
  elosSurfaces: (id: string) => EloSurfaces | null,
  minMatchs = 4,
): { specialistes: ProfilSurface[]; polyvalents: ProfilSurface[] } {
  const nb = new Map<string, number>();
  for (const m of matchs.filter(matchJoue)) {
    for (const id of [m.player1_id, m.player2_id]) if (id) nb.set(id, (nb.get(id) ?? 0) + 1);
  }
  const profils: ProfilSurface[] = [];
  for (const [id, n] of nb) {
    if (n < minMatchs) continue;
    const e = elosSurfaces(id);
    if (!e) continue;
    const entrees = Object.entries(e) as ['dur' | 'terre' | 'gazon', number][];
    const meilleure = entrees.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    const valeurs = entrees.map(([, v]) => v);
    profils.push({ joueur: nomDe(joueurs, id), matchs: n, ecart: Math.max(...valeurs) - Math.min(...valeurs), meilleure, elos: e });
  }
  profils.sort((a, b) => b.ecart - a.ecart);
  return { specialistes: profils.slice(0, 8), polyvalents: [...profils].reverse().slice(0, 8) };
}

/* -------------------------------------------------------------------------- */
/*  39 — pays                                                                  */
/* -------------------------------------------------------------------------- */

export function parPays(
  matchs: MatchStat[],
  joueurs: Map<string, JoueurStat>,
): { pays: string; victoires: number; defaites: number; taux: number | null }[] {
  const c = new Map<string, { v: number; d: number }>();
  for (const m of matchs.filter(matchJoue)) {
    const g = joueurs.get(m.winner_id as string)?.country;
    const p = joueurs.get(perdantDe(m) as string)?.country;
    if (g) c.set(g, { v: (c.get(g)?.v ?? 0) + 1, d: c.get(g)?.d ?? 0 });
    if (p) c.set(p, { v: c.get(p)?.v ?? 0, d: (c.get(p)?.d ?? 0) + 1 });
  }
  return [...c]
    .map(([pays, x]) => ({ pays, victoires: x.v, defaites: x.d, taux: part(x.v, x.v + x.d) }))
    .sort((a, b) => b.victoires - a.victoires || a.pays.localeCompare(b.pays))
    .slice(0, 12);
}

/* -------------------------------------------------------------------------- */
/*  40 — parcours les plus longs                                               */
/* -------------------------------------------------------------------------- */

export interface Parcours {
  tournoi: string;
  joueur: string;
  matchs: number;
  sets: number;
  jeux: number;
}

export function parcoursLesPlusLongs(
  matchs: MatchStat[],
  tournois: TournoiStat[],
  joueurs: Map<string, JoueurStat>,
  n = 8,
): Parcours[] {
  const tournoiDe = new Map(tournois.map((t) => [t.id, t]));
  const c = new Map<string, Parcours>();
  for (const m of matchs.filter(matchJoue)) {
    const t = tournoiDe.get(m.tournament_id);
    if (!t) continue;
    const { j1, j2 } = jeuxDuMatch(m);
    for (const [id, jeux] of [
      [m.player1_id, j1],
      [m.player2_id, j2],
    ] as [string | null, number][]) {
      if (!id) continue;
      const cle = `${m.tournament_id}|${id}`;
      const p = c.get(cle) ?? { tournoi: t.name, joueur: nomDe(joueurs, id), matchs: 0, sets: 0, jeux: 0 };
      p.matchs++;
      p.sets += m.sets?.length ?? 0;
      p.jeux += jeux + (id === m.player1_id ? j2 : j1);
      c.set(cle, p);
    }
  }
  return [...c.values()].sort((a, b) => b.jeux - a.jeux || b.matchs - a.matchs).slice(0, n);
}

/* -------------------------------------------------------------------------- */
/*  41 — matchs serrés, marathons et roues de bicyclette                        */
/* -------------------------------------------------------------------------- */

export interface MatchRemarquable {
  tournoi: string;
  round: string;
  vainqueur: string;
  perdant: string;
  score: string;
  jeux: number;
}

export function matchsRemarquables(
  matchs: MatchStat[],
  tournois: TournoiStat[],
  joueurs: Map<string, JoueurStat>,
  n = 6,
): {
  marathons: MatchRemarquable[];
  serres: MatchRemarquable[];
  roues: number;
  matchsBlancs: number;
  joueursAvecRoues: { joueur: string; n: number }[];
} {
  const tournoiDe = new Map(tournois.map((t) => [t.id, t]));
  const joues = matchs.filter((m) => m.status === 'completed' && matchJoue(m));
  const decrire = (m: MatchStat): MatchRemarquable => {
    const { j1, j2 } = jeuxDuMatch(m);
    return {
      tournoi: tournoiDe.get(m.tournament_id)?.name ?? '?',
      round: m.round,
      vainqueur: nomDe(joueurs, m.winner_id),
      perdant: nomDe(joueurs, perdantDe(m)),
      score: formaterScore(m.sets),
      jeux: j1 + j2,
    };
  };
  const marathons = [...joues].sort((a, b) => decrire(b).jeux - decrire(a).jeux).slice(0, n).map(decrire);
  // Serré : peu d'écart de jeux sur un match d'au moins 3 sets.
  const serres = joues
    .filter((m) => (m.sets?.length ?? 0) >= 3)
    .sort((a, b) => {
      const ea = Math.abs(jeuxDuMatch(a).j1 - jeuxDuMatch(a).j2);
      const eb = Math.abs(jeuxDuMatch(b).j1 - jeuxDuMatch(b).j2);
      return ea - eb || decrire(b).jeux - decrire(a).jeux;
    })
    .slice(0, n)
    .map(decrire);

  let roues = 0;
  let matchsBlancs = 0;
  const donneur = new Map<string, number>();
  for (const m of joues) {
    for (const s of m.sets ?? []) {
      const g1 = s.g1 ?? 0;
      const g2 = s.g2 ?? 0;
      if ((g1 === 6 && g2 === 0) || (g1 === 0 && g2 === 6)) {
        roues++;
        const gagnant = g1 > g2 ? m.player1_id : m.player2_id;
        if (gagnant) donneur.set(gagnant, (donneur.get(gagnant) ?? 0) + 1);
      }
    }
    if ((m.sets ?? []).length > 0 && (m.sets ?? []).every((s) => (s.g1 === 6 && s.g2 === 0) || (s.g1 === 0 && s.g2 === 6))) {
      matchsBlancs++;
    }
  }
  return {
    marathons,
    serres,
    roues,
    matchsBlancs,
    joueursAvecRoues: [...donneur]
      .map(([id, c]) => ({ joueur: nomDe(joueurs, id), n: c }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 5),
  };
}
