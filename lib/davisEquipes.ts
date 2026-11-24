/**
 * ÉQUIPES DE LA COUPE DAVIS (phase finale de Bologne, 24-29 novembre 2026) — données PURES.
 *
 * Sélections officielles annoncées le 26/10/2026 (sources : daviscup.com, tennisuptodate.com,
 * tennistourtalk.com). Classements ATP de l'annonce (simple, ou double pour les spécialistes).
 * `nomElo` = nom exact dans tn_elo_maison (Elo maison, surface dur) ; un spécialiste du double peut ne
 * pas y être : il ne sert qu'à la note de double.
 *
 * NOTE DE DOUBLE : pas d'Elo de double dans l'app. Chaque équipe reçoit une note sur l'échelle Elo,
 * fixée à la main d'après le classement de double de sa paire (ATP double de novembre 2026) : 2000 pour
 * une paire du top 3, ~1950 pour une paire du top 10, ~1900 pour le top 15, ~1850 pour une paire
 * habituée sans grand titre, ~1800 pour une paire de circonstance, 1600 pour la Corée. À corriger ici si
 * la composition du double change.
 *
 * Mettre à jour ce fichier si une sélection change (remplacement possible jusqu'à la veille du quart).
 */

export type CodeNation = 'ITA' | 'KOR' | 'CZE' | 'CAN' | 'GBR' | 'GER' | 'AUT' | 'ESP';

export interface JoueurDavis {
  nom: string;
  /** Nom dans tn_elo_maison (null : absent de l'Elo maison, sans incidence pour un pur joueur de double). */
  nomElo: string | null;
  /** Classement ATP au moment de la sélection (simple pour un joueur de simple, double sinon). */
  classement: number | null;
  role: 'simple' | 'double';
}

export interface EquipeDavis {
  code: CodeNation;
  /** Nom de la nation tel qu'il est dans tn_players (« joueur » du tournoi). */
  nom: string;
  capitaine: string;
  joueurs: JoueurDavis[];
  /** Note de la paire de double, échelle Elo (voir l'en-tête). */
  noteDouble: number;
  pairePressentie: string;
  /** Joue à domicile (bonus d'Elo, voir AVANTAGE_DOMICILE dans lib/davisConseils.ts). */
  domicile: boolean;
}

const s = (nom: string, nomElo: string | null, classement: number | null): JoueurDavis => ({ nom, nomElo, classement, role: 'simple' });
const d = (nom: string, nomElo: string | null, classement: number | null): JoueurDavis => ({ nom, nomElo, classement, role: 'double' });

export const EQUIPES_DAVIS_2026: EquipeDavis[] = [
  {
    code: 'ITA',
    nom: 'Italie',
    capitaine: 'Filippo Volandri',
    joueurs: [
      s('Flavio Cobolli', 'Flavio Cobolli', 6),
      s('Luciano Darderi', 'Luciano Darderi', 23),
      s('Lorenzo Musetti', 'Lorenzo Musetti', 26),
      d('Andrea Vavassori', 'Andrea Vavassori', 7),
      d('Simone Bolelli', null, 10),
    ],
    noteDouble: 1950,
    pairePressentie: 'Bolelli / Vavassori',
    domicile: true,
  },
  {
    code: 'KOR',
    nom: 'Corée du Sud',
    capitaine: 'Chung Jong-sam',
    joueurs: [
      s('Kwon Soon-woo', 'Soon Woo Kwon', 160),
      s('Chung Hyeon', 'Hyeon Chung', 578),
      s('Park Ui-sung', 'Uisung Park', 757),
      s('Hong Seong-chan', 'Seong Chan Hong', 1079),
      d('Nam Ji-sung', 'Ji Sung Nam', 123),
    ],
    noteDouble: 1600,
    pairePressentie: 'Nam / un joueur de simple',
    domicile: false,
  },
  {
    code: 'CZE',
    nom: 'République Tchèque',
    capitaine: 'Tomas Berdych',
    // Machac ajouté (feuille de match du 24/11) ; classements de la feuille de match.
    joueurs: [
      s('Jiri Lehecka', 'Jiri Lehecka', 14),
      s('Jakub Mensik', 'Jakub Mensik', 16),
      s('Tomas Machac', 'Tomas Machac', 60),
      d('Patrik Rikl', 'Patrik Rikl', 36),
      d('Adam Pavlasek', null, 41),
    ],
    noteDouble: 1850,
    pairePressentie: 'Pavlasek / Rikl',
    domicile: false,
  },
  {
    code: 'CAN',
    nom: 'Canada',
    capitaine: 'Frank Dancevic',
    // Shapovalov et Diallo forfait : feuille de match du 24/11 (classements de la feuille de match).
    // Double annoncé : Auger-Aliassime / Chan (le n° 1 de simple rejoue en double).
    joueurs: [s('Félix Auger-Aliassime', 'Felix Auger Aliassime', 17), s('Liam Draxl', 'Liam Draxl', 165), d('Duncan Chan', 'Duncan Chan', 232)],
    noteDouble: 1830,
    pairePressentie: 'Auger-Aliassime / Chan',
    domicile: false,
  },
  {
    code: 'GBR',
    nom: 'Royaume-Uni',
    capitaine: 'Leon Smith',
    joueurs: [s('Arthur Fery', 'Arthur Fery', 35), s('Cameron Norrie', 'Cameron Norrie', 41), d('Henry Patten', null, 1), d('Neal Skupski', null, 3)],
    noteDouble: 2000,
    pairePressentie: 'Patten / Skupski',
    domicile: false,
  },
  {
    code: 'GER',
    nom: 'Allemagne',
    capitaine: 'Michael Kohlmann',
    joueurs: [s('Alexander Zverev', 'Alexander Zverev', 2), s('Jan-Lennard Struff', 'Jan Lennard Struff', 47), d('Kevin Krawietz', 'Kevin Krawietz', 11), d('Tim Pütz', null, 12)],
    noteDouble: 1900,
    pairePressentie: 'Krawietz / Pütz',
    domicile: false,
  },
  {
    code: 'AUT',
    nom: 'Autriche',
    capitaine: 'Jürgen Melzer',
    joueurs: [
      s('Jurij Rodionov', 'Jurij Rodionov', 137),
      s('Lukas Neumayer', 'Lukas Neumayer', 138),
      s('Joel Schwärzler', 'Joel Schwaerzler', 172),
      d('Lucas Miedler', 'Lucas Miedler', 19),
      d('Neil Oberleitner', 'Neil Oberleitner', 22),
    ],
    noteDouble: 1880,
    pairePressentie: 'Miedler / Oberleitner',
    domicile: false,
  },
  {
    code: 'ESP',
    nom: 'Espagne',
    capitaine: 'David Ferrer',
    joueurs: [
      s('Carlos Alcaraz', 'Carlos Alcaraz', 3),
      s('Rafael Jódar', 'Rafael Jodar', 11),
      s('Alejandro Davidovich Fokina', 'Alejandro Davidovich Fokina', 15),
      s('Pedro Martínez', 'Pedro Martinez', 126),
      d('Marcel Granollers', null, 6),
    ],
    noteDouble: 1880,
    pairePressentie: 'Granollers / un joueur de simple',
    domicile: false,
  },
];

