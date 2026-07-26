import { supabaseAnon } from './anon';
import { ELO_DEFAUT, eloDepuisRang } from '@/lib/elo';
import type {
  Half,
  Match,
  MatchPlayer,
  MatchStatus,
  Player,
  SetScore,
  Surface,
  Tour,
} from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Types des lignes DB (tables tn_*)                                          */
/* -------------------------------------------------------------------------- */

export interface TournamentRow {
  id: string;
  external_id: string | null;
  slug: string | null;
  name: string;
  tour: Tour;
  category: string | null;
  surface: Surface | null;
  draw_size: number | null;
  best_of: number | null;
  year: number;
  start_date: string | null;
  status: 'upcoming' | 'running' | 'completed';
  rounds: string[] | null;
  created_at: string | null;
}

export interface PlayerRow {
  id: string;
  tour: Tour;
  name: string;
  full_name: string | null;
  country: string | null;
  rank: number | null;
  elo_overall: number | null;
  elo_hard: number | null;
  elo_clay: number | null;
  elo_grass: number | null;
}

export interface SetJson {
  g1: number | null;
  g2: number | null;
  tb1?: number | null;
  tb2?: number | null;
}

export interface MatchRow {
  id: string;
  tournament_id: string;
  external_id: string | null;
  round: string;
  round_order: number;
  position: number | null;
  half: Half | null;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  sets: SetJson[] | null;
  status: MatchStatus;
}

export interface PickRow {
  id: string;
  tournament_id: string;
  round: string;
  half: Half | null;
  player_id: string;
  points: number | null;
  points_match: number | null;
  points_sets: number | null;
  points_games: number | null;
  e_points: number | null;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/*  Lectures — clé anon uniquement (policies RLS `for select to anon`).        */
/*  Ce module ne contient aucune écriture : il est donc utilisable aussi bien  */
/*  depuis un Server Component que depuis le navigateur.                      */
/* -------------------------------------------------------------------------- */

/**
 * Tournois du plus récent au plus ancien.
 *
 * `start_date` peut manquer sur d'anciennes lignes (l'extraction du
 * bookmarklet ne porte aucune date ; elle est reconstituée à l'import depuis
 * `lib/calendrier.ts`). On les renvoie en dernier, départagées par année puis
 * par date d'import — jamais mélangées aux tournois datés.
 */
export async function listTournaments(): Promise<TournamentRow[]> {
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('tn_tournaments')
    .select('*')
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('year', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TournamentRow[];
}

export async function getTournament(id: string): Promise<TournamentRow | null> {
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('tn_tournaments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TournamentRow) ?? null;
}

export async function getMatchRows(tournamentId: string): Promise<MatchRow[]> {
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('tn_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('round_order', { ascending: true })
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MatchRow[];
}

export async function getPlayerRows(ids: string[]): Promise<PlayerRow[]> {
  if (ids.length === 0) return [];
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('tn_players')
    .select('*')
    .in('id', ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as PlayerRow[];
}

export async function getPicks(tournamentId: string): Promise<PickRow[]> {
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('tn_picks')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PickRow[];
}

/* -------------------------------------------------------------------------- */
/*  Reconstruction des structures du moteur (lib/) depuis la DB               */
/*                                                                            */
/*  Les modules de lib/ opèrent sur des Match[] / Player. Après import, les   */
/*  données vivent dans Supabase : on les rematérialise ici, sans toucher     */
/*  aux modules. La `half` d'un joueur se déduit de son match de 1er tour.    */
/* -------------------------------------------------------------------------- */

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
  const decides: MatchStatus[] = ['completed', 'walkover', 'retired', 'bye'];
  const aJouer =
    rounds.find((r) =>
      matchRows.some(
        (m) => m.round === r && (m.status === 'scheduled' || m.status === 'live'),
      ),
    ) ??
    rounds.find((r) =>
      matchRows.some((m) => m.round === r && !decides.includes(m.status)),
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

export function rowsToPlayers(
  tournament: TournamentRow,
  matchRows: MatchRow[],
  playerRows: PlayerRow[],
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

      const base =
        p.elo_overall != null
          ? Number(p.elo_overall)
          : p.rank != null
            ? eloDepuisRang(p.rank)
            : ELO_DEFAUT;

      out[pid] = {
        id: pid,
        tour: tournament.tour,
        name: p.name,
        country: p.country,
        rank: p.rank,
        seed: null, // non persisté par le schéma (voir README)
        half: moities[pid] ?? m.half ?? 'top',
        eloOverall: p.elo_overall != null ? Number(p.elo_overall) : base,
        eloHard: p.elo_hard != null ? Number(p.elo_hard) : base,
        eloClay: p.elo_clay != null ? Number(p.elo_clay) : base,
        eloGrass: p.elo_grass != null ? Number(p.elo_grass) : base,
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
} | null> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) return null;

  const matchRows = await getMatchRows(tournamentId);
  const ids = new Set<string>();
  for (const m of matchRows) {
    if (m.player1_id) ids.add(m.player1_id);
    if (m.player2_id) ids.add(m.player2_id);
  }
  const playerRows = await getPlayerRows([...ids]);

  return {
    tournament,
    matchRows,
    playerRows,
    matches: rowsToMatches(matchRows, playerRows),
    players: rowsToPlayers(tournament, matchRows, playerRows),
  };
}
