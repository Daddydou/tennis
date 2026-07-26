import type { Surface, Tour } from './types';

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
 * Nouveau fichier : les modules du moteur fournis dans `lib/` restent intacts.
 */

export type Categorie =
  | 'GS'
  | 'M1000'
  | 'ATP500'
  | 'ATP250'
  | 'Finals'
  | 'WTA1000'
  | 'WTA500'
  | 'WTA250';

interface Fiche {
  surface: Surface;
  categorie: Categorie;
  /** Semaine ISO de début, calendrier ATP habituel. */
  semaine: number;
}

const H = 'hard' as const;
const T = 'clay' as const;
const G = 'grass' as const;

/** Clé = slug ATP. */
const CALENDRIER: Record<string, Fiche> = {
  // — Janvier : tournée australienne
  'brisbane': { surface: H, categorie: 'ATP250', semaine: 1 },
  'hong-kong': { surface: H, categorie: 'ATP250', semaine: 1 },
  'adelaide': { surface: H, categorie: 'ATP250', semaine: 2 },
  'auckland': { surface: H, categorie: 'ATP250', semaine: 2 },
  'australian-open': { surface: H, categorie: 'GS', semaine: 3 },

  // — Février : indoor européen, Golfe, Amérique du Sud
  'montpellier': { surface: H, categorie: 'ATP250', semaine: 6 },
  'dallas': { surface: H, categorie: 'ATP500', semaine: 6 },
  'cordoba': { surface: T, categorie: 'ATP250', semaine: 6 },
  'rotterdam': { surface: H, categorie: 'ATP500', semaine: 7 },
  'buenos-aires': { surface: T, categorie: 'ATP250', semaine: 7 },
  'delray-beach': { surface: H, categorie: 'ATP250', semaine: 7 },
  'doha': { surface: H, categorie: 'ATP500', semaine: 8 },
  'rio-de-janeiro': { surface: T, categorie: 'ATP500', semaine: 8 },
  'rio': { surface: T, categorie: 'ATP500', semaine: 8 },
  'marseille': { surface: H, categorie: 'ATP250', semaine: 8 },
  'dubai': { surface: H, categorie: 'ATP500', semaine: 9 },
  'acapulco': { surface: H, categorie: 'ATP500', semaine: 9 },
  'santiago': { surface: T, categorie: 'ATP250', semaine: 9 },

  // — Mars : « Sunshine Double »
  'indian-wells': { surface: H, categorie: 'M1000', semaine: 10 },
  'miami': { surface: H, categorie: 'M1000', semaine: 13 },

  // — Avril-mai : saison sur terre
  'houston': { surface: T, categorie: 'ATP250', semaine: 15 },
  'marrakech': { surface: T, categorie: 'ATP250', semaine: 15 },
  'monte-carlo': { surface: T, categorie: 'M1000', semaine: 15 },
  'barcelona': { surface: T, categorie: 'ATP500', semaine: 16 },
  'munich': { surface: T, categorie: 'ATP500', semaine: 16 },
  'madrid': { surface: T, categorie: 'M1000', semaine: 18 },
  'rome': { surface: T, categorie: 'M1000', semaine: 19 },
  'geneva': { surface: T, categorie: 'ATP250', semaine: 21 },
  'lyon': { surface: T, categorie: 'ATP250', semaine: 21 },
  'hamburg': { surface: T, categorie: 'ATP500', semaine: 21 },
  'roland-garros': { surface: T, categorie: 'GS', semaine: 22 },

  // — Juin-juillet : gazon
  's-hertogenbosch': { surface: G, categorie: 'ATP250', semaine: 24 },
  'stuttgart': { surface: G, categorie: 'ATP250', semaine: 24 },
  'halle': { surface: G, categorie: 'ATP500', semaine: 25 },
  'queens': { surface: G, categorie: 'ATP500', semaine: 25 },
  'eastbourne': { surface: G, categorie: 'ATP250', semaine: 26 },
  'mallorca': { surface: G, categorie: 'ATP250', semaine: 26 },
  'wimbledon': { surface: G, categorie: 'GS', semaine: 27 },

  // — Juillet-août : terre estivale puis tournée américaine
  'bastad': { surface: T, categorie: 'ATP250', semaine: 29 },
  'gstaad': { surface: T, categorie: 'ATP250', semaine: 30 },
  'umag': { surface: T, categorie: 'ATP250', semaine: 30 },
  'kitzbuhel': { surface: T, categorie: 'ATP250', semaine: 31 },
  'newport': { surface: G, categorie: 'ATP250', semaine: 29 },
  'atlanta': { surface: H, categorie: 'ATP250', semaine: 30 },
  'washington': { surface: H, categorie: 'ATP500', semaine: 31 },
  'los-cabos': { surface: H, categorie: 'ATP250', semaine: 31 },
  'toronto': { surface: H, categorie: 'M1000', semaine: 32 },
  'montreal': { surface: H, categorie: 'M1000', semaine: 32 },
  'canada': { surface: H, categorie: 'M1000', semaine: 32 },
  'cincinnati': { surface: H, categorie: 'M1000', semaine: 33 },
  'winston-salem': { surface: H, categorie: 'ATP250', semaine: 34 },
  'us-open': { surface: H, categorie: 'GS', semaine: 35 },

  // — Septembre-novembre : tournée asiatique puis indoor
  'chengdu': { surface: H, categorie: 'ATP250', semaine: 39 },
  'hangzhou': { surface: H, categorie: 'ATP250', semaine: 39 },
  'zhuhai': { surface: H, categorie: 'ATP250', semaine: 40 },
  'beijing': { surface: H, categorie: 'ATP500', semaine: 40 },
  'tokyo': { surface: H, categorie: 'ATP500', semaine: 40 },
  'shanghai': { surface: H, categorie: 'M1000', semaine: 41 },
  'almaty': { surface: H, categorie: 'ATP250', semaine: 43 },
  'antwerp': { surface: H, categorie: 'ATP250', semaine: 43 },
  'stockholm': { surface: H, categorie: 'ATP250', semaine: 43 },
  'vienna': { surface: H, categorie: 'ATP500', semaine: 44 },
  'basel': { surface: H, categorie: 'ATP500', semaine: 44 },
  'paris': { surface: H, categorie: 'M1000', semaine: 45 },
  'metz': { surface: H, categorie: 'ATP250', semaine: 45 },
  'atp-finals': { surface: H, categorie: 'Finals', semaine: 46 },
  'turin': { surface: H, categorie: 'Finals', semaine: 46 },
};

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

function fiche(slug: string | null): Fiche | null {
  const s = normaliser(slug);
  if (!s) return null;
  if (CALENDRIER[s]) return CALENDRIER[s];
  // Slugs composés du type 'madrid-open' ou 'rolex-monte-carlo'.
  const cle = Object.keys(CALENDRIER).find((k) => s.includes(k));
  return cle ? CALENDRIER[cle] : null;
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
  const f = fiche(slug);
  if (!f) {
    return {
      surface: 'hard',
      categorie: categorieParDefaut(tour, drawSize),
      startDate: null,
    };
  }
  return {
    surface: f.surface,
    categorie: pourTour(f.categorie, tour),
    startDate: lundiSemaineIso(annee, f.semaine),
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
};
