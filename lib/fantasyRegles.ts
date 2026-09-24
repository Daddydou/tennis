/**
 * FANTASY — RÈGLES DU JEU : le bye, les multiplicateurs par tour et les
 * paliers de classement. Module PUR — cf. l'en-tête de lib/fantasy.ts, point
 * d'entrée qui réexporte ce fichier.
 */

import { scoreMatch, type SetPair } from './scoring';
import type { Match } from './types';

/* -------------------------------------------------------------------------- */
/*  0. LE BYE, RÈGLE PROPRE AU FANTASY                                         */
/* -------------------------------------------------------------------------- */

/**
 * Un bye vaut une victoire 6/4 6/4 — AU FANTASY SEULEMENT.
 *
 * Le moteur de scoring, lui, ne bouge pas : `scoreMatch` continue de rendre 0
 * sur un statut `bye` (cf. STATUTS_SANS_POINTS), et le jeu des picks reste
 * inchangé — un joueur pické au tour de son bye n'y marque toujours rien.
 * La règle est ici, dans le module du second jeu, et nulle part ailleurs.
 *
 * Les points ne sont pas écrits en dur : on fait passer un score fictif dans
 * le barème commun (lib/scoring.ts). Une correction du barème — 5 points la
 * victoire, 3 le net set — se répercute donc d'elle-même sur le bye.
 *
 *   victoire ................ 5
 *   net sets (2 − 0) × 3 .... 6
 *   net games (6−4)+(6−4) ... 4
 *   total ................... 15
 */
const SCORE_FICTIF_BYE: SetPair[] = [
  { for: 6, against: 4 },
  { for: 6, against: 4 },
];

/** Points de base d'un bye au fantasy, avant multiplicateur de tour. */
export const POINTS_BYE = scoreMatch(SCORE_FICTIF_BYE, true, 'completed', 3).total;

/**
 * Ce match est-il un bye ACQUIS par ce joueur ?
 *
 * Deux conditions, et la seconde n'est pas une précaution de style : un
 * tableau importé en cours de route porte des lignes `bye` qui n'en sont pas.
 * Sur le tableau féminin de Montréal 2026, les 32 lignes du R64 sont au statut
 * `bye` avec une seule joueuse — non parce qu'elle est exemptée, mais parce
 * que son adversaire n'est pas encore connue. Ces lignes-là n'ont PAS de
 * vainqueur désigné, là où les 32 vraies exemptions du R128 en ont un
 * (idem à Madrid, 32/32, et à Delray Beach, 4/4).
 *
 * Le vainqueur désigné est donc le seul signal fiable, et il est disponible
 * dès le tirage : un bye est gagné par construction, le bookmarklet le note
 * comme tel avant même que le tournoi commence. Un tableau qui l'omettrait
 * ferait retomber le bye à 0 point — l'ancien comportement, jamais un gain
 * accordé à tort.
 */
export function estByeAcquis(match: Match, playerId: string): boolean {
  if (match.status !== 'bye') return false;
  return match.players.some((p) => p.id === playerId && p.winner);
}

/**
 * Tours où ce joueur est exempté. Vide dans l'immense majorité des cas — un
 * joueur n'a qu'un bye, et seulement dans un tableau qui en comporte.
 */
export function toursAvecBye(matches: Match[], playerId: string): Set<string> {
  const out = new Set<string>();
  for (const m of matches) if (estByeAcquis(m, playerId)) out.add(m.round);
  return out;
}

/* -------------------------------------------------------------------------- */
/*  1. MULTIPLICATEURS PAR TOUR                                                */
/* -------------------------------------------------------------------------- */

/**
 * Barème de référence, Grand Chelem à 7 tours. Ce sont les valeurs officielles
 * du jeu : premier tour à 1, finale à 2.
 */
export const BAREME_GRAND_CHELEM: readonly number[] = [
  1, 1.1, 1.2, 1.4, 1.6, 1.8, 2,
];

/** Famille de composition d'un tournoi (5 joueurs en GC, 4 ailleurs). */
export type FamilleFantasy = 'GC' | 'M1000' | 'AUTRE';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BARÈMES EXPLICITES — LE SEUL ENDROIT À MODIFIER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Clé : `${famille}:${nombre de tours du tournoi}`. Valeur : le multiplicateur
 * de chaque tour, du premier à la finale (la longueur doit égaler le nombre de
 * tours).
 *
 * Tout ce qui ne figure PAS ici est dérivé du barème Grand Chelem, ramené au
 * nombre de tours du tournoi (cf. `deriverBareme`) : premier tour à 1, finale
 * à 2, progression régulière. C'est le cas aujourd'hui des Masters 1000, dont
 * les valeurs officielles ne sont pas connues.
 *
 * Pour corriger un barème, il suffit d'ajouter UNE ligne ici — par exemple :
 *
 *     'M1000:7': [1, 1.15, 1.3, 1.5, 1.7, 1.85, 2],
 *
 * Un Masters 1000 à tableau de 96 compte 7 tours (le premier n'oppose que les
 * non-têtes de série, les autres sont exemptés) ; à tableau de 56 ou 64, 6.
 */
export const BAREMES_EXPLICITES: Record<string, readonly number[]> = {
  'GC:7': BAREME_GRAND_CHELEM,
};

