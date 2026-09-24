/* -------------------------------------------------------------------------- */
/*  SIMULATEUR DE BRACKET — probabilités de victoire du jeu de pronostics     */
/*                                                                            */
/*  Rien à voir avec les points des picks ci-dessus : ici, un tirage ne       */
/*  produit qu'un VAINQUEUR par match (lib/bracketSim.ts ne note jamais le    */
/*  score). Même modèle probabiliste que le reste du fichier (Elo effectif    */
/*  pondéré surface, pVictoire) — on ne réécrit pas de nouveau moteur, on     */
/*  réutilise celui-ci pour tirer un vainqueur au lieu d'un score de match.   */
/* -------------------------------------------------------------------------- */

import { ECHELLE_ELO, pVictoire } from './elo';
import {
  augmenterAvecVictoires,
  cleDuel,
  resoudreArbre,
  scoreDuStock,
  type MatchReel,
} from './bracketSim';
import { creerRandom } from './montecarloTournoi';
import type { Player } from './types';

/** Elo effectif (mélange surface/général) d'un joueur, 1500 par défaut si inconnu. */
function eloEffectifDe(
  players: Record<string, Player>,
  surface: 'hard' | 'clay' | 'grass',
  poidsSurface: number,
): (id: string) => number {
  return (id: string) => {
    const p = players[id];
    if (!p) return 1500;
    const s = surface === 'clay' ? p.eloClay : surface === 'grass' ? p.eloGrass : p.eloHard;
    return poidsSurface * s + (1 - poidsSurface) * p.eloOverall;
  };
}

/**
 * Tire UNE fin de tournoi possible, à partir d'un état déjà partiellement
 * résolu (réel + scénario cliqué, cf. lib/bracketSim.ts `resoudreArbre`) :
 * les emplacements déjà tranchés — verrouillés (résultat réel) ou fixés par
 * `dejaTranche` (clics du scénario en cours) — sont conservés tels quels ;
 * seuls ceux encore ouverts sont résolus au hasard selon l'Elo effectif.
 *
 * Repasse entièrement par `resoudreArbre` : la structure de l'arbre (byes,
 * cascade des tours) reste ainsi identique à celle du reste du simulateur,
 * sans la moindre duplication de cette logique ici.
 */
export function tirerFinDeTournoi(
  matches: MatchReel[],
  dejaTranche: ReadonlyMap<string, string>,
  players: Record<string, Player>,
  rounds: string[],
  rnd: () => number,
  surface: 'hard' | 'clay' | 'grass' = 'clay',
  poidsSurface = 0.6,
  echelle: number = ECHELLE_ELO,
) {
  const eloDe = eloEffectifDe(players, surface, poidsSurface);
  return resoudreArbre(matches, rounds, (round, position, a, b) => {
    const fixe = dejaTranche.get(cleDuel(round, position));
    if (fixe) return fixe;
    const pA = pVictoire(eloDe(a), eloDe(b), echelle);
    return rnd() < pA ? a : b;
  });
}

/** Un stock (moi ou un participant) tel que le simulateur de bracket le note. */
export interface StockBracket {
  id: string;
  /** Points déjà gagnés avant le tour de départ — calculés automatiquement en amont (comparaison pronostics/résultats réels), jamais saisis à la main. */
  dejaGagne: number;
  /** Pronostic (déjà filtré depuis le tour de départ), lib/bracketSim.ts `filtrerDepuisTour`. */
  predictions: ReadonlyMap<string, string>;
}

export interface ResultatProbabilites {
  /** Fraction des tirages gagnés par chaque stock (égalités partagées à parts égales). */
  victoires: Record<string, number>;
  simulations: number;
}

/**
 * Tire `n` fins de tournoi possibles depuis l'état courant du bracket réel
 * (réel + scénario cliqué), et pour chacune, calcule le score final de
 * chaque stock (déjà gagné + points sur ce tirage). Le pourcentage de
 * victoire est la fraction des tirages où le stock a le score le plus haut ;
 * une égalité partage la victoire à parts égales entre les stocks à égalité.
 */
