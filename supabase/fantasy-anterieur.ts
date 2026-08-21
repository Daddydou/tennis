import 'server-only';
import { contexteFantasy } from './fantasy';
import { eloAnterieur, type LecteurEloAnterieur } from './elo-historique';
import { ELO_DEFAUT_RESOLU, POIDS_SURFACE, type ElosResolus } from './elo';
import { rowsToPlayers, surfacePourElo, type loadEngineData } from './queries';
import { simulerTournoi } from '@/lib/montecarlo';
import {
  COMPOSITIONS,
  composerEquipe,
  detailReelJoueur,
  detaillerJoueur,
  toursAvecBye,
  type CandidatFantasy,
} from '@/lib/fantasy';

/**
 * FANTASY SANS LOOK-AHEAD — L'ÉQUIPE QU'ON POUVAIT COMPOSER AU TIRAGE
 *
 * L'historique prédit/réalisé (`supabase/fantasy.ts`) rejoue l'équipe optimale
 * avec les Elo COURANTS. Sur un tournoi déjà joué, ces Elo ont intégré ses
 * résultats : les joueurs qui sont allés loin en sont ressortis relevés, donc
 * l'équipe « optimale » qu'on reconstitue est en partie choisie POUR avoir
 * bien fini. L'écart prédit/réalisé s'en trouve flatté, et dans un sens qu'on
 * ne peut pas quantifier après coup.
 *
 * Ce module refait le calcul sur l'Elo du dernier relevé Tennis Abstract
 * ANTÉRIEUR au tirage : l'information dont on disposait vraiment le jour où
 * l'équipe se composait. Deux mesures cohabitent alors dans
 * `tn_fantasy_historique` — la courante et la propre — et se lisent côte à
 * côte, jamais l'une à la place de l'autre.
 *
 * ⚠ RIEN N'EST BRANCHÉ SUR LA PRODUCTION. Ni le cache `tn_fantasy`, ni
 * `tn_projections` ne sont lus ni écrits ici : ils portent le calcul courant,
 * qui a raison d'utiliser l'Elo du jour pour un tournoi à venir. La simulation
 * ci-dessous vit en mémoire, le temps de produire son couple, et disparaît.
 *
 * ⚠ PAS D'ELO ANTÉRIEUR, PAS D'ÉVALUATION. Un joueur absent du relevé retombe
 * sur l'Elo par défaut, JAMAIS sur l'Elo maison : celui-ci est recalculé sur
 * les matchs importés, il contient donc précisément le résultat qu'on cherche
 * à ne pas connaître. Le nombre de joueurs concernés est remonté et stocké :
 * une évaluation où la moitié du tableau est par défaut ne vaut rien, et ça
 * doit se voir.
 */

/**
 * Simulations par tournoi. Loin des 20 000 des projections de production, et
 * c'est assumé : ce chiffre-ci n'alimente aucun pick, il ne sert qu'à un total
 * d'équipe agrégé sur des dizaines de tournois, où le bruit d'échantillonnage
 * se compense. Même raisonnement que le comparatif d'échelles — couvrir tous
 * les tournois compte plus que raffiner chacun, d'autant que le backfill est
 * borné par le temps d'exécution d'une fonction.
 */
const N_SIMULATIONS = 5000;

/** Même graine que les projections de production : résultats reproductibles. */
const SEED = 42;

/**
 * Part du tableau tolérée en Elo par défaut.
 *
 * Un relevé ne couvre jamais tout un tableau — qualifiés et invités passent
 * sous le seuil de publication de Tennis Abstract, et quelques joueurs par
 * tournoi retombent sur le défaut sans que ça prête à conséquence. Mais un
 * relevé partiel (rapport tronqué, archive à peine commencée) donnerait un
 * tableau où presque tout le monde vaut la même chose : la simulation
 * mesurerait alors le remplissage, pas le modèle. Au-delà de cette part, on
 * préfère dire qu'il n'y a PAS d'évaluation propre plutôt que d'en produire
 * une qui ne veut rien dire et qui polluerait la synthèse.
 */
const PART_MAX_SANS_ELO = 0.5;

type Moteur = NonNullable<Awaited<ReturnType<typeof loadEngineData>>>;

/** Composition retenue, au même format que la colonne `equipe`. */
export interface MembreAnterieur {
  palier: number;
  playerId: string | null;
  nom: string | null;
  rang: number | null;
  ePoints: number;
  reel: number;
}

export interface EvaluationAnterieure {
  /** Relevé le plus récent utilisé — l'âge des Elo qui ont servi. */
  releveLe: string;
  /** Espérance a priori de l'équipe composée sur ces Elo. */
  ePredit: number;
  /** Ce que CETTE équipe a réellement marqué. */
  reel: number;
  /** Joueurs du tableau absents du relevé, donc en Elo par défaut. */
  joueursSansElo: number;
  equipe: MembreAnterieur[];
}

