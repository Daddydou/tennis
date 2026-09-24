import { supabaseAnon } from './anon';
import type {
  BracketRoundPickRow,
  MatchRow,
  ParticipantRow,
  PickRow,
  PlayerRow,
  SimulatedPickRow,
  TournamentRow,
} from './types';

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

/**
 * Picks d'un tournoi pour UN stock : le mien (`participantId` omis ou null —
 * comportement historique, INCHANGÉ) ou celui d'un participant du groupe.
 *
 * Chaque stock est indépendant (cf. tn_picks, migration 0014) : appeler cette
 * fonction sans argument continue de ne renvoyer QUE mes picks, exactement
 * comme avant l'existence des participants. L'écran Picks passe désormais le
 * stock sélectionné (sélecteur Moi / participant en haut de l'écran) ;
 * l'écran Résultats, lui, n'a jamais eu à changer — il ne montre que mon
 * propre score.
 */
export async function getPicks(
  tournamentId: string,
  participantId: string | null = null,
): Promise<PickRow[]> {
  const sb = supabaseAnon();
  let q = sb.from('tn_picks').select('*').eq('tournament_id', tournamentId);
  q = participantId === null ? q.is('participant_id', null) : q.eq('participant_id', participantId);
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PickRow[];
}

/**
 * TOUS les vrais picks d'un tournoi, moi et tous les participants confondus.
 * Réservé aux écrans qui comparent les stocks (section Picks du
 * simulateur, pour les points déjà inscrits) : ne pas s'en servir pour
 * « mes » picks, cf. `getPicks`.
 */
export async function getTousLesPicks(tournamentId: string): Promise<PickRow[]> {
  const sb = supabaseAnon();
  const { data, error } = await sb.from('tn_picks').select('*').eq('tournament_id', tournamentId);
  if (error) throw new Error(error.message);
  return (data ?? []) as PickRow[];
}

/** Participants du groupe, par ordre alphabétique — configurables, cf. /participants. */
export async function getParticipants(): Promise<ParticipantRow[]> {
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('tn_participants')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ParticipantRow[];
}

/**
 * Nombre de picks de chaque participant, tous tournois confondus — pour
 * avertir avant suppression (/participants) plutôt que de retirer quelqu'un
 * sans dire ce que ça efface.
 */
export async function compterPicksParParticipant(): Promise<Record<string, number>> {
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('tn_picks')
    .select('participant_id')
    .not('participant_id', 'is', null);
  if (error) throw new Error(error.message);
  const out: Record<string, number> = {};
  for (const r of data ?? []) {
    const id = (r as { participant_id: string }).participant_id;
    out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

/** Pronostics de bracket simulés, pour un tournoi, tous stocks et tous tours confondus. */
export async function getBracketRoundPicks(tournamentId: string): Promise<BracketRoundPickRow[]> {
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('tn_bracket_round_picks')
    .select('*')
    .eq('tournament_id', tournamentId);
  if (error) throw new Error(error.message);
  return (data ?? []) as BracketRoundPickRow[];
}

/** Picks hypothétiques du bac à sable de picks du simulateur, tous stocks confondus. */
export async function getSimulatedPicks(tournamentId: string): Promise<SimulatedPickRow[]> {
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('tn_simulated_picks')
    .select('*')
    .eq('tournament_id', tournamentId);
  if (error) throw new Error(error.message);
  return (data ?? []) as SimulatedPickRow[];
}
