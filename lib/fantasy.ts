/**
 * FANTASY — COMPOSITION D'UNE ÉQUIPE SOUS CONTRAINTES DE CLASSEMENT
 *
 * Second jeu, monté sur le même moteur que les picks, sans rien y changer.
 *
 *   Picks   : un joueur par slot (tour × moitié de tableau), chaque joueur ne
 *             servant qu'une fois — c'est une affectation joueur → slot, et
 *             chaque joueur porte une espérance PAR TOUR.
 *   Fantasy : une équipe composée UNE SEULE FOIS avant le coup d'envoi, puis
 *             figée. Chaque joueur retenu marque sur l'ensemble de ses matchs,
 *             selon le même barème (lib/scoring.ts), pondéré par un
 *             multiplicateur croissant selon le tour. Chaque joueur porte donc
 *             UNE espérance globale, celle du tirage — aucun résultat réel n'y
 *             entre jamais (cf. supabase/fantasy.ts).
 *
 * L'équipe se compose d'un joueur par palier de classement. Hors Grand Chelem,
 * les derniers paliers se recoupent (« 31 et au-delà » deux fois) : prendre le
 * meilleur de chaque palier indépendamment produirait un doublon. On résout
 * donc l'affectation palier → joueur globalement, en réutilisant l'algorithme
 * hongrois déjà écrit pour les picks (lib/optimizer.ts). Les paliers du Grand
 * Chelem, eux, sont désormais disjoints — l'affectation globale y rend le même
 * résultat qu'un maximum palier par palier, et reste le chemin unique.
 *
 * Module PUR : aucune I/O, aucune dépendance à Supabase. Les espérances par
 * tour lui sont fournies (elles viennent de la simulation Monte Carlo, cf.
 * supabase/fantasy.ts).
 */

import { affectationHongroise } from './optimizer';
import { pointsAtRound, scoreMatch, type SetPair } from './scoring';
import { STATUTS_DECIDES } from './types';
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

/* -------------------------------------------------------------------------- */
/*  3. ESPÉRANCE D'UN JOUEUR SUR TOUT LE TOURNOI                               */
/* -------------------------------------------------------------------------- */

/** Contribution d'un tour à l'espérance totale d'un joueur. */
export interface LigneTour {
  round: string;
  multiplicateur: number;
  /** P(le joueur dispute ce tour), issue de la simulation. */
  pReach: number;
  /** Espérance de points marqués à ce tour. */
  points: number;
  /** `points` × `multiplicateur` — ce qui alimente le total. */
  pondere: number;
  /**
   * Le joueur est exempté à ce tour. Ce n'est alors pas une espérance mais un
   * acquis : `points` vaut exactement `POINTS_BYE`, sans aléa.
   */
  bye: boolean;
}

/**
 * Ventilation tour par tour de l'espérance d'un joueur, et son total.
 *
 * `parTour` renseigne, pour chaque tour, l'espérance de points et la
 * probabilité de présence. La pondération, elle, ne dépend que du rang du tour
 * dans le tableau.
 *
 * Tout est espérance, du premier tour à la finale : l'équipe Fantasy se
 * compose une fois pour toutes avant le coup d'envoi, aucun résultat réel
 * n'entre dans ce calcul (cf. supabase/fantasy.ts).
 *
 * `byes` — les tours où le joueur est exempté (`toursAvecBye`). Un bye n'est
 * pas un match à simuler : il est acquis au tirage, donc certain. Sa ligne ne
 * passe pas par `parTour` et vaut `POINTS_BYE` avec une présence de 1, dans
 * toutes les simulations. La simulation Monte Carlo, elle, fait avancer
 * l'exempté sans lui compter de points (cf. lib/montecarlo.ts) : la valeur
 * substituée ici ne se superpose donc à rien.
 *
 * Le paramètre a une valeur par défaut pour les appels d'analyse, mais TOUT
 * calcul Fantasy doit le passer, sans quoi deux écrans donneraient deux
 * totaux différents pour la même équipe.
 */
