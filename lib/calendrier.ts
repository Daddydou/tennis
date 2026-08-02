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
  | 'WTA250'
  | 'WTA125'
  | 'WTAFinals';

interface Fiche {
  surface: Surface;
  categorie: Categorie;
  /** Semaine ISO de début, calendrier ATP habituel. */
  semaine: number;
  /**
   * Libellé d'affichage, quand le slug ne suffit pas à le reconstituer :
   * « canadian-open » est le Canada et non « Canadian Open », « china-open »
   * est Pékin. Absent, le nom est dérivé du slug (`prettifyName` à l'import).
   */
  nom?: string;
}

const H = 'hard' as const;
const T = 'clay' as const;
const G = 'grass' as const;

/**
 * Clé = slug ATP. Sert aussi de repli au circuit féminin pour les tournois
 * communs aux deux calendriers (cf. `CALENDRIER_WTA`).
 *
 * `nom` n'est renseigné que là où le slug ne se laisse pas embellir tout seul :
 * « us-open » donnerait « Us Open », « atp-finals » « Atp Finals ». Partout
 * ailleurs, l'import dérive le nom du slug.
 */
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
  'rio-de-janeiro': { surface: T, categorie: 'ATP500', semaine: 8, nom: 'Rio de Janeiro' },
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
  's-hertogenbosch': { surface: G, categorie: 'ATP250', semaine: 24, nom: 'Bois-le-Duc' },
  'stuttgart': { surface: G, categorie: 'ATP250', semaine: 24 },
  'halle': { surface: G, categorie: 'ATP500', semaine: 25 },
  'queens': { surface: G, categorie: 'ATP500', semaine: 25, nom: 'Queen’s' },
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
  'us-open': { surface: H, categorie: 'GS', semaine: 35, nom: 'US Open' },

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
  'atp-finals': { surface: H, categorie: 'Finals', semaine: 46, nom: 'ATP Finals' },
  'turin': { surface: H, categorie: 'Finals', semaine: 46, nom: 'ATP Finals' },
};

/**
 * Fiches PROPRES au circuit féminin, consultées avant `CALENDRIER`.
 *
 * ⚠ Les clés sont les slugs RÉELS de wtatennis.com, relevés dans le plan du
 * site (`/sitemap/tournaments.xml`) — pas le nom courant du tournoi. Les URL
 * y prennent deux formes, et la seconde est trompeuse :
 *
 *   /tournaments/{slug}/draws                  → madrid-open, china-open…
 *   /tournaments/{id}/{slug}/{annee}/draws     → 1024/seoul, 1075/wuhan…
 *
 * D'où « canadian-open » et non montreal, « china-open » et non beijing,
 * « miami-open », « madrid-open », « cincinnati-open », « wuhan-open ». Les
 * noms courants restent acceptés via `ALIAS_WTA`.
 *
 * Surface, catégorie et semaine viennent de l'API publique de la WTA
 * (api.wtatennis.com/tennis/tournaments), calendrier 2026. Le nom d'affichage
 * est celui d'usage en français.
 *
 * Deux raisons pour un tournoi d'y figurer plutôt que de retomber sur la fiche
 * ATP :
 *   1. il n'a pas d'équivalent masculin (Charleston, Berlin, Wuhan…) ;
 *   2. le slug est partagé mais la fiche diffère — Stuttgart est sur terre
 *      battue indoor en avril chez les femmes et sur gazon en juin chez les
 *      hommes ; Miami commence une semaine plus tôt ; Doha et Pékin sont des
 *      ATP 500 et des WTA 1000, que la traduction de `pourTour` ne rattrape
 *      pas.
 */
