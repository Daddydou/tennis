/**
 * BRACKET PRÉDIT — PARCOURS DÉTERMINISTE DU TABLEAU
 *
 * Remplit l'arbre du tournoi depuis le TIRAGE, en donnant chaque match au plus
 * haut Elo effectif — ou, quand une cote utilisable existe pour ce duel
 * précis, au favori du blend Elo/cotes (cf. `ProbabiliteMatch`, lib/elo.ts).
 * Aucun aléa, aucune simulation : à Elo (et cotes) donnés, le même tableau
 * produit toujours le même champion.
 *
 * Ce que ce module NE regarde PAS, et c'est le point important :
 *   - `winner_id` et les scores — le pronostic ne doit pas se laisser corriger
 *     par ce qui s'est déjà joué. Un tournoi à venir, en cours ou terminé donne
 *     exactement le même arbre, comme l'espérance Fantasy (cf. db/fantasy.ts) ;
 *   - les tours postérieurs au premier — seul `rounds[0]` est lu, le reste est
 *     déduit. Un tableau dont un tour intermédiaire manque en base reste donc
 *     entièrement prédictible.
 *
 * Module PUR : ni I/O, ni Supabase. La conversion Elo -> probabilité
 * (`pVictoire`) et son mélange éventuel aux cotes sont les deux SEULES
 * briques importées, toutes deux pures — les critères de comparaison et la
 * fonction de blend restent fournis par l'appelant (`CritereJoueur`,
 * `ProbabiliteMatch`), ce qui rend le module testable sur un tableau fabriqué
 * à la main.
 */

import { pVictoire, PROBABILITE_ELO_SEULE, type ProbabiliteMatch } from './elo';

export interface CritereJoueur {
  /** Elo effectif sur la surface du tournoi (mélange 60/40, cf. db/elo.ts). */
  elo: number;
  /** Rang officiel, pour départager deux Elo strictement égaux (ou un blend tombé pile à 0,5). */
  rang: number | null;
}

/** Un affrontement de l'arbre prédit. */
export interface DuelBracket {
  round: string;
  /** Rang du duel dans son tour, 0-based, dans l'ordre du tableau. */
  position: number;
  /** `null` : place vide — tableau incomplet, rien à prédire ici. */
  a: string | null;
  b: string | null;
  gagnant: string | null;
  /**
   * Un seul joueur en lice : il avance sans match. C'est le bye du tirage au
   * premier tour, et le prolongement d'une place vide aux tours suivants.
   */
  bye: boolean;
  /**
   * Une cote utilisable (cf. lib/cotes.ts) a influencé le vainqueur prédit de
   * CE duel — traçabilité affichée à l'écran (cf. BadgeCoteDuel). `false` sur
   * un bye, où il n'y a rien à départager.
   */
  coteUtilisee: boolean;
  /** Moitié de tableau, déduite de la position dans le premier tour. */
  moitie: 'top' | 'bottom';
}

export interface Bracket {
  /** Tours effectivement remplis, du premier au dernier. */
  rounds: string[];
  duels: DuelBracket[];
  /** Vainqueur prédit, `null` si le tableau ne se réduit pas à un joueur. */
  champion: string | null;
  /** Les duels du champion, un par tour — son parcours annoncé. */
  parcours: DuelBracket[];
}

/** Ce dont le module a besoin d'un match : jamais le vainqueur, jamais le score. */
export interface MatchTirage {
  round: string;
  position: number;
  players: { id: string | null; isBye: boolean }[];
}

/**
 * Départage deux joueurs.
 *
 * `probabiliteMatch` d'abord (cf. lib/elo.ts) : par défaut Elo seul
 * (`PROBABILITE_ELO_SEULE`), sans aucun changement de comportement par
 * rapport à avant le branchement des cotes ; fourni par l'appelant avec un
 * blend (cf. lib/cotes.ts `creerBlendProduction`), il ne fait pencher CE
 * duel que si une cote utilisable existe précisément pour lui — repli
 * silencieux sur l'Elo seul sinon, à l'intérieur même de la fonction de
 * blend, jamais ici.
 *
 * En cas d'égalité stricte à 0,5 (Elo seuls égaux, ou blend tombé pile
 * dessus) : on prend le mieux classé ; un joueur sans rang passe après un
 * joueur classé. En tout dernier recours, l'identifiant : arbitraire, mais
 * STABLE, pour que deux affichages successifs ne donnent pas deux champions.
 */