export function simulerProbabilitesVictoire(
  matches: MatchReel[],
  dejaTranche: ReadonlyMap<string, string>,
  players: Record<string, Player>,
  rounds: string[],
  stocks: StockBracket[],
  n = 3000,
  surface: 'hard' | 'clay' | 'grass' = 'clay',
  poidsSurface = 0.6,
  seed = 42,
  echelle: number = ECHELLE_ELO,
): ResultatProbabilites {
  const rnd = creerRandom(seed);
  const victoires: Record<string, number> = {};
  for (const s of stocks) victoires[s.id] = 0;
  if (stocks.length === 0) return { victoires, simulations: n };

  for (let i = 0; i < n; i++) {
    const tirage = tirerFinDeTournoi(matches, dejaTranche, players, rounds, rnd, surface, poidsSurface, echelle);
    const scores = stocks.map((s) => ({
      id: s.id,
      total: s.dejaGagne + scoreDuStock(s.predictions, tirage, rounds),
    }));
    const meilleur = Math.max(...scores.map((s) => s.total));
    const gagnants = scores.filter((s) => s.total === meilleur);
    for (const g of gagnants) victoires[g.id] += 1 / gagnants.length;
  }

  // Compte brut -> fraction : c'est le contrat documenté de `victoires`
  // (« fraction des tirages gagnés »), et donc ce que l'écran peut multiplier
  // par 100 directement sans re-diviser par `n` de son côté.
  for (const id of Object.keys(victoires)) victoires[id] /= n;

  return { victoires, simulations: n };
}

/**
 * Un scénario candidat pour un stock : « et si CE joueur remportait le
 * tournoi ? », avec la probabilité de victoire du stock CONDITIONNELLE à
 * cet événement.
 */
export interface ScenarioVictoire {
  playerId: string;
  /** Toujours le dernier tour du tableau (rounds[rounds.length - 1]) — remporter CE tour, c'est remporter le tournoi. */
  round: string;
  /** P(le stock termine premier | ce joueur remporte le tournoi) — PAS la probabilité que le joueur gagne lui-même. */
  probabilite: number;
}

/**
 * Classe, pour UN stock, les joueurs candidats par probabilité DÉCROISSANTE
 * de faire gagner ce stock s'ils remportent le tournoi — « les scénarios qui
 * maximisent sa probabilité de victoire », sans rechercher de garantie
 * absolue (cf. `chercherScenariosGagnants` pour ça).
 *
 * Un candidat déjà éliminé réellement (`augmenterAvecVictoires` renvoie
 * `null`) est simplement omis — pas un scénario à 0 %, un scénario
 * IMPOSSIBLE, ce qui n'est pas la même chose.
 *
 * Réutilise `simulerProbabilitesVictoire` telle quelle, une fois par
 * candidat, sur un tableau `matches` où ce candidat est acquis vainqueur de
 * tous ses matchs jusqu'à la finale (`augmenterAvecVictoires`) : le reste du
 * tableau (les autres stocks, les tours non liés à ce chemin) continue
 * d'être tiré au hasard normalement, `dejaTranche` (résultats réels + clics
 * du bracket réel) restant respecté partout où il s'applique.
 */
export function classerScenariosVictoire(
  matches: MatchReel[],
  dejaTranche: ReadonlyMap<string, string>,
  players: Record<string, Player>,
  rounds: string[],
  stocks: StockBracket[],
  idCible: string,
  candidats: readonly string[],
  n = 1000,
  surface: 'hard' | 'clay' | 'grass' = 'clay',
  poidsSurface = 0.6,
  seed = 42,
  echelle: number = ECHELLE_ELO,
): ScenarioVictoire[] {
  const dernierRound = rounds[rounds.length - 1];
  if (!dernierRound) return [];

  const scenarios: ScenarioVictoire[] = [];
  for (const playerId of candidats) {
    const augmente = augmenterAvecVictoires(matches, rounds, playerId, dernierRound);
    if (!augmente) continue; // déjà éliminé réellement : pas un scénario à 0 %, impossible.
    const resultat = simulerProbabilitesVictoire(
      augmente,
      dejaTranche,
      players,
      rounds,
      stocks,
      n,
      surface,
      poidsSurface,
      seed,
      echelle,
    );
    scenarios.push({ playerId, round: dernierRound, probabilite: resultat.victoires[idCible] ?? 0 });
  }

  return scenarios.sort((a, b) => b.probabilite - a.probabilite);
}
