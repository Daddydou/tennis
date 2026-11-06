import { chargerIndexElo, resoudreElosParJoueur } from '@/db/elo';
import { getPlayerRows, getTousLesPicks, type MatchRow, type TournamentRow } from '@/db/queries';
import { eloEffectif } from '@/lib/elo';
import type { PickMasters } from '@/lib/masters';
import { proposerPicks, proposerPronostic, type PickConseille, type PronosticPropose } from '@/lib/mastersConseils';
import { simulerMasters, type ResultatSim } from '@/lib/mastersSim';
import { vueMasters } from '@/lib/mastersVue';

/**
 * Propositions de picks et de pronostic pour un tournoi Masters (lib/mastersConseils.ts), calculées à
 * la demande avec l'Elo du jour et les résultats déjà joués. Jamais bloquant pour l'écran : en cas
 * d'erreur l'appelant n'affiche simplement pas les propositions.
 */

export interface ConseilsMasters {
  poules: { A: string[]; B: string[] };
  pronostic: PronosticPropose;
  /** Le pronostic ferme au premier match du tournoi. */
  pronosticFerme: boolean;
  picks: PickConseille[];
  sim: ResultatSim;
  /** Joueurs dont l'Elo n'est pas un vrai Elo (défaut du circuit) : les propositions sont moins fiables. */
  eloIncertain: string[];
}

const POIDS_SURFACE = 0.6;

export async function calculerConseilsMasters(tournoi: TournamentRow, rows: MatchRow[]): Promise<ConseilsMasters | null> {
  const lignes = rows.map((r) => ({
    round: r.round,
    position: r.position,
    half: r.half,
    player1Id: r.player1_id,
    player2Id: r.player2_id,
    winnerId: r.winner_id,
    status: r.status as string,
    sets: r.sets,
  }));
  const vue = vueMasters(lignes);
  const poules = { A: vue.poules.A.joueurs, B: vue.poules.B.joueurs };
  if (poules.A.length !== 4 || poules.B.length !== 4) return null;

  const ids = [...poules.A, ...poules.B];
  const [playerRows, index, tousLesPicks] = await Promise.all([getPlayerRows(ids), chargerIndexElo(tournoi.tour), getTousLesPicks(tournoi.id)]);
  const elos = resoudreElosParJoueur(playerRows, index);
  const elo = new Map(ids.map((id) => [id, eloEffectif(elos[id]?.eloOverall ?? 1500, elos[id]?.eloHard ?? null, POIDS_SURFACE)]));
  const eloIncertain = ids.filter((id) => !elos[id] || elos[id].source === 'defaut' || elos[id].source === 'ambigu');

  const sim = simulerMasters({ poules, elo, matchs: lignes, simulations: 10000, graine: 2026 });
  const existants: PickMasters[] = tousLesPicks
    .filter((p) => p.participant_id === null)
    .map((p) => ({ round: p.round, half: p.half, playerId: p.player_id }));
  const commence = rows.some((r) => r.status !== 'scheduled' && r.status !== 'bye');

  return { poules, pronostic: proposerPronostic(sim, poules), pronosticFerme: commence, picks: proposerPicks(sim, poules, existants), sim, eloIncertain };
}