/**
 * Barème dérivé du Grand Chelem pour un tournoi de `nbTours` tours.
 *
 * On rééchantillonne la courbe du Grand Chelem par interpolation linéaire :
 * le premier tour vaut toujours 1, la finale toujours 2, et les tours
 * intermédiaires suivent la même accélération (progression lente au début,
 * plus marquée à partir des huitièmes). Pour 7 tours, on retrouve exactement
 * le barème Grand Chelem.
 */
export function deriverBareme(nbTours: number): number[] {
  if (nbTours <= 0) return [];
  // Un tournoi à un seul tour se réduit à sa finale : aucune progression à
  // représenter, le multiplicateur neutre est le bon.
  if (nbTours === 1) return [1];

  const ref = BAREME_GRAND_CHELEM;
  const out: number[] = [];
  for (let i = 0; i < nbTours; i++) {
    const t = (i / (nbTours - 1)) * (ref.length - 1);
    const bas = Math.floor(t);
    const haut = Math.min(ref.length - 1, bas + 1);
    const f = t - bas;
    const v = ref[bas] + (ref[haut] - ref[bas]) * f;
    out.push(Math.round(v * 1000) / 1000);
  }
  return out;
}

/**
 * Multiplicateurs d'un tournoi, du premier tour à la finale.
 * Barème explicite s'il en existe un pour ce couple (famille, nombre de
 * tours), sinon dérivé du Grand Chelem.
 */
export function baremeTournoi(
  famille: FamilleFantasy,
  nbTours: number,
): number[] {
  const explicite = BAREMES_EXPLICITES[`${famille}:${nbTours}`];
  // Un barème explicite mal dimensionné est ignoré plutôt qu'appliqué de
  // travers : mieux vaut un barème dérivé cohérent qu'une finale sans
  // multiplicateur.
  if (explicite && explicite.length === nbTours) return [...explicite];
  return deriverBareme(nbTours);
}

/* -------------------------------------------------------------------------- */
/*  2. PALIERS DE CLASSEMENT                                                   */
/* -------------------------------------------------------------------------- */

export interface Palier {
  /** Numéro d'affichage, 1-based. */
  numero: number;
  rangMin: number;
  /** null = pas de borne supérieure. */
  rangMax: number | null;
  libelle: string;
}

function palier(
  numero: number,
  rangMin: number,
  rangMax: number | null,
): Palier {
  return {
    numero,
    rangMin,
    rangMax,
    libelle: rangMax === null ? `${rangMin} et au-delà` : `${rangMin} à ${rangMax}`,
  };
}

/**
 * Composition de l'équipe par famille de tournoi.
 *
 * GRAND CHELEM — cinq paliers CONTIGUS ET DISJOINTS : 1-10, 11-20, 21-40,
 * 41-70, 71 et au-delà. Chaque rang tombe dans exactement un palier, et les
 * bornes se touchent sans se recouvrir — le rang 70 est le dernier du palier 4,
 * le palier 5 commence à 71. C'est un changement de découpage : les anciens
 * paliers de fin se recoupaient (« 61 et + » inclus dans « 41 et + »), si bien
 * qu'un même joueur pouvait être candidat à deux paliers.
 *
 * Le circuit féminin suit exactement les mêmes paliers que le masculin.
 *
 * M1000 / AUTRE — inchangés, et leurs deux derniers paliers restent
 * identiques (« 31 et au-delà » deux fois). C'est ce recoupement-là qui
 * interdit encore un simple maximum palier par palier (cf. `composerEquipe`).
 *
 * `AUTRE` (ATP/WTA 500, 250, Finals) reprend la composition des Masters 1000 :
 * le jeu ne définit pas de barème propre à ces catégories, et 4 joueurs sur un
 * tableau de 32 ou 48 reste jouable. Seuls les multiplicateurs s'y adaptent,
 * via le nombre de tours.
 */
export const COMPOSITIONS: Record<FamilleFantasy, Palier[]> = {
  GC: [
    palier(1, 1, 10),
    palier(2, 11, 20),
    palier(3, 21, 40),
    palier(4, 41, 70),
    palier(5, 71, null),
  ],
  M1000: [
    palier(1, 1, 10),
    palier(2, 11, 30),
    palier(3, 31, null),
    palier(4, 31, null),
  ],
  AUTRE: [
    palier(1, 1, 10),
    palier(2, 11, 30),
    palier(3, 31, null),
    palier(4, 31, null),
  ],
};

export const LIBELLE_FAMILLE: Record<FamilleFantasy, string> = {
  GC: 'Grand Chelem',
  M1000: 'Masters 1000',
  AUTRE: 'Autre catégorie',
};

/**
 * Famille de composition depuis la catégorie stockée en base
 * (`tn_tournaments.category`, alimentée par lib/calendrier.ts).
 *
 * Catégorie absente (ancienne ligne, slug inconnu) : on se rabat sur la taille
 * du tableau — seuls les Grands Chelems tirent 128 joueurs.
 */
export function famillePourCategorie(
  categorie: string | null,
  drawSize: number | null,
): FamilleFantasy {
  if (categorie === 'GS') return 'GC';
  if (categorie === 'M1000' || categorie === 'WTA1000') return 'M1000';
  if (categorie) return 'AUTRE';
  if (drawSize && drawSize >= 128) return 'GC';
  if (drawSize && drawSize >= 96) return 'M1000';
  return 'AUTRE';
}
