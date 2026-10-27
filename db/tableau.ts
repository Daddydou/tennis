import { STATUTS_DECIDES, STATUTS_INDECIS } from '@/lib/types';
import { genererSlots } from '@/lib/optimizer';
import type { Half, Surface } from '@/lib/types';
import type { MatchRow, PickRow } from './types';

/* -------------------------------------------------------------------------- */
/*  Faits du tableau — déduits des matchs réels, sans simulation              */
/* -------------------------------------------------------------------------- */

/**
 * Joueurs encore en lice dans le tableau : ceux qui n'ont perdu aucun match
 * décidé. Un fait du tableau, pas une probabilité — contrairement à la
 * présence Monte Carlo de l'écran Prédictions, on n'a pas besoin de
 * simulation pour savoir qui est déjà éliminé.
 */
export function joueursEnLice(matchRows: MatchRow[]): Set<string> {
  const tous = new Set<string>();
  const elimines = new Set<string>();
  for (const m of matchRows) {
    for (const id of [m.player1_id, m.player2_id]) {
      if (id) tous.add(id);
    }
    if (STATUTS_DECIDES.includes(m.status) && m.winner_id) {
      for (const id of [m.player1_id, m.player2_id]) {
        if (id && id !== m.winner_id) elimines.add(id);
      }
    }
  }
  return new Set([...tous].filter((id) => !elimines.has(id)));
}

/** Surface utilisable par le moteur Elo (pas de 'carpet' côté optimizer). */
export function surfacePourElo(s: Surface | null): 'hard' | 'clay' | 'grass' {
  return s === 'clay' || s === 'grass' ? s : 'hard';
}

/**
 * Tour courant déduit de l'état des matchs : premier tour comportant un match
 * à jouer / en cours ; à défaut, premier tour non entièrement décidé ; à
 * défaut, le premier tour. Sert à préchauffer le cache de projections.
 */
export function tourCourantMatches(
  matchRows: MatchRow[],
  rounds: string[],
): string | null {
  const aJouer =
    rounds.find((r) =>
      matchRows.some((m) => m.round === r && STATUTS_INDECIS.includes(m.status)),
    ) ??
    rounds.find((r) =>
      matchRows.some((m) => m.round === r && !STATUTS_DECIDES.includes(m.status)),
    );
  return aJouer ?? rounds[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Disponibilité des slots de pick                                            */
/* -------------------------------------------------------------------------- */

export interface EtatSlot {
  round: string;
  half: Half | null;
  /** Survivants connus de ce slot. Vide tant que le tour n'est pas constitué. */
  joueurs: string[];
  /** Survivants encore sélectionnables : pas déjà pickés à un autre tour. */
  disponibles: string[];
  /** Pick déjà posé sur ce slot. */
  pick: string | null;
  /**
   * Slot constitué mais dont tous les survivants sont déjà utilisés ailleurs
   * dans le tournoi : il ne peut littéralement pas être rempli.
   */
  impossible: boolean;
}

/**
 * État de chaque slot de pick, déduit des matchs réels.
 *
 * Volontairement indépendant des projections Monte Carlo : la disponibilité
 * est un fait du tableau, pas une estimation, et doit rester calculable pour
 * tous les tours sans lancer une simulation par tour.
 *
 * Un joueur pické SUR ce slot ne compte pas comme « utilisé ailleurs » : sans
 * ça, un slot déjà rempli se déclarerait impossible et se neutraliserait.
 */
export function etatsSlots(
  slots: { round: string; half: Half | null }[],
  matchRows: MatchRow[],
  picks: PickRow[],
): EtatSlot[] {
  return slots.map(({ round, half }) => {
    const duSlot = matchRows.filter(
      (m) => m.round === round && (half === null || m.half === half),
    );
    const joueurs = [
      ...new Set(
        duSlot
          .flatMap((m) => [m.player1_id, m.player2_id])
          .filter((id): id is string => id !== null),
      ),
    ];

    const ailleurs = new Set(
      picks
        .filter((p) => !(p.round === round && (p.half ?? null) === half))
        .map((p) => p.player_id),
    );
    const disponibles = joueurs.filter((id) => !ailleurs.has(id));
    const pick =
      picks.find((p) => p.round === round && (p.half ?? null) === half)
        ?.player_id ?? null;

    return {
      round,
      half,
      joueurs,
      disponibles,
      pick,
      // Un tour pas encore constitué (joueurs inconnus) n'est pas impossible :
      // il est seulement indéterminé.
      impossible: joueurs.length > 0 && disponibles.length === 0,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Avancement des picks d'un stock                                            */
/* -------------------------------------------------------------------------- */

export interface AvancementTour {
  round: string;
  /** Picks posés sur ce tour. */
  faits: number;
  /** Slots réellement remplissables (les impossibles sont neutralisés). */
  requis: number;
  /** Slots sans pick possible : tous leurs survivants déjà utilisés. */
  neutralises: number;
}

/**
 * Avancement des picks d'UN stock (moi ou un participant), tour par tour, et
 * son tour courant : le premier dont les picks remplissables ne sont pas tous
 * posés (à défaut, le dernier). Partagé par l'onglet Picks et le Dashboard :
 * le « tour à picker » ne doit jamais différer d'un écran à l'autre.
 *
 * Un slot impossible (tous ses survivants pickés ailleurs) sort du décompte,
 * sinon le tour resterait éternellement incomplet et bloquerait la
 * progression.
 */
export function avancementPicks(
  rounds: string[],
  matchRows: MatchRow[],
  picks: PickRow[],
): { parTour: AvancementTour[]; tourCourant: string | null } {
  const slots = genererSlots(rounds);
  const etats = etatsSlots(slots, matchRows, picks);
  const parTour = rounds.map((round) => {
    const duTour = etats.filter((e) => e.round === round);
    const neutralises = duTour.filter((e) => e.impossible).length;
    return {
      round,
      faits: picks.filter((p) => p.round === round).length,
      requis: duTour.length - neutralises,
      neutralises,
    };
  });
  const tourCourant =
    parTour.find((t) => t.faits < t.requis)?.round ?? rounds[rounds.length - 1] ?? null;
  return { parTour, tourCourant };
}
