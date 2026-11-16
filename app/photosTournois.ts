/**
 * PHOTOS DES TOURNOIS — des vrais lieux, libres de droits (Wikimedia Commons).
 *
 * Module pur (ni React ni Next). Chaque photo montre le LIEU du tournoi
 * (stade, court central, abords), jamais un joueur en gros plan. Licences
 * Creative Commons : l'auteur et la licence s'affichent sous chaque grande
 * photo (FondTournoi.tsx) et tous sont listés sur /credits.
 *
 * Les images sont servies par Wikimedia (pas copiées chez nous) : `grand`
 * (1920 px ou l'original s'il est plus petit) pour les bandeaux, `petit`
 * (500 px) pour les vignettes. Sans photo, l'app retombe sur le court dessiné.
 *
 * Ajouter un tournoi : une entrée ici (clé = nom du tournoi en minuscules,
 * sans accents ni année), éventuellement un alias dans ALIAS ; le test
 * vérifie que chaque photo a son auteur, sa licence et sa page.
 */

export type PhotoTournoi = {
  cle: string;
  /** Ce que montre la photo, en clair (pour le crédit et le texte alternatif). */
  lieu: string;
  grand: string;
  petit: string;
  auteur: string;
  licence: string;
  /** Page de la photo sur Wikimedia Commons (auteur, licence complète). */
  page: string;
};

