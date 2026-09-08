/**
 * Petits adaptateurs entre le moteur de bracket (lib/bracketSim.ts, position
 * par tour) et le moteur de picks existant (supabase/queries.ts, half par
 * tour) — pour réutiliser `etatsSlots`/`genererSlots` TELS QUELS sur le
 * tableau testé du simulateur, sans dupliquer leur logique d'éligibilité.
 *
 * Module pur (aucune I/O) mais pas dans lib/bracketSim.ts : il connaît la
 * forme des lignes DB (MatchRow/PickRow), que ce module-là ignore
 * délibérément.
 */
import { cleDuel, type ArbreResolu } from '@/lib/bracketSim';
import type { Half, MatchStatus } from '@/lib/types';
import type { MatchRow, PickRow } from '@/supabase/queries';

/** Clé stable d'un slot de pick (round + half) — distincte de `cleDuel` (round + position). */
export function cleSlot(round: string, half: Half | null): string {
  return `${round}|${half ?? ''}`;
}

/**
 * Les vrais matchs, réécrits pour refléter l'état du TABLEAU TESTÉ : les
 * entrants et le vainqueur de chaque emplacement viennent de `arbre` (réel
 * jusqu'à un point, cliqué au-delà) plutôt que des vraies colonnes — le
 * `half` et tout le reste ne bougent pas. Rend `etatsSlots`/`genererSlots`
 * directement utilisables sur ce scénario.
 */
export function versMatchRowsTestees(matchRows: MatchRow[], arbre: ArbreResolu): MatchRow[] {
  const parCle = new Map(arbre.duels.map((d) => [cleDuel(d.round, d.position), d]));
  return matchRows.map((m) => {
    if (m.position === null) return m;
    const d = parCle.get(cleDuel(m.round, m.position));
    if (!d) return m;
    return {
      ...m,
      player1_id: d.a,
      player2_id: d.b,
      winner_id: d.vainqueur,
      status: (d.vainqueur ? 'completed' : m.status) as MatchStatus,
    };
  });
}

/** Une carte de picks simulés (cleSlot -> playerId) en forme de PickRow, pour `etatsSlots`. */
export function versPickRowsSimules(picks: ReadonlyMap<string, string>): PickRow[] {
  return [...picks.entries()].map(([cle, playerId]) => {
    const [round, half] = cle.split('|');
    return {
      id: cle,
      tournament_id: '',
      participant_id: null,
      round,
      half: (half || null) as Half | null,
      player_id: playerId,
      points: null,
      points_match: null,
      points_sets: null,
      points_games: null,
      e_points: null,
      created_at: '',
    };
  });
}

/**
 * Points « possibles » d'UN pick hypothétique : l'espérance du moteur
 * existant pour ce joueur à ce tour, SEULEMENT si le tableau testé le
 * donne effectivement vainqueur de son match à ce tour — jamais le barème
 * détaillé (set par set), impossible à connaître avant que le tour soit
 * joué pour de vrai.
 */
export function pointsPossiblesPick(
  arbreTeste: ArbreResolu,
  round: string,
  playerId: string,
  esperances: Record<string, Record<string, number>>,
): number {
  const duel = arbreTeste.duels.find((d) => d.round === round && (d.a === playerId || d.b === playerId));
  if (!duel || duel.vainqueur !== playerId) return 0;
  return esperances[playerId]?.[round] ?? 0;
}
