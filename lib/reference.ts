/**
 * SCORE DE RÉFÉRENCE — « et si j'avais suivi l'app à la lettre ? »
 *
 * Étalon de comparaison pour l'onglet Résultats : à chaque tour, on prend la
 * (les) recommandation(s) de l'écran Picks — les joueurs d'espérance de points
 * maximale — et on somme ce qu'ils ont RÉELLEMENT marqué.
 *
 * Les règles du jeu s'appliquent telles quelles :
 *   - deux picks par tour (un par moitié) tant que le tableau a deux moitiés,
 *     un seul en demies et en finale — c'est `genererSlots` qui en décide ;
 *   - unicité : un joueur déjà pris à un tour précédent est écarté, on descend
 *     alors d'un cran dans l'ordre des espérances ;
 *   - un tour dont tous les survivants sont déjà utilisés reste vide, comme
 *     dans le jeu réel (slot « sans pick possible »).
 *
 * Les tours sont parcourus DANS L'ORDRE, et les espérances de chaque tour sont
 * celles simulées depuis les survivants réels de ce tour (`simulerDepuis`) :
 * la référence ne sait donc rien de plus que ce que l'app affichait au moment
 * de picker. C'est une mesure en lecture seule — elle ne touche ni aux picks
 * de l'utilisateur ni à son score.
 */

import { genererSlots, recommanderPourTour, type Esperances } from './optimizer';
import { scorePlayerInMatch } from './scoring';
import { STATUTS_DECIDES } from './types';
import type {
  Half,
  Match,
  MatchStatus,
  Player,
  ScoreBreakdown,
  Slot,
} from './types';

/** Un pick de la référence, sur un slot du tournoi. */
export interface PickReference {
  round: string;
  half: Half | null;
  /** null : aucun candidat disponible sur ce slot (unicité, tour non constitué). */
  playerId: string | null;
  playerName: string | null;
  /** Espérance de points au moment du pick, telle que l'écran Picks l'affiche. */
  ePoints: number | null;
  /** Points réellement marqués. null tant que le match n'est pas trouvé. */
  score: ScoreBreakdown | null;
  statut: MatchStatus | null;
}

export interface Reference {
  picks: PickReference[];
  /** Somme des points réels des picks de référence. */
  total: number;
  /** Tours pris en compte. */
  rounds: string[];
}

/**
 * Tours effectivement joués : ceux qui comptent au moins un match à l'issue
 * connue. Les byes ne suffisent pas — un tour où personne n'a encore frappé
 * une balle n'a rien rapporté à personne, ni à l'utilisateur ni à la référence.
 */
export function toursJoues(matches: Match[], rounds: string[]): string[] {
  return rounds.filter((r) =>
    matches.some(
      (m) =>
        m.round === r && m.status !== 'bye' && STATUTS_DECIDES.includes(m.status),
    ),
  );
}

/** Le match d'un joueur à un tour donné, s'il existe. */
function matchDe(
  matches: Match[],
  playerId: string,
  round: string,
): Match | undefined {
  return matches.find(
    (m) => m.round === round && m.players.some((p) => p.id === playerId),
  );
}

/**
 * Construit la suite des picks de référence et leur score réel.
 *
 * @param esperancesParTour  Espérances indexées par tour de départ : pour le
 *   tour R, celles simulées DEPUIS R (cache `tn_projections`, from_round = R).
 *   Seuls les tours présents dans cet objet sont évalués — c'est l'appelant qui
 *   décide lesquels (cf. `toursJoues`).
 */
export function construireReference(
  matches: Match[],
  players: Record<string, Player>,
  rounds: string[],
  esperancesParTour: Record<string, Esperances>,
  bestOf: 3 | 5 = 3,
): Reference {
  const slots = genererSlots(rounds);
  const slotsDe = new Map<string, Slot[]>();
  for (const s of slots) {
    const a = slotsDe.get(s.round) ?? [];
    a.push(s);
    slotsDe.set(s.round, a);
  }

  // Unicité : un joueur pris à un tour ne peut plus l'être ensuite. On parcourt
  // donc les tours dans l'ordre du tournoi, jamais dans celui de l'objet reçu.
  const utilises = new Set<string>();
  const picks: PickReference[] = [];
  const evalues: string[] = [];
  let total = 0;

  for (const round of rounds) {
    const esperances = esperancesParTour[round];
    if (!esperances) continue;
    evalues.push(round);

    for (const slot of slotsDe.get(round) ?? []) {
      // `recommanderPourTour` écarte les joueurs déjà utilisés avant de trier :
      // le premier renvoyé est bien le meilleur candidat encore disponible.
      const [meilleur] = recommanderPourTour(
        esperances,
        players,
        round,
        slot.half,
        utilises,
        1,
      );

      if (!meilleur) {
        picks.push({
          round,
          half: slot.half,
          playerId: null,
          playerName: null,
          ePoints: null,
          score: null,
          statut: null,
        });
        continue;
      }

      utilises.add(meilleur.playerId);

      const m = matchDe(matches, meilleur.playerId, round);
      // scoreMatch rend 0 sur un match indécis (scheduled, live, in_progress) :
      // un tour en cours ne gonfle pas la référence, exactement comme le score
      // réel de l'utilisateur.
      const score = m ? scorePlayerInMatch(m, meilleur.playerId, bestOf) : null;
      total += score?.total ?? 0;

      picks.push({
        round,
        half: slot.half,
        playerId: meilleur.playerId,
        playerName: meilleur.playerName,
        ePoints: meilleur.ePoints,
        score,
        statut: m?.status ?? null,
      });
    }
  }

  return { picks, total, rounds: evalues };
}