export const PHOTOS: PhotoTournoi[] = [
  {
    cle: 'atp finals',
    lieu: 'Inalpi Arena, Turin',
    grand: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2f/Piazzale_Grande_Torino%2C_Turin%2C_Italy.jpg/1920px-Piazzale_Grande_Torino%2C_Turin%2C_Italy.jpg',
    petit: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2f/Piazzale_Grande_Torino%2C_Turin%2C_Italy.jpg/500px-Piazzale_Grande_Torino%2C_Turin%2C_Italy.jpg',
    auteur: 'SetteTreSette',
    licence: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Piazzale_Grande_Torino,_Turin,_Italy.jpg',
  },
  {
    cle: 'indian wells',
    lieu: 'Indian Wells Tennis Garden',
    grand: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/68/Indian_Wells_Tennis_Garden_grounds_in_the_evening.jpg/1920px-Indian_Wells_Tennis_Garden_grounds_in_the_evening.jpg',
    petit: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/68/Indian_Wells_Tennis_Garden_grounds_in_the_evening.jpg/500px-Indian_Wells_Tennis_Garden_grounds_in_the_evening.jpg',
    auteur: 'IvanAndreevich',
    licence: 'CC BY 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Indian_Wells_Tennis_Garden_grounds_in_the_evening.jpg',
  },
  {
    cle: 'paris',
    lieu: 'Plenitude Arena (ex-Paris La Défense Arena)',
    grand: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/dd/Enseignes_Naming_Plenitude_Arena.jpg/1920px-Enseignes_Naming_Plenitude_Arena.jpg',
    petit: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/dd/Enseignes_Naming_Plenitude_Arena.jpg/500px-Enseignes_Naming_Plenitude_Arena.jpg',
    auteur: 'Solts',
    licence: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Enseignes_Naming_Plenitude_Arena.jpg',
  },
  {
    cle: 'roland garros',
    lieu: 'Court Philippe-Chatrier, Paris',
    grand: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/df/Stade_Roland_Garros%2C_Paris_%28Ank_Kumar%2C_Infosys_ltd%29_05.jpg/1920px-Stade_Roland_Garros%2C_Paris_%28Ank_Kumar%2C_Infosys_ltd%29_05.jpg',
    petit: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/df/Stade_Roland_Garros%2C_Paris_%28Ank_Kumar%2C_Infosys_ltd%29_05.jpg/500px-Stade_Roland_Garros%2C_Paris_%28Ank_Kumar%2C_Infosys_ltd%29_05.jpg',
    auteur: 'Ank Kumar',
    licence: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Stade_Roland_Garros,_Paris_(Ank_Kumar,_Infosys_ltd)_05.jpg',
  },
  {
    cle: 'wimbledon',
    lieu: 'Centre Court, Wimbledon',
    grand: 'https://upload.wikimedia.org/wikipedia/commons/9/9f/Wimbledon_Centre_Court_-_geograph.org.uk_-_4872701.jpg',
    petit: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9f/Wimbledon_Centre_Court_-_geograph.org.uk_-_4872701.jpg/500px-Wimbledon_Centre_Court_-_geograph.org.uk_-_4872701.jpg',
    auteur: 'Paul Gillett',
    licence: 'CC BY-SA 2.0',
    page: 'https://commons.wikimedia.org/wiki/File:Wimbledon_Centre_Court_-_geograph.org.uk_-_4872701.jpg',
  },
  {
    cle: 'us open',
    lieu: 'Arthur Ashe Stadium, New York',
    grand: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/06/Arthur_Ashe_Stadium_View.JPG/1920px-Arthur_Ashe_Stadium_View.JPG',
    petit: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/06/Arthur_Ashe_Stadium_View.JPG/500px-Arthur_Ashe_Stadium_View.JPG',
    auteur: 'Alexisrael',
    licence: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Arthur_Ashe_Stadium_View.JPG',
  },
  {
    cle: 'australian open',
    lieu: 'Rod Laver Arena, Melbourne',
    grand: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/08/Rod_Laver_Arena_Melbourne_Park_Australian_Open_2023_quarter_final_dusk.jpg/1920px-Rod_Laver_Arena_Melbourne_Park_Australian_Open_2023_quarter_final_dusk.jpg',
    petit: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/08/Rod_Laver_Arena_Melbourne_Park_Australian_Open_2023_quarter_final_dusk.jpg/500px-Rod_Laver_Arena_Melbourne_Park_Australian_Open_2023_quarter_final_dusk.jpg',
    auteur: 'Gracchus250',
    licence: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Rod_Laver_Arena_Melbourne_Park_Australian_Open_2023_quarter_final_dusk.jpg',
  },
  {
    cle: 'vienna',
    lieu: 'Wiener Stadthalle',
    grand: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/32/Stadthalle_BA-TennisTrophy.JPG/1920px-Stadthalle_BA-TennisTrophy.JPG',
    petit: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/32/Stadthalle_BA-TennisTrophy.JPG/500px-Stadthalle_BA-TennisTrophy.JPG',
    auteur: 'Piedro',
    licence: 'CC BY-SA 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Stadthalle_BA-TennisTrophy.JPG',
  },
  {
    cle: 'monte carlo',
    lieu: 'Monte-Carlo Country Club',
    grand: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1c/Monte-Carlo_Masters_%28cropped%29.jpg/1920px-Monte-Carlo_Masters_%28cropped%29.jpg',
    petit: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1c/Monte-Carlo_Masters_%28cropped%29.jpg/500px-Monte-Carlo_Masters_%28cropped%29.jpg',
    auteur: 'Nikeush',
    licence: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Monte-Carlo_Masters_(cropped).jpg',
  },
  {
    cle: 'rome',
    lieu: 'Campo Centrale, Foro Italico',
    grand: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/76/Il_Centrale_%28108607831%29.jpeg/1920px-Il_Centrale_%28108607831%29.jpeg',
    petit: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/76/Il_Centrale_%28108607831%29.jpeg/500px-Il_Centrale_%28108607831%29.jpeg',
    auteur: 'Stefano Cappa',
    licence: 'CC BY 3.0',
    page: 'https://commons.wikimedia.org/wiki/File:Il_Centrale_(108607831).jpeg',
  },
  {
    cle: 'shanghai',
    lieu: 'Qizhong Forest Sports City Arena',
    grand: 'https://upload.wikimedia.org/wikipedia/commons/5/5c/Qizhong_Stadium.jpg',
    petit: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5c/Qizhong_Stadium.jpg/500px-Qizhong_Stadium.jpg',
    auteur: 'Curt Smith from Bellevue, WA, USA',
    licence: 'CC BY 2.0',
    page: 'https://commons.wikimedia.org/wiki/File:Qizhong_Stadium.jpg',
  },
  {
    cle: 'cincinnati',
    lieu: 'Lindner Family Tennis Center',
    grand: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/54/Center_Court_%28Lindner_Family_Tennis_Center%29_%28cropped%29.jpg/1920px-Center_Court_%28Lindner_Family_Tennis_Center%29_%28cropped%29.jpg',
    petit: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/54/Center_Court_%28Lindner_Family_Tennis_Center%29_%28cropped%29.jpg/500px-Center_Court_%28Lindner_Family_Tennis_Center%29_%28cropped%29.jpg',
    auteur: 'Andrewc013',
    licence: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Center_Court_(Lindner_Family_Tennis_Center)_(cropped).jpg',
  },
  {
    cle: 'montreal',
    lieu: 'Stade IGA, Montréal',
    grand: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/51/Uniprix_Stadium%2C_Montreal%2C_Canada_%28Unsplash_59RO7TskIOk%29.jpg/1920px-Uniprix_Stadium%2C_Montreal%2C_Canada_%28Unsplash_59RO7TskIOk%29.jpg',
    petit: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/51/Uniprix_Stadium%2C_Montreal%2C_Canada_%28Unsplash_59RO7TskIOk%29.jpg/500px-Uniprix_Stadium%2C_Montreal%2C_Canada_%28Unsplash_59RO7TskIOk%29.jpg',
    auteur: 'Jp Valery jpvalery',
    licence: 'CC0',
    page: 'https://commons.wikimedia.org/wiki/File:Uniprix_Stadium,_Montreal,_Canada_(Unsplash_59RO7TskIOk).jpg',
  },
  {
    cle: 'beijing',
    lieu: 'Diamond Court, Pékin',
    grand: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8b/Diamond_Court%2C_National_Tennis_Center_%2820240821134822%29.jpg/1920px-Diamond_Court%2C_National_Tennis_Center_%2820240821134822%29.jpg',
    petit: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8b/Diamond_Court%2C_National_Tennis_Center_%2820240821134822%29.jpg/500px-Diamond_Court%2C_National_Tennis_Center_%2820240821134822%29.jpg',
    auteur: 'N509FZ',
    licence: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Diamond_Court,_National_Tennis_Center_(20240821134822).jpg',
  },
];