/**
 * Elo de dernier recours, sans le moindre repli maison.
 *
 * `resoudreElos` remplirait sinon avec les colonnes `elo_*` de `tn_players`,
 * qui sont recalculées à chaque import de résultats : ce serait réintroduire
 * le look-ahead par la porte de derrière.
 */
const SANS_ELO: ElosResolus = {
  eloOverall: ELO_DEFAUT_RESOLU,
  eloHard: ELO_DEFAUT_RESOLU,
  eloClay: ELO_DEFAUT_RESOLU,
  eloGrass: ELO_DEFAUT_RESOLU,
  source: 'defaut',
  taName: null,
  taSlug: null,
  via: null,
  rangTa: null,
  candidats: [],
  repli: 'defaut',
};

/**
 * Rejoue l'équipe optimale d'un tournoi sur l'Elo qui précédait son tirage.
 *
 * Renvoie `null` — et c'est un résultat, pas un échec — quand l'évaluation
 * propre est impossible : tournoi sans tours connus, sans date de début, ou
 * antérieur à toute l'archive. Ce dernier cas est celui de TOUS les tournois
 * déjà en base : l'archive ne remonte pas le temps (cf. migration 0010).
 */
export async function evaluerFantasyAnterieur(
  engine: Moteur,
  lecteur: LecteurEloAnterieur,
): Promise<EvaluationAnterieure | null> {
  const { tournament, matchRows, playerRows, matches } = engine;
  const rounds = tournament.rounds ?? [];
  if (rounds.length === 0) return null;

  // La date de référence est le DÉBUT DU TOURNOI, pas celle de chaque match :
  // le jeu Fantasy fige son équipe avant le coup d'envoi, et c'est l'Elo de ce
  // moment-là qui était disponible pour la composer.
  const etat = await lecteur.avant(tournament.tour, tournament.start_date);
  if (!etat?.releveLePlusRecent) return null;

  const elos: Record<string, ElosResolus> = {};
  let joueursSansElo = 0;
  for (const p of playerRows) {
    const e = eloAnterieur(p, etat);
    if (e) {
      elos[p.id] = e;
    } else {
      elos[p.id] = SANS_ELO;
      joueursSansElo++;
    }
  }

  // Contrôle avant la simulation : inutile de payer 5 000 tirages pour un
  // tableau dont l'Elo n'est qu'un remplissage.
  if (
    playerRows.length === 0 ||
    joueursSansElo / playerRows.length > PART_MAX_SANS_ELO
  ) {
    return null;
  }

  const players = rowsToPlayers(tournament, matchRows, playerRows, elos);
  const bestOf = (tournament.best_of ?? 3) as 3 | 5;
  const { famille, bareme } = contexteFantasy(tournament);

  // Simulation en mémoire, jamais mise en cache : `tn_projections` porte le
  // calcul courant, celui de la production.
  const mc = simulerTournoi(
    matches,
    players,
    rounds,
    N_SIMULATIONS,
    bestOf,
    surfacePourElo(tournament.surface),
    POIDS_SURFACE,
    SEED,
  );

  const candidats: CandidatFantasy[] = Object.keys(players).map((playerId) => {
    // Même règle du bye que l'écran Fantasy : l'évaluation doit rejouer le jeu
    // tel qu'il est, pas une variante.
    const { eTotal } = detaillerJoueur(
      rounds,
      bareme,
      (round) => ({
        pReach: mc.presence[playerId]?.[round] ?? 0,
        points: mc.esperances[playerId]?.[round] ?? 0,
      }),
      toursAvecBye(matches, playerId),
    );
    return { playerId, rang: players[playerId]?.rank ?? null, eTotal };
  });

  const equipe: MembreAnterieur[] = composerEquipe(
    COMPOSITIONS[famille],
    candidats,
  ).map((m) => ({
    palier: m.palier.numero,
    playerId: m.playerId,
    nom: m.playerId ? (players[m.playerId]?.name ?? m.playerId) : null,
    rang: m.playerId ? (players[m.playerId]?.rank ?? null) : null,
    ePoints: m.playerId ? m.eTotal : 0,
    reel: m.playerId
      ? detailReelJoueur(matches, m.playerId, rounds, bareme, bestOf).total
      : 0,
  }));

  const ePredit = equipe.reduce((s, m) => s + m.ePoints, 0);

  // Une équipe dont aucun palier n'est pourvu n'apprend rien : autant dire
  // qu'il n'y a pas d'évaluation propre.
  if (ePredit <= 0) return null;

  return {
    releveLe: etat.releveLePlusRecent,
    ePredit,
    reel: equipe.reduce((s, m) => s + m.reel, 0),
    joueursSansElo,
    equipe,
  };
}
