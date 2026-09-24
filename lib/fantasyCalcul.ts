/**
 * FANTASY — CALCULS : espérance d'un joueur sur tout le tournoi, score
 * réellement marqué et composition optimale de l'équipe. Module PUR — cf.
 * l'en-tête de lib/fantasy.ts, point d'entrée qui réexporte ce fichier.
 */

import { affectationHongroise } from './optimizer';
import { pointsAtRound } from './scoring';
import { STATUTS_DECIDES } from './types';
import type { Match } from './types';
import { POINTS_BYE, estByeAcquis, type Palier } from './fantasyRegles';

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
 * n'entre dans ce calcul (cf. db/fantasy.ts).
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