const CALENDRIER_WTA: Record<string, Fiche> = {
  // — Janvier : tournée australienne
  // Épreuve par équipes mixte : la fiche sert à la dater et à la situer, son
  // tableau n'a pas la forme d'un tableau à élimination directe.
  'united-cup': { surface: H, categorie: 'WTA500', semaine: 1, nom: 'United Cup' },
  'brisbane': { surface: H, categorie: 'WTA500', semaine: 2, nom: 'Brisbane' },
  'auckland': { surface: H, categorie: 'WTA250', semaine: 2, nom: 'Auckland' },
  'hobart': { surface: H, categorie: 'WTA250', semaine: 3, nom: 'Hobart' },
  'adelaide': { surface: H, categorie: 'WTA500', semaine: 3, nom: 'Adélaïde' },
  'australian-open': { surface: H, categorie: 'GS', semaine: 4, nom: 'Australian Open' },

  // — Février : indoor européen, Golfe, Amérique du Nord
  'ostrava': { surface: H, categorie: 'WTA250', semaine: 6, nom: 'Ostrava' },
  'cluj-napoca': { surface: H, categorie: 'WTA250', semaine: 6, nom: 'Cluj-Napoca' },
  'abu-dhabi': { surface: H, categorie: 'WTA500', semaine: 6, nom: 'Abu Dhabi' },
  'doha': { surface: H, categorie: 'WTA1000', semaine: 7, nom: 'Doha' },
  'dubai': { surface: H, categorie: 'WTA1000', semaine: 8, nom: 'Dubaï' },
  'austin': { surface: H, categorie: 'WTA250', semaine: 9, nom: 'Austin' },
  'merida': { surface: H, categorie: 'WTA500', semaine: 9, nom: 'Mérida' },

  // — Mars : « Sunshine Double » (une semaine plus tôt que chez les hommes)
  'indian-wells': { surface: H, categorie: 'WTA1000', semaine: 10, nom: 'Indian Wells' },
  'miami-open': { surface: H, categorie: 'WTA1000', semaine: 12, nom: 'Miami' },

  // — Avril-mai : saison sur terre
  'charleston': { surface: T, categorie: 'WTA500', semaine: 14, nom: 'Charleston' },
  'bogota': { surface: T, categorie: 'WTA250', semaine: 14, nom: 'Bogota' },
  // Linz a quitté l'indoor sur dur de février pour la terre battue d'avril.
  'linz': { surface: T, categorie: 'WTA500', semaine: 15, nom: 'Linz' },
  'rouen': { surface: T, categorie: 'WTA250', semaine: 16, nom: 'Rouen' },
  'stuttgart': { surface: T, categorie: 'WTA500', semaine: 16, nom: 'Stuttgart' },
  'madrid-open': { surface: T, categorie: 'WTA1000', semaine: 17, nom: 'Madrid' },
  'rome': { surface: T, categorie: 'WTA1000', semaine: 19, nom: 'Rome' },
  'strasbourg': { surface: T, categorie: 'WTA500', semaine: 21, nom: 'Strasbourg' },
  'rabat': { surface: T, categorie: 'WTA250', semaine: 21, nom: 'Rabat' },
  'roland-garros': { surface: T, categorie: 'GS', semaine: 22, nom: 'Roland-Garros' },

  // — Juin : gazon
  'queens': { surface: G, categorie: 'WTA500', semaine: 24, nom: 'Queen’s' },
  's-hertogenbosch': { surface: G, categorie: 'WTA250', semaine: 24, nom: 'Bois-le-Duc' },
  'nottingham': { surface: G, categorie: 'WTA250', semaine: 25, nom: 'Nottingham' },
  'berlin': { surface: G, categorie: 'WTA500', semaine: 25, nom: 'Berlin' },
  'bad-homburg': { surface: G, categorie: 'WTA500', semaine: 26, nom: 'Bad Homburg' },
  'eastbourne': { surface: G, categorie: 'WTA250', semaine: 26, nom: 'Eastbourne' },
  'wimbledon': { surface: G, categorie: 'GS', semaine: 27, nom: 'Wimbledon' },

  // — Juillet : semaines d'après-Wimbledon, dur et terre mêlés
  'athens': { surface: H, categorie: 'WTA250', semaine: 29, nom: 'Athènes' },
  'iasi': { surface: T, categorie: 'WTA250', semaine: 29, nom: 'Iasi' },
  'prague': { surface: H, categorie: 'WTA250', semaine: 30, nom: 'Prague' },
  'hamburg': { surface: T, categorie: 'WTA250', semaine: 30, nom: 'Hambourg' },

  // — Août : tournée américaine
  'washington-dc': { surface: H, categorie: 'WTA500', semaine: 31, nom: 'Washington' },
  'memphis': { surface: H, categorie: 'WTA250', semaine: 31, nom: 'Memphis' },
  // Alterne Montréal et Toronto d'une année sur l'autre : le nom de la ville
  // serait faux une année sur deux.
  'canadian-open': { surface: H, categorie: 'WTA1000', semaine: 32, nom: 'Open du Canada' },
  'cincinnati-open': { surface: H, categorie: 'WTA1000', semaine: 33, nom: 'Cincinnati' },
  'monterrey': { surface: H, categorie: 'WTA500', semaine: 35, nom: 'Monterrey' },
  'us-open': { surface: H, categorie: 'GS', semaine: 36, nom: 'US Open' },

  // — Septembre-novembre : tournée asiatique puis Finals
  'guadalajara-500': { surface: H, categorie: 'WTA500', semaine: 38, nom: 'Guadalajara' },
  'sao-paulo': { surface: H, categorie: 'WTA250', semaine: 38, nom: 'São Paulo' },
  'seoul': { surface: H, categorie: 'WTA250', semaine: 39, nom: 'Séoul' },
  'singapore': { surface: H, categorie: 'WTA500', semaine: 39, nom: 'Singapour' },
  'china-open': { surface: H, categorie: 'WTA1000', semaine: 40, nom: 'Pékin' },
  'wuhan-open': { surface: H, categorie: 'WTA1000', semaine: 42, nom: 'Wuhan' },
  'ningbo': { surface: H, categorie: 'WTA500', semaine: 43, nom: 'Ningbo' },
  'osaka': { surface: H, categorie: 'WTA250', semaine: 43, nom: 'Osaka' },
  'guangzhou': { surface: H, categorie: 'WTA250', semaine: 44, nom: 'Canton' },
  'tokyo': { surface: H, categorie: 'WTA500', semaine: 44, nom: 'Tokyo' },
  'hong-kong': { surface: H, categorie: 'WTA250', semaine: 45, nom: 'Hong Kong' },
  'chennai': { surface: H, categorie: 'WTA250', semaine: 45, nom: 'Chennai' },
  'wta-finals': { surface: H, categorie: 'WTAFinals', semaine: 46, nom: 'WTA Finals' },

  // — Éditions passées : tournois sortis du calendrier 2026, ou rétrogradés en
  //   WTA 125. Les garder permet de réimporter une saison antérieure sans
  //   retomber sur les valeurs par défaut.
  'lyon': { surface: H, categorie: 'WTA250', semaine: 6, nom: 'Lyon' },
  'cleveland': { surface: H, categorie: 'WTA250', semaine: 34, nom: 'Cleveland' },
  'zhengzhou': { surface: H, categorie: 'WTA500', semaine: 39, nom: 'Zhengzhou' },
  'birmingham': { surface: G, categorie: 'WTA125', semaine: 23, nom: 'Birmingham' },
  'palermo': { surface: T, categorie: 'WTA125', semaine: 30, nom: 'Palerme' },
  'budapest': { surface: T, categorie: 'WTA250', semaine: 30, nom: 'Budapest' },
  'warsaw': { surface: T, categorie: 'WTA125', semaine: 32, nom: 'Varsovie' },
};