/** Ordre des matchs annoncé (la veille ou le jour même) : noms de JoueurDavis.nom, dans l'ordre de `nations`. */
export interface OrdreOfficiel {
  simple1: [string, string];
  simple2: [string, string];
  /** Paires annoncées pour le double, dans l'ordre de `nations`. */
  double: [string, string];
}

/**
 * Programme officiel des quarts (heure de Paris), annoncé par l'ITF. Attention : l'ordre des quarts chez
 * Game Tracker (et dans notre tableau) n'est pas l'ordre réel : République Tchèque – Canada ouvre la semaine.
 * `ordre` : feuille de match, à remplir dès qu'elle est publiée (elle remplace la composition par défaut).
 */
export const PROGRAMME_QUARTS_2026: { nations: [CodeNation, CodeNation]; date: string; libelle: string; ordre?: OrdreOfficiel }[] = [
  {
    nations: ['CZE', 'CAN'],
    date: '2026-11-24T16:00:00+01:00',
    libelle: 'mar. 24 nov. à 16 h',
    // Feuille de match officielle du 24/11.
    ordre: {
      simple1: ['Tomas Machac', 'Liam Draxl'],
      simple2: ['Jiri Lehecka', 'Félix Auger-Aliassime'],
      double: ['Pavlasek / Rikl', 'Auger-Aliassime / Chan'],
    },
  },
  { nations: ['ITA', 'KOR'], date: '2026-11-25T16:00:00+01:00', libelle: 'mer. 25 nov. à 16 h' },
  { nations: ['GBR', 'GER'], date: '2026-11-26T10:00:00+01:00', libelle: 'jeu. 26 nov. à 10 h' },
  { nations: ['AUT', 'ESP'], date: '2026-11-26T17:00:00+01:00', libelle: 'jeu. 26 nov., pas avant 17 h' },
];

/** Horaire officiel d'un quart entre ces deux nations (dans un sens ou dans l'autre), s'il est connu. */
export function programmeQuart(a: CodeNation, b: CodeNation): { date: string; libelle: string } | null {
  return PROGRAMME_QUARTS_2026.find((p) => p.nations.includes(a) && p.nations.includes(b)) ?? null;
}

/**
 * Ordre des matchs officiel d'une rencontre, orienté dans le sens demandé (côté `a` d'abord), s'il a été
 * annoncé ; null sinon.
 */
export function ordreOfficiel(a: CodeNation, b: CodeNation): OrdreOfficiel | null {
  const p = PROGRAMME_QUARTS_2026.find((x) => x.nations.includes(a) && x.nations.includes(b));
  if (!p?.ordre) return null;
  if (p.nations[0] === a) return p.ordre;
  const inv = <T,>(t: [T, T]): [T, T] => [t[1], t[0]];
  return { simple1: inv(p.ordre.simple1), simple2: inv(p.ordre.simple2), double: inv(p.ordre.double) };
}

/** Équipe d'une nation d'après son nom dans tn_players (« Italie »...). */
export function equipeDeNation(nom: string | null | undefined): EquipeDavis | null {
  if (!nom) return null;
  const n = nom.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  return EQUIPES_DAVIS_2026.find((e) => e.nom.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase() === n) ?? null;
}

/** Joueurs de simple d'une équipe, du mieux classé au moins bien classé. */
export function joueursDeSimple(e: EquipeDavis): JoueurDavis[] {
  return e.joueurs.filter((j) => j.role === 'simple').sort((a, b) => (a.classement ?? 9999) - (b.classement ?? 9999));
}
