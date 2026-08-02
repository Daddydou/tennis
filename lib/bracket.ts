/**
 * BRACKET PRÉDIT — PARCOURS DÉTERMINISTE DU TABLEAU
 *
 * Remplit l'arbre du tournoi depuis le TIRAGE, en donnant chaque match au plus
 * haut Elo effectif. Aucun aléa, aucune simulation : à Elo donné, le même
 * tableau produit toujours le même champion.
 *
 * Ce que ce module NE regarde PAS, et c'est le point important :
 *   - `winner_id` et les scores — le pronostic ne doit pas se laisser corriger
 *     par ce qui s'est déjà joué. Un tournoi à venir, en cours ou terminé donne
 *     exactement le même arbre, comme l'espérance Fantasy (cf. supabase/fantasy.ts) ;
 *   - les tours postérieurs au premier — seul `rounds[0]` est lu, le reste est
 *     déduit. Un tableau dont un tour intermédiaire manque en base reste donc
 *     entièrement prédictible.
 *
 * Module PUR : ni I/O, ni Supabase, ni Elo. Les critères de comparaison lui
 * sont fournis (`CritereJoueur`), ce qui le rend testable sur un tableau
 * fabriqué à la main.
 */

export interface CritereJoueur {
  /** Elo effectif sur la surface du tournoi (mélange 60/40, cf. supabase/elo.ts). */
  elo: number;
  /** Rang officiel, pour départager deux Elo strictement égaux. */
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
 * Elo effectif d'abord. À Elo strictement égal — deux joueurs sans
 * correspondance Tennis Abstract partagent la valeur par défaut, ce n'est pas
 * un cas d'école — on prend le mieux classé ; un joueur sans rang passe après
 * un joueur classé. En dernier recours, l'identifiant : arbitraire, mais
 * STABLE, pour que deux affichages successifs ne donnent pas deux champions.
 */
export function vainqueurDuel(
  a: string,
  b: string,
  critere: (id: string) => CritereJoueur,
): string {
  const ca = critere(a);
  const cb = critere(b);
  if (ca.elo !== cb.elo) return ca.elo > cb.elo ? a : b;

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
 */
export function construireBracket(
  matches: MatchTirage[],
  rounds: string[],
  critere: (id: string) => CritereJoueur,
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
      if (a && b) {
        gagnant = vainqueurDuel(a, b, critere);
        bye = false;
      } else {
        // Zéro ou un joueur : personne à battre.
        gagnant = a ?? b;
        bye = gagnant !== null;
      }

      duels.push({ round, position, a, b, gagnant, bye, moitie });
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
