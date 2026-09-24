/* -------------------------------------------------------------------------- */
/*  Reconstruction des structures du moteur (lib/) depuis la DB               */
/*                                                                            */
/*  Les modules de lib/ opèrent sur des Match[] / Player. Après import, les   */
/*  données vivent dans Supabase : on les rematérialise ici, sans toucher     */
/*  aux modules. La `half` d'un joueur se déduit de son match de 1er tour.    */
/* -------------------------------------------------------------------------- */

import {
  chargerIndexElo,
  resoudreElosParJoueur,
  INDEX_ELO_VIDE,
  type ElosResolus,
  type IndexElo,
} from './elo';
import type { Half, Match, MatchPlayer, Player, SetScore } from '@/lib/types';
import { getMatchRows, getPlayerRows, getTournament } from './lectures';
import type { MatchRow, PlayerRow, TournamentRow } from './types';

/**
 * Reconstruit les `Player` du moteur.
 *
 * Les Elo ne viennent plus des colonnes `elo_*` : ils sont résolus par la
 * cascade Tennis Abstract → maison → défaut (cf. db/elo.ts). Passer
 * `elos` déjà résolus évite de refaire le rapprochement de noms ici ; sans
 * lui, la résolution se fait sur un index vide et retombe donc sur l'Elo
 * maison, ce qui préserve le comportement d'avant.
 */
export function rowsToPlayers(
  tournament: TournamentRow,
  matchRows: MatchRow[],
  playerRows: PlayerRow[],
  elos: Record<string, ElosResolus> = resoudreElosParJoueur(
    playerRows,
    INDEX_ELO_VIDE,
  ),
): Record<string, Player> {
  const byId = new Map(playerRows.map((p) => [p.id, p]));
  const rounds = tournament.rounds ?? [];
  const premier = rounds[0];

  // Moitié de tableau, déduite du premier tour (cf. extraireJoueurs)
  const moities: Record<string, Half> = {};
  for (const m of matchRows) {
    if (m.round !== premier) continue;
    for (const pid of [m.player1_id, m.player2_id]) {
      if (pid && m.half) moities[pid] = m.half;
    }
  }

  const out: Record<string, Player> = {};
  for (const m of matchRows) {
    for (const pid of [m.player1_id, m.player2_id]) {
      if (!pid || out[pid]) continue;
      const p = byId.get(pid);
      if (!p) continue;

      const e = elos[pid] ?? resoudreElosParJoueur([p], INDEX_ELO_VIDE)[pid];

      out[pid] = {
        id: pid,
        tour: tournament.tour,
        name: p.name,
        country: p.country,
        // Le rang publié par Tennis Abstract complète celui de tn_players,
        // qui n'est renseigné par aucun import aujourd'hui.
        rank: p.rank ?? e.rangTa,
        seed: null, // non persisté par le schéma (voir README)
        half: moities[pid] ?? m.half ?? 'top',
        eloOverall: e.eloOverall,
        eloHard: e.eloHard,
        eloClay: e.eloClay,
        eloGrass: e.eloGrass,
      };
    }
  }
  return out;
}

export function rowsToMatches(
  matchRows: MatchRow[],
  playerRows: PlayerRow[],
): Match[] {
  const byId = new Map(playerRows.map((p) => [p.id, p]));

  const buildPlayer = (
    pid: string | null,
    side: 1 | 2,
    row: MatchRow,
  ): MatchPlayer => {
    if (!pid) {
      return {
        id: null,
        name: 'BYE',
        seed: null,
        country: null,
        isBye: true,
        winner: false,
        sets: [],
      };
    }
    const p = byId.get(pid);
    const sets: SetScore[] = (row.sets ?? []).map((s) => ({
      games: side === 1 ? (s.g1 ?? null) : (s.g2 ?? null),
      tiebreak: side === 1 ? (s.tb1 ?? null) : (s.tb2 ?? null),
    }));
    return {
      id: pid,
      name: p?.name ?? pid,
      seed: null,
      country: p?.country ?? null,
      isBye: false,
      winner: row.winner_id === pid,
      sets,
    };
  };

  return matchRows.map((row) => ({
    matchId: row.external_id,
    round: row.round,
    roundLabel: row.round,
    position: row.position ?? 0,
    half: (row.half ?? 'top') as Half,
    status: row.status,
    players: [
      buildPlayer(row.player1_id, 1, row),
      buildPlayer(row.player2_id, 2, row),
    ] as [MatchPlayer, MatchPlayer],
  }));
}

/** Charge tout ce qu'il faut au moteur pour un tournoi. */
export async function loadEngineData(tournamentId: string): Promise<{
  tournament: TournamentRow;
  matchRows: MatchRow[];
  playerRows: PlayerRow[];
  matches: Match[];
  players: Record<string, Player>;
  /** Elo résolus par joueur, avec leur source — pour l'affichage. */
  elos: Record<string, ElosResolus>;
  indexElo: IndexElo;
} | null> {
  // `tournament` et `matchRows` ne dépendent l'un de l'autre en rien (les
  // deux ne veulent que `tournamentId`) : les lancer de front, plutôt qu'en
  // cascade, évite d'attendre deux allers-retours Supabase l'un après
  // l'autre pour rien. Coût du pari : si le tournoi n'existe pas, la requête
  // matchRows aura tourné pour rien — un cas rare (mauvais id dans l'URL),
  // sans commune mesure avec le gain sur le chemin normal.
  const [tournament, matchRows] = await Promise.all([
    getTournament(tournamentId),
    getMatchRows(tournamentId),
  ]);
  if (!tournament) return null;

  const ids = new Set<string>();
  for (const m of matchRows) {
    if (m.player1_id) ids.add(m.player1_id);
    if (m.player2_id) ids.add(m.player2_id);
  }

  // Même logique : `playerRows` (dépend de `matchRows`) et `indexElo`
  // (dépend seulement de `tournament.tour`, déjà connu) sont indépendants
  // l'un de l'autre — mesuré ~330 ms en cascade contre ~150-230 ms de front
  // sur l'US Open 2026 ATP (128 joueurs, index Elo ATP complet).
  const [playerRows, indexElo] = await Promise.all([
    getPlayerRows([...ids]),
    chargerIndexElo(tournament.tour),
  ]);
  // Résolution de la cascade Elo une fois pour toutes : le rapprochement de
  // noms ne doit pas être refait à chaque lecture.
  const elos = resoudreElosParJoueur(playerRows, indexElo);

  return {
    tournament,
    matchRows,
    playerRows,
    matches: rowsToMatches(matchRows, playerRows),
    players: rowsToPlayers(tournament, matchRows, playerRows, elos),
    elos,
    indexElo,
  };
}