export function detaillerJoueur(
  rounds: string[],
  bareme: number[],
  parTour: (round: string, index: number) => { pReach: number; points: number },
  byes: ReadonlySet<string> = new Set(),
): { lignes: LigneTour[]; eTotal: number } {
  const lignes: LigneTour[] = [];
  let eTotal = 0;

  rounds.forEach((round, i) => {
    // Barème plus court que la liste des tours (barème explicite mal
    // dimensionné écarté en amont, mais on ne présume rien ici) : le
    // multiplicateur neutre laisse les points bruts intacts.
    const multiplicateur = bareme[i] ?? 1;
    const bye = byes.has(round);
    const { pReach, points } = bye
      ? { pReach: 1, points: POINTS_BYE }
      : parTour(round, i);
    const pondere = points * multiplicateur;
    eTotal += pondere;
    lignes.push({ round, multiplicateur, pReach, points, pondere, bye });
  });

  return { lignes, eTotal };
}

/* -------------------------------------------------------------------------- */
/*  3 bis. SCORE RÉELLEMENT MARQUÉ                                             */
/* -------------------------------------------------------------------------- */

/** Ce qu'un joueur a réellement marqué à un tour donné. */
export interface LigneReelle {
  round: string;
  multiplicateur: number;
  /** Points réels au barème du jeu. 0 si le match n'est pas encore joué. */
  points: number;
  /** `points` × `multiplicateur`. */
  pondere: number;
  /**
   * Le match de ce tour a une issue connue.
   *
   * Distingue les deux façons de valoir 0 : « pas encore joué » et « joué mais
   * rien marqué » (une défaite sèche ne rapporte rien). Sans ce drapeau, les
   * deux se confondraient à l'affichage.
   */
  joue: boolean;
  /** Tour passé sur exemption : `points` vaut `POINTS_BYE`, pas 0. */
  bye: boolean;
}

/**
 * Ventilation des points RÉELLEMENT marqués par un joueur sur le tournoi, et
 * leur total, pondérés par le même barème que l'espérance.
 *
 * Ne recompose jamais l'équipe : c'est la performance de l'équipe déjà figée,
 * mesurée sur les résultats importés. Un tour non encore joué vaut 0, si bien
 * que le total croît au fil des imports jusqu'au score final.
 *
 * Un bye réellement obtenu vaut `POINTS_BYE`, comme en espérance : les deux
 * mesures d'une même équipe doivent compter le bye de la même façon, sans quoi
 * l'écart prédit/réalisé de l'historique s'ouvrirait sur une différence de
 * convention et non sur une différence de résultats.
 */
export function detailReelJoueur(
  matches: Match[],
  playerId: string,
  rounds: string[],
  bareme: number[],
  bestOf: 3 | 5 = 3,
): { lignes: LigneReelle[]; total: number } {
  const lignes: LigneReelle[] = [];
  let total = 0;

  rounds.forEach((round, i) => {
    const multiplicateur = bareme[i] ?? 1;
    const match = matches.find(
      (m) => m.round === round && m.players.some((p) => p.id === playerId),
    );
    const bye = match ? estByeAcquis(match, playerId) : false;
    const joue = match ? STATUTS_DECIDES.includes(match.status) : false;
    // `pointsAtRound` rend 0 sur un bye (barème du jeu des picks, inchangé) :
    // la substitution est donc faite ici, dans le seul module du Fantasy.
    const points = bye
      ? POINTS_BYE
      : joue
        ? pointsAtRound(matches, playerId, round, bestOf)
        : 0;
    const pondere = points * multiplicateur;
    total += pondere;
    lignes.push({ round, multiplicateur, points, pondere, joue, bye });
  });

  return { lignes, total };
}

/* -------------------------------------------------------------------------- */
/*  4. COMPOSITION OPTIMALE DE L'ÉQUIPE                                        */
/* -------------------------------------------------------------------------- */

