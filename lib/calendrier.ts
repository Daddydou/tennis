import type { Surface, Tour } from './types';
import {
  ALIAS_WTA,
  CALENDRIER,
  CALENDRIER_WTA,
  type Categorie,
  type Fiche,
} from './calendrierDonnees';

export type { Categorie } from './calendrierDonnees';

/**
 * Référentiel des tournois : surface, catégorie, semaine ISO de début.
 *
 * Remplace l'heuristique de `devinerSurface(slug, mois)`, qui se replie sur le
 * calendrier en utilisant le mois de l'EXTRACTION et non celui du tournoi :
 * importer un tableau en juillet classait l'Australian Open sur gazon.
 *
 * La semaine sert à reconstituer une date de début — l'extraction du
 * bookmarklet n'en contient aucune. Approximative à quelques jours près
 * (le calendrier bouge d'une année sur l'autre), ce qui suffit à ordonner
 * une saison.
 *
 * Les fiches elles-mêmes (CALENDRIER, CALENDRIER_WTA, ALIAS_WTA) sont dans
 * lib/calendrierDonnees.ts : c'est là qu'on ajoute un tournoi inconnu.
 */

/** Catégorie de repli quand le slug est inconnu : la plus fréquente. */
function categorieParDefaut(tour: Tour, drawSize: number | null): Categorie {
  if (tour === 'WTA') return drawSize && drawSize >= 96 ? 'WTA1000' : 'WTA250';
  return drawSize && drawSize >= 96 ? 'M1000' : 'ATP250';
}

/** Équivalent WTA d'une catégorie ATP, pour un slug partagé (Madrid, Rome…). */
function pourTour(c: Categorie, tour: Tour): Categorie {
  if (tour !== 'WTA') return c;
  if (c === 'GS') return 'GS';
  if (c === 'M1000') return 'WTA1000';
  if (c === 'ATP500') return 'WTA500';
  if (c === 'ATP250') return 'WTA250';
  return c;
}

function normaliser(slug: string | null): string | null {
  return slug ? slug.toLowerCase().trim() : null;
}

/**
 * Slug d'un WTA 125 (« madrid-125 », « antalya-125-2 », « oeiras-125-indoor-1 »).
 *
 * Ces tournois portent le nom d'une ville qui accueille souvent une épreuve du
 * circuit principal la même saison : le rapprochement approché ferait passer
 * « madrid-125 » (avril, 32 joueuses) pour le WTA 1000 de Madrid. On préfère un
 * tournoi non reconnu — donc signalé — à un tournoi mal classé.
 */
const EST_125 = /(^|-)125(-|$)/;

function fiche(slug: string | null, tour: Tour): Fiche | null {
  const s = normaliser(slug);
  if (!s) return null;

  // Le circuit féminin d'abord : ses fiches REDÉFINISSENT des slugs partagés
  // (stuttgart, lyon, doha…). Les chercher en second les laisserait capter la
  // fiche masculine.
  const tables = tour === 'WTA' ? [CALENDRIER_WTA, CALENDRIER] : [CALENDRIER];
  const cible = tour === 'WTA' ? ALIAS_WTA[s] ?? s : s;

  for (const table of tables) {
    if (table[cible]) return table[cible];
    if (EST_125.test(cible)) continue;
    // Slugs composés du type 'rolex-monte-carlo' ou 'us-open-tennis'. La clé la
    // plus longue gagne : sans cela « us-open » pourrait être capté par « open »
    // si une telle clé apparaissait un jour.
    const cle = Object.keys(table)
      .filter((k) => cible.includes(k))
      .sort((a, b) => b.length - a.length)[0];
    if (cle) return table[cle];
  }
  return null;
}

/** Lundi de la semaine ISO `semaine` de l'année `annee`, en 'YYYY-MM-DD'. */
export function lundiSemaineIso(annee: number, semaine: number): string {
  // Le 4 janvier tombe toujours dans la semaine ISO 1.
  const quatre = new Date(Date.UTC(annee, 0, 4));
  const jour = quatre.getUTCDay() || 7; // dimanche = 7
  const lundiS1 = new Date(quatre);
  lundiS1.setUTCDate(quatre.getUTCDate() - jour + 1);
  const d = new Date(lundiS1);
  d.setUTCDate(lundiS1.getUTCDate() + (semaine - 1) * 7);
  return d.toISOString().slice(0, 10);
}

export interface MetaTournoi {
  surface: Surface;
  categorie: Categorie;
  /** 'YYYY-MM-DD', ou null si le slug est inconnu. */
  startDate: string | null;
  /** Libellé d'affichage du référentiel, ou null : à l'appelant de se replier. */
  nom: string | null;
  /**
   * Le slug a-t-il été retrouvé ? `false` signale une fiche à ajouter ici :
   * tout ce qui suit (surface, catégorie, date) n'est alors qu'un défaut, et
   * l'import le signale plutôt que de le laisser passer pour une donnée.
   */
  reconnu: boolean;
}

/**
 * Surface / catégorie / date de début d'un tournoi.
 * Slug inconnu : surface 'hard' (la plus fréquente) et pas de date inventée.
 */
export function metaTournoi(
  slug: string | null,
  tour: Tour,
  annee: number,
  drawSize: number | null,
): MetaTournoi {
  const f = fiche(slug, tour);
  if (!f) {
    return {
      surface: 'hard',
      categorie: categorieParDefaut(tour, drawSize),
      startDate: null,
      nom: null,
      reconnu: false,
    };
  }
  return {
    surface: f.surface,
    categorie: pourTour(f.categorie, tour),
    startDate: lundiSemaineIso(annee, f.semaine),
    nom: f.nom ?? null,
    reconnu: true,
  };
}

export const LIBELLE_CATEGORIE: Record<string, string> = {
  GS: 'Grand Chelem',
  M1000: 'Masters 1000',
  ATP500: 'ATP 500',
  ATP250: 'ATP 250',
  Finals: 'ATP Finals',
  WTA1000: 'WTA 1000',
  WTA500: 'WTA 500',
  WTA250: 'WTA 250',
  WTA125: 'WTA 125',
  WTAFinals: 'WTA Finals',
};

/** Forme courte pour les tableaux. */
export const LIBELLE_CATEGORIE_COURT: Record<string, string> = {
  GS: 'GC',
  M1000: 'M1000',
  ATP500: 'ATP 500',
  ATP250: 'ATP 250',
  Finals: 'Finals',
  WTA1000: 'WTA 1000',
  WTA500: 'WTA 500',
  WTA250: 'WTA 250',
  WTA125: 'WTA 125',
  WTAFinals: 'Finals',
};
