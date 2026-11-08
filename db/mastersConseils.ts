import { chargerIndexElo, resoudreElosParJoueur } from '@/db/elo';
import { getParticipants, getPlayerRows, getTousLesPicks, type MatchRow, type TournamentRow } from '@/db/queries';
import { eloEffectif } from '@/lib/elo';
import type { PickMasters } from '@/lib/masters';
import { proposerPicks, proposerPronostic, type PickConseille, type PronosticPropose } from '@/lib/mastersConseils';
import { simulerMasters, TOURS_SIM, type ResultatSim, type TourSim } from '@/lib/mastersSim';
import { planifierStrategies, type RivalMasters, type StrategiesMasters } from '@/lib/mastersStrategies';
import { pronosticFerme } from '@/lib/mastersPronostic';
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
  /** Les quatre stratégies (Prudent, Équilibré, Audacieux, Contre les rivaux), recalculées à chaque chargement. */
  strategies: StrategiesMasters;
  /** Matchs joués / matchs du tournoi, pour dire sur quoi le plan est calculé. */
  avancement: { joues: number; total: number };
  sim: ResultatSim;
  /** Elo effectif (surface pondérée) de chaque joueuse, pour l'analyse des matchs. */
  elo: Record<string, number>;
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
  const [playerRows, index, tousLesPicks, participants] = await Promise.all([
    getPlayerRows(ids),
    chargerIndexElo(tournoi.tour),
    getTousLesPicks(tournoi.id),
    getParticipants(),
  ]);
  const elos = resoudreElosParJoueur(playerRows, index);
  const elo = new Map(ids.map((id) => [id, eloEffectif(elos[id]?.eloOverall ?? 1500, elos[id]?.eloHard ?? null, POIDS_SURFACE)]));
  const eloIncertain = ids.filter((id) => !elos[id] || elos[id].source === 'defaut' || elos[id].source === 'ambigu');

  const sim = simulerMasters({ poules, elo, matchs: lignes, simulations: 10000, graine: 2026 });
  const existants: PickMasters[] = tousLesPicks
    .filter((p) => p.participant_id === null)
    .map((p) => ({ round: p.round, half: p.half, playerId: p.player_id }));
  const commence = pronosticFerme(rows.map((r) => ({ status: r.status, scheduledAt: r.scheduled_at })), new Date());

  // Rivaux : les autres participants et leurs picks déjà posés (alignés sur Game Tracker).
  const rivaux: RivalMasters[] = participants.map((p) => ({
    nom: p.name,
    picks: tousLesPicks.filter((k) => k.participant_id === p.id).map((k) => ({ round: k.round, half: k.half, playerId: k.player_id })),
  }));
  // Un tour est fermé quand tous ses matchs sont joués : on n'y propose plus de pick.
  const decide = (l: (typeof lignes)[number]) => ['completed', 'walkover', 'retired'].includes(l.status) && l.winnerId !== null;
  const fermes = new Set<TourSim>(TOURS_SIM.filter((t) => lignes.some((l) => l.round === t) && lignes.filter((l) => l.round === t).every(decide)));
  const strategies = planifierStrategies(sim, poules, existants, rivaux, fermes);
  const avancement = { joues: lignes.filter((l) => TOURS_SIM.includes(l.round as TourSim) && decide(l)).length, total: 15 };

  return {
    poules,
    pronostic: proposerPronostic(sim, poules),
    pronosticFerme: commence,
    picks: proposerPicks(sim, poules, existants),
    strategies,
    avancement,
    sim,
    elo: Object.fromEntries(elo),
    eloIncertain,
  };
}