export interface CandidatFantasy {
  playerId: string;
  /** Classement officiel. null = classement inconnu, donc inéligible partout. */
  rang: number | null;
  /** Espérance de points sur tout le tournoi, multiplicateurs compris. */
  eTotal: number;
}

export function estEligible(p: Palier, rang: number | null): boolean {
  if (rang === null) return false;
  if (rang < p.rangMin) return false;
  if (p.rangMax !== null && rang > p.rangMax) return false;
  return true;
}

export interface MembreEquipe {
  palier: Palier;
  /** null : palier non pourvu, faute de joueur éligible disponible. */
  playerId: string | null;
  eTotal: number;
  /** Joueurs du tableau éligibles à ce palier, doublons compris. */
  eligibles: number;
}

/**
 * Équipe optimale : un joueur par palier, sans doublon, maximisant la somme
 * des espérances.
 *
 * Résolu par affectation globale (algorithme hongrois de lib/optimizer.ts) et
 * non palier par palier : hors Grand Chelem, les paliers 3 et 4 sont le même
 * intervalle (« 31 et au-delà »), et un choix glouton donnerait deux fois le
 * même joueur — ou laisserait un palier vide. Sur des paliers disjoints, comme
 * ceux du Grand Chelem, l'affectation rend simplement le meilleur de chaque
 * palier : le chemin de calcul reste unique, sans cas particulier.
 */
export function composerEquipe(
  paliers: Palier[],
  candidats: CandidatFantasy[],
): MembreEquipe[] {
  const eligiblesPar = paliers.map((p) =>
    candidats
      .filter((c) => estEligible(p, c.rang))
      .sort((a, b) => b.eTotal - a.eTotal),
  );

  // Réduction du problème : l'optimum n'a jamais besoin de descendre au-delà
  // des |paliers| meilleurs candidats d'un palier donné. Au pire les
  // |paliers| − 1 autres paliers lui en prennent, il en reste toujours un.
  // On passe ainsi d'une matrice 5 × 128 à 5 × 25 au plus.
  const retenus: string[] = [];
  const vus = new Set<string>();
  for (const liste of eligiblesPar) {
    for (const c of liste.slice(0, paliers.length)) {
      if (vus.has(c.playerId)) continue;
      vus.add(c.playerId);
      retenus.push(c.playerId);
    }
  }

  const infos = new Map(candidats.map((c) => [c.playerId, c]));

  /**
   * Un joueur inéligible reçoit un gain prohibitif, pas un gain nul : la
   * matrice est complétée par des zéros pour être rendue carrée, et un zéro se
   * confondrait avec « aucun joueur affecté ».
   */
  const INELIGIBLE = -1e6;
  /**
   * Un joueur éligible mais d'espérance nulle (blessé, forfait) reste
   * préférable à un palier vide : l'epsilon le fait passer devant le
   * remplissage à zéro.
   */
  const EPS = 1e-9;

  const gains = paliers.map((p) =>
    retenus.map((id) => {
      const c = infos.get(id);
      return estEligible(p, c?.rang ?? null) ? EPS + (c?.eTotal ?? 0) : INELIGIBLE;
    }),
  );

  const affect = affectationHongroise(gains);

  return paliers.map((p, i) => {
    const j = affect[i] ?? -1;
    // Gain négatif : le seul joueur restant était inéligible — l'affectation a
    // dû combler, le palier n'est pas pourvu pour autant.
    const pourvu = j >= 0 && gains[i][j] > 0;
    return {
      palier: p,
      playerId: pourvu ? retenus[j] : null,
      eTotal: pourvu ? (infos.get(retenus[j])?.eTotal ?? 0) : 0,
      eligibles: eligiblesPar[i].length,
    };
  });
}

/** Somme des espérances des joueurs retenus. */
export function totalEquipe(equipe: MembreEquipe[]): number {
  return equipe.reduce((s, m) => s + (m.playerId ? m.eTotal : 0), 0);
}
