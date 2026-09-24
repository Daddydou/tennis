/**
 * BILAN DE SAISON — agrégats descriptifs, calculés à la volée.
 *
 * Module PUR : il ne fait que regrouper des chiffres déjà produits ailleurs
 * (points des picks et du Bracket, historique Fantasy, relevés Elo archivés).
 * Aucun barème n'est réimplémenté ici, et rien n'est réinjecté dans le moteur :
 * c'est un compte rendu, pas une calibration.
 */

import { STATUTS_DECIDES } from './types';
import type { MatchStatus } from './types';

/* -------------------------------------------------------------------------- */
/*  Progression Elo                                                            */
/* -------------------------------------------------------------------------- */

/** Un relevé Elo archivé (ta_elo_historique) d'un joueur. */
export interface ReleveElo {
  slug: string;
  nom: string;
  releveLe: string;
  elo: number | null;
}

export interface ProgressionElo {
  slug: string;
  nom: string;
  depart: number;
  arrivee: number;
  delta: number;
  /** Premier et dernier relevé de CE joueur — pas forcément ceux de la période. */
  du: string;
  au: string;
}

export interface BilanElo {
  /** Premier et dernier relevé de toute l'archive lue. null : archive vide. */
  du: string | null;
  au: string | null;
  nbReleves: number;
  /** Tous les joueurs mesurables, du plus progressé au plus régressé. */
  progressions: ProgressionElo[];
}

/**
 * Progression de l'Elo général de chaque joueur entre son premier et son
 * dernier relevé. Un joueur relevé une seule fois (ou à une seule date) n'a
 * pas de progression mesurable : il est écarté, jamais compté à 0.
 */
export function progressionsElo(releves: ReleveElo[]): BilanElo {
  const dates = [...new Set(releves.map((r) => r.releveLe))].sort();
  const parJoueur = new Map<string, ReleveElo[]>();
  for (const r of releves) {
    if (r.elo === null) continue;
    const l = parJoueur.get(r.slug) ?? [];
    l.push(r);
    parJoueur.set(r.slug, l);
  }

  const progressions: ProgressionElo[] = [];
  for (const [slug, liste] of parJoueur) {
    liste.sort((a, b) => a.releveLe.localeCompare(b.releveLe));
    const premier = liste[0];
    const dernier = liste[liste.length - 1];
    if (premier.releveLe === dernier.releveLe) continue;
    progressions.push({
      slug,
      nom: dernier.nom,
      depart: premier.elo!,
      arrivee: dernier.elo!,
      delta: dernier.elo! - premier.elo!,
      du: premier.releveLe,
      au: dernier.releveLe,
    });
  }
  progressions.sort((a, b) => b.delta - a.delta || a.nom.localeCompare(b.nom));

  return {
    du: dates[0] ?? null,
    au: dates[dates.length - 1] ?? null,
    nbReleves: dates.length,
    progressions,
  };
}

/* -------------------------------------------------------------------------- */
/*  Points du jeu, par stock                                                   */
/* -------------------------------------------------------------------------- */

/** Points d'un stock sur un tournoi (déjà calculés par pointsStock.ts). */
export interface PointsTournoi {
  tournoiId: string;
  stockId: string | null;
  picks: number;
  /** null : aucun pronostic de Bracket sur ce tournoi (≠ 0 point). */
  bracket: number | null;
}

export interface BilanStock {
  stockId: string | null;
  picks: number;
  bracket: number;
  total: number;
  /** Tournois où le stock a marqué ou pronostiqué quelque chose. */
  nbTournois: number;
  meilleur: { tournoiId: string; points: number } | null;
}

/**
 * Cumul de la saison pour chaque stock, dans l'ordre des `stocks` fournis
 * (moi d'abord). Un stock sans aucune ligne apparaît quand même, à 0.
 */
export function cumulSaison(
  stocks: (string | null)[],
  lignes: PointsTournoi[],
): BilanStock[] {
  return stocks.map((stockId) => {
    const siennes = lignes.filter((l) => l.stockId === stockId);
    let picks = 0;
    let bracket = 0;
    let meilleur: BilanStock['meilleur'] = null;
    for (const l of siennes) {
      const pts = l.picks + (l.bracket ?? 0);
      picks += l.picks;
      bracket += l.bracket ?? 0;
      if (pts > 0 && (!meilleur || pts > meilleur.points)) {
        meilleur = { tournoiId: l.tournoiId, points: pts };
      }
    }
    return {
      stockId,
      picks,
      bracket,
      total: picks + bracket,
      nbTournois: new Set(siennes.map((l) => l.tournoiId)).size,
      meilleur,
    };
  });
}

/** Joueurs qui ont rapporté le plus de points aux picks d'un stock. */
export function joueursLesPlusRentables(
  picks: { player_id: string; points: number | null }[],
  limite = 5,
): { playerId: string; points: number; fois: number }[] {
  const parJoueur = new Map<string, { points: number; fois: number }>();
  for (const p of picks) {
    const e = parJoueur.get(p.player_id) ?? { points: 0, fois: 0 };
    e.points += p.points ?? 0;
    e.fois += 1;
    parJoueur.set(p.player_id, e);
  }
  return [...parJoueur]
    .map(([playerId, e]) => ({ playerId, ...e }))
    .filter((e) => e.points > 0)
    .sort((a, b) => b.points - a.points || b.fois - a.fois)
    .slice(0, limite);
}

/* -------------------------------------------------------------------------- */
/*  Tableau : victoires, Fantasy                                              */
/* -------------------------------------------------------------------------- */

/**
 * Joueurs aux plus nombreuses victoires dans les tournois importés. Les byes
 * ne sont pas des victoires ; un w.o. ou un abandon de l'adversaire, si
 * (c'est le vainqueur désigné du match).
 */
export function joueursLesPlusVictorieux(
  matches: { winner_id: string | null; status: MatchStatus }[],
  limite = 10,
): { playerId: string; victoires: number }[] {
  const compte = new Map<string, number>();
  for (const m of matches) {
    if (m.status === 'bye' || !m.winner_id || !STATUTS_DECIDES.includes(m.status)) continue;
    compte.set(m.winner_id, (compte.get(m.winner_id) ?? 0) + 1);
  }
  return [...compte]
    .map(([playerId, victoires]) => ({ playerId, victoires }))
    .sort((a, b) => b.victoires - a.victoires)
    .slice(0, limite);
}

export interface BilanFantasy {
  /** Tournois terminés, les seuls dont le score réel est définitif. */
  termines: number;
  reel: number;
  predit: number;
  meilleur: { tournoiId: string; reel: number } | null;
}

/** Fantasy de la saison, sur les seuls tournois terminés (cf. app/fantasy). */
export function bilanFantasy(
  lignes: { tournoiId: string; predit: number; reel: number; termine: boolean }[],
): BilanFantasy {
  const termines = lignes.filter((l) => l.termine);
  let meilleur: BilanFantasy['meilleur'] = null;
  for (const l of termines) {
    if (!meilleur || l.reel > meilleur.reel) meilleur = { tournoiId: l.tournoiId, reel: l.reel };
  }
  return {
    termines: termines.length,
    reel: termines.reduce((s, l) => s + l.reel, 0),
    predit: termines.reduce((s, l) => s + l.predit, 0),
    meilleur,
  };
}
