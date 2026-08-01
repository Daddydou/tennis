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
 * L'équipe se compose d'un joueur par palier de classement. Comme les derniers
 * paliers se recoupent (« 61 et au-delà » ⊂ « 41 et au-delà »), prendre le
 * meilleur de chaque palier indépendamment produirait un doublon. On résout
 * donc l'affectation palier → joueur globalement, en réutilisant l'algorithme
 * hongrois déjà écrit pour les picks (lib/optimizer.ts).
 *
 * Module PUR : aucune I/O, aucune dépendance à Supabase. Les espérances par
 * tour lui sont fournies (elles viennent de la simulation Monte Carlo, cf.
 * supabase/fantasy.ts).
 */

import { affectationHongroise } from './optimizer';

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
 * Composition de l'équipe par famille de tournoi. Les paliers de fin se
 * recoupent volontairement (« 61 et + » est inclus dans « 41 et + ») : c'est
 * ce recoupement qui interdit un simple maximum palier par palier.
 *
 * Le circuit féminin suit exactement les mêmes paliers que le masculin.
 *
 * `AUTRE` (ATP/WTA 500, 250, Finals) reprend la composition des Masters 1000 :
 * le jeu ne définit pas de barème propre à ces catégories, et 4 joueurs sur un
 * tableau de 32 ou 48 reste jouable. Seuls les multiplicateurs s'y adaptent,
 * via le nombre de tours.
 */
export const COMPOSITIONS: Record<FamilleFantasy, Palier[]> = {
  GC: [
    palier(1, 1, 10),
    palier(2, 11, 30),
    palier(3, 31, 60),
    palier(4, 61, null),
    palier(5, 41, null),
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
 */
export function detaillerJoueur(
  rounds: string[],
  bareme: number[],
  parTour: (round: string, index: number) => { pReach: number; points: number },
): { lignes: LigneTour[]; eTotal: number } {
  const lignes: LigneTour[] = [];
  let eTotal = 0;

  rounds.forEach((round, i) => {
    // Barème plus court que la liste des tours (barème explicite mal
    // dimensionné écarté en amont, mais on ne présume rien ici) : le
    // multiplicateur neutre laisse les points bruts intacts.
    const multiplicateur = bareme[i] ?? 1;
    const { pReach, points } = parTour(round, i);
    const pondere = points * multiplicateur;
    eTotal += pondere;
    lignes.push({ round, multiplicateur, pReach, points, pondere });
  });

  return { lignes, eTotal };
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
 * non palier par palier : avec des paliers qui se recoupent, le meilleur
 * joueur du palier « 41 et + » est souvent aussi le meilleur du palier
 * « 61 et + », et un choix glouton laisserait l'un des deux vide.
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