/**
 * Slugs acceptés en entrée qui désignent une fiche portant un autre nom.
 *
 * Deux sources : le nom courant du tournoi (« montreal », « beijing »), et les
 * variantes de slug que la WTA a employées d'une saison à l'autre. Un alias ne
 * porte AUCUNE donnée — il ne fait que pointer une fiche, pour qu'il n'existe
 * jamais deux vérités sur la même semaine.
 */
const ALIAS_WTA: Record<string, string> = {
  // Noms courants → slug officiel
  'montreal': 'canadian-open',
  'toronto': 'canadian-open',
  'canada': 'canadian-open',
  'beijing': 'china-open',
  'wuhan': 'wuhan-open',
  'madrid': 'madrid-open',
  'miami': 'miami-open',
  'cincinnati': 'cincinnati-open',
  'guadalajara': 'guadalajara-500',
  'washington': 'washington-dc',
  'seoul-open': 'seoul',
  'canton': 'guangzhou',

  // Variantes officielles ou historiques du même tournoi
  'italian-open': 'rome',
  'internazionali-bnl-ditalia': 'rome',
  'french-open': 'roland-garros',
  'the-championships': 'wimbledon',
  'qatar-open': 'doha',
  'qatar-totalenergies-open': 'doha',
  'dubai-duty-free': 'dubai',
  'mutua-madrid-open': 'madrid-open',
  'national-bank-open': 'canadian-open',
  'western-southern-open': 'cincinnati-open',
  // Le slug WTA de Bois-le-Duc porte l'apostrophe de « 's-Hertogenbosch »,
  // rendue par un tiret en tête d'URL.
  '-s-hertogenbosch': 's-hertogenbosch',
  'libema-open': 's-hertogenbosch',
  // Les Finals se jouent à Riyad depuis 2024 ; certains tableaux portent la
  // ville plutôt que l'épreuve.
  'riyadh': 'wta-finals',
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