/** Autres noms d'un même tournoi (minuscules, sans accents). */
const ALIAS: Record<string, string> = {
  vienne: 'vienna',
  pekin: 'beijing',
  'monte-carlo': 'monte carlo',
  'roland-garros': 'roland garros',
  "internazionali bnl d'italia": 'rome',
  'italian open': 'rome',
  'open d\'australie': 'australian open',
};

/**
 * Photos valables seulement certaines années (le tournoi a changé de lieu) :
 * Paris quitte Bercy pour la Plenitude Arena en 2025 ; les WTA Finals 2026
 * se jouent à Indian Wells (Riyad avant, Charlotte ensuite).
 */
const ANNEES: Record<string, (annee: number) => boolean> = {
  paris: (a) => a >= 2025,
  'atp finals': (a) => a >= 2021 && a <= 2027,
};

/** Cas particuliers : un tournoi qui emprunte la photo d'un autre lieu, une année donnée. */
const EMPRUNTS: Record<string, (annee: number) => string | null> = {
  'wta finals': (a) => (a === 2026 ? 'indian wells' : null),
};

/** « Roland Garros 2026 » → « roland garros ». */
export function cleTournoi(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+\d{4}$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function photoDuTournoi(nom: string, annee: number | null | undefined): PhotoTournoi | null {
  let cle = cleTournoi(nom);
  cle = ALIAS[cle] ?? cle;
  const a = annee ?? new Date().getFullYear();
  if (EMPRUNTS[cle]) {
    const autre = EMPRUNTS[cle](a);
    if (!autre) return null;
    cle = autre;
  } else if (ANNEES[cle] && !ANNEES[cle](a)) {
    return null;
  }
  return PHOTOS.find((p) => p.cle === cle) ?? null;
}