export function vainqueurDuel(
  a: string,
  b: string,
  critere: (id: string) => CritereJoueur,
  probabiliteMatch: ProbabiliteMatch = PROBABILITE_ELO_SEULE,
): string {
  const ca = critere(a);
  const cb = critere(b);

  // pVictoire(x, x) === 0.5 exactement : demander le blend sans cote pour ce
  // duel (repli sur pEloSeul) reproduit donc bit à bit l'ancienne comparaison
  // directe des Elo — ce n'est un branchement supplémentaire qu'avec une cote.
  const pEloSeulA = pVictoire(ca.elo, cb.elo);
  const pA = probabiliteMatch(a, b, pEloSeulA);
  if (pA !== 0.5) return pA > 0.5 ? a : b;

  const ra = ca.rang ?? Number.POSITIVE_INFINITY;
  const rb = cb.rang ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra < rb ? a : b;

  return a <= b ? a : b;
}

/**
 * Construit l'arbre prédit.
 *
 * @param matches  Tous les matchs du tableau ; seuls ceux de `rounds[0]` sont lus.
 * @param rounds   Ordre des tours, du plus large à la finale.
 * @param critere  Elo effectif et rang d'un joueur.
 * @param probabiliteMatch  Point de branchement du blend Elo/cotes (cf.
 *                 lib/elo.ts). Omise, c'est `PROBABILITE_ELO_SEULE` — l'Elo
 *                 seul décide, comportement historique inchangé.
 * @param coteDisponiblePour  Une cote utilisable existe-t-elle pour ce duel
 *                 précis (cf. lib/cotes.ts `IndexCotes.probabiliteA`) ? Sert
 *                 UNIQUEMENT à la traçabilité (`DuelBracket.coteUtilisee`) —
 *                 le résultat du duel, lui, ne dépend que de `probabiliteMatch`.
 *                 Omise, aucun duel n'est jamais marqué « cote utilisée ».
 */
export function construireBracket(
  matches: MatchTirage[],
  rounds: string[],
  critere: (id: string) => CritereJoueur,
  probabiliteMatch: ProbabiliteMatch = PROBABILITE_ELO_SEULE,
  coteDisponiblePour: (idA: string, idB: string) => boolean = () => false,
): Bracket {
  const premier = rounds[0];
  if (!premier) return { rounds: [], duels: [], champion: null, parcours: [] };

  // Grille de départ : deux places par match du premier tour, dans l'ordre des
  // positions. Un exempté occupe une place, son adversaire absent laisse un
  // trou — même convention que la simulation Monte Carlo (lib/montecarlo.ts).
  const grille: (string | null)[] = [];
  for (const m of [...matches]
    .filter((m) => m.round === premier)
    .sort((x, y) => x.position - y.position)) {
    const [p1, p2] = m.players;
    grille.push(p1?.isBye || !p1?.id ? null : p1.id);
    grille.push(p2?.isBye || !p2?.id ? null : p2.id);
  }
  if (grille.length === 0) {
    return { rounds: [], duels: [], champion: null, parcours: [] };
  }

  const duels: DuelBracket[] = [];
  const roundsRemplis: string[] = [];
  let actuels = grille;

  for (const round of rounds) {
    if (actuels.length < 2) break;
    roundsRemplis.push(round);

    const suivants: (string | null)[] = [];
    for (let i = 0; i < actuels.length; i += 2) {
      const a = actuels[i] ?? null;
      const b = actuels[i + 1] ?? null;

      // La moitié se lit sur la position dans la grille INITIALE : un duel de
      // la première moitié des places reste dans la moitié haute jusqu'à la
      // finale, où les deux moitiés se rejoignent.
      const position = i / 2;
      const moitie: 'top' | 'bottom' =
        position < actuels.length / 4 ? 'top' : 'bottom';

      let gagnant: string | null;
      let bye: boolean;
      let coteUtilisee = false;
      if (a && b) {
        gagnant = vainqueurDuel(a, b, critere, probabiliteMatch);
        bye = false;
        coteUtilisee = coteDisponiblePour(a, b);
      } else {
        // Zéro ou un joueur : personne à battre.
        gagnant = a ?? b;
        bye = gagnant !== null;
      }

      duels.push({ round, position, a, b, gagnant, bye, coteUtilisee, moitie });
      suivants.push(gagnant);
    }

    actuels = suivants;
  }

  const champion = actuels.length === 1 ? actuels[0] : null;
  const parcours = champion
    ? roundsRemplis
        .map((r) => duels.find((d) => d.round === r && d.gagnant === champion))
        .filter((d): d is DuelBracket => Boolean(d))
    : [];

  return { rounds: roundsRemplis, duels, champion, parcours };
}

/** Duels d'un tour, dans l'ordre du tableau. */
export function duelsDuTour(bracket: Bracket, round: string): DuelBracket[] {
  return bracket.duels.filter((d) => d.round === round);
}
