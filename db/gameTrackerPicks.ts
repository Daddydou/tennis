import type { SupabaseClient } from '@supabase/supabase-js';
import type { MatchInterne } from '@/lib/bracketExternePont';
import { fusionnerReservations, type PickLocal, type TournoiInterneGT, type TournoiPicksGT } from '@/lib/gameTrackerPicks';

/**
 * Ce qu'il faut savoir chez nous pour parler à l'API picks de Game Tracker
 * (lib/gameTrackerPicks.ts, externe/gameTrackerPicksClient.ts).
 *
 * Clients Supabase INJECTÉS, comme db/bracketExternePont.ts.
 * `chargerContexteLocalGT` est en LECTURE seule (clé publique, RLS = select) :
 * l'envoi vers Game Tracker ne modifie aucun de nos picks.
 * `ecrireLienGT` est la SEULE écriture de ce module (service role, injecté).
 *
 * Lien tournoi interne <-> tournoi Game Tracker : le MÊME que celui du pont de
 * Thomas (tn_bracket_externe_tournois.tournament_id_interne), lu à l'envers.
 * Posé depuis /import/thomas, ou depuis le panneau Game Tracker de l'écran
 * picks (tournoi absent de l'API bracket). Jamais posé sans un choix explicite.
 */

export interface ContexteLocalGT {
  /** Identifiant du tournoi chez Game Tracker, ou null si le lien n'est pas posé. */
  gtId: string | null;
  /** Notre tournoi, de quoi le rapprocher de ceux de Game Tracker. */
  interne: TournoiInterneGT;
  rounds: string[];
  matchs: MatchInterne[];
  noms: Map<string, string>;
  /**
   * Mes picks (stock « moi », participant_id null) : les picks validés, plus mes
   * réservations pour les tours pas encore validés (cf. fusionnerReservations).
   */
  picks: PickLocal[];
}

async function lire<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>, quoi: string): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(`${quoi} : ${error.message}`);
  return data as T;
}

export async function chargerContexteLocalGT(lecture: SupabaseClient, tournamentId: string): Promise<ContexteLocalGT> {
  const [lien, tournoi, matchs, picks, reservations] = await Promise.all([
    lire<{ id: string }[]>(
      lecture.from('tn_bracket_externe_tournois').select('id').eq('tournament_id_interne', tournamentId).limit(1),
      'tn_bracket_externe_tournois',
    ),
    lire<{ name: string; tour: string; year: number | null; draw_size: number | null; rounds: string[] | null } | null>(
      lecture.from('tn_tournaments').select('name, tour, year, draw_size, rounds').eq('id', tournamentId).maybeSingle(),
      'tn_tournaments',
    ),
    lire<{ round: string; position: number | null; player1_id: string | null; player2_id: string | null; status: string | null }[]>(
      lecture.from('tn_matches').select('round, position, player1_id, player2_id, status').eq('tournament_id', tournamentId),
      'tn_matches',
    ),
    lire<{ round: string; half: 'top' | 'bottom' | null; player_id: string }[]>(
      lecture.from('tn_picks').select('round, half, player_id').eq('tournament_id', tournamentId).is('participant_id', null),
      'tn_picks',
    ),
    lire<{ round: string; half: 'top' | 'bottom' | null; player_id: string }[]>(
      lecture
        .from('tn_plan_reservations')
        .select('round, half, player_id')
        .eq('tournament_id', tournamentId)
        .is('participant_id', null),
      'tn_plan_reservations',
    ),
  ]);
  if (!tournoi) throw new Error(`Tournoi ${tournamentId} introuvable.`);

  const ids = [...new Set([...picks, ...reservations].map((p) => p.player_id))];
  const joueurs = ids.length
    ? await lire<{ id: string; name: string }[]>(lecture.from('tn_players').select('id, name').in('id', ids), 'tn_players')
    : [];

  return {
    gtId: lien[0]?.id ?? null,
    interne: { name: tournoi.name, tour: tournoi.tour, year: tournoi.year, drawSize: tournoi.draw_size },
    rounds: tournoi.rounds ?? [],
    matchs: matchs
      .filter((m) => m.position !== null)
      .map((m) => ({ round: m.round, position: m.position as number, player1Id: m.player1_id, player2Id: m.player2_id, status: m.status })),
    noms: new Map(joueurs.map((j) => [j.id, j.name])),
    picks: fusionnerReservations(
      picks.map((p) => ({ round: p.round, half: p.half, playerId: p.player_id })),
      reservations.map((r) => ({ round: r.round, half: r.half, playerId: r.player_id })),
    ),
  };
}

/**
 * Pose le lien entre notre tournoi et un tournoi de Game Tracker, dans la même
 * table que le pont de Thomas (tn_bracket_externe_tournois) : AUCUNE migration.
 * Utile pour un tournoi présent dans l'API picks mais pas dans l'API bracket
 * (la ligne est alors créée a minima ; une synchro bracket ultérieure la
 * complétera sans toucher au lien, cf. db/bracketExterneEcriture.ts).
 *
 * `ecriture` = service role, INJECTÉ : l'appelant (Server Action) a déjà
 * vérifié la session. Refuse si notre tournoi est déjà relié à un autre
 * tournoi Game Tracker (on ne remplace jamais un lien en silence).
 */
export async function ecrireLienGT(
  ecriture: SupabaseClient,
  tournamentId: string,
  gt: TournoiPicksGT,
): Promise<{ ok: true; cree: boolean } | { ok: false; erreur: string }> {
  const deja = await lire<{ id: string }[]>(
    ecriture.from('tn_bracket_externe_tournois').select('id').eq('tournament_id_interne', tournamentId).limit(1),
    'tn_bracket_externe_tournois',
  );
  if (deja[0] && deja[0].id !== gt.id) {
    return { ok: false, erreur: 'Ce tournoi est déjà relié à un autre tournoi Game Tracker.' };
  }
  const existant = await lire<{ id: string; tournament_id_interne: string | null } | null>(
    ecriture.from('tn_bracket_externe_tournois').select('id, tournament_id_interne').eq('id', gt.id).maybeSingle(),
    'tn_bracket_externe_tournois',
  );
  if (existant) {
    if (existant.tournament_id_interne && existant.tournament_id_interne !== tournamentId) {
      return { ok: false, erreur: 'Ce tournoi Game Tracker est déjà relié à un autre de nos tournois.' };
    }
    const { error } = await ecriture.from('tn_bracket_externe_tournois').update({ tournament_id_interne: tournamentId }).eq('id', gt.id);
    if (error) return { ok: false, erreur: `tn_bracket_externe_tournois : ${error.message}` };
    return { ok: true, cree: false };
  }
  const { error } = await ecriture.from('tn_bracket_externe_tournois').insert({
    id: gt.id,
    nom: gt.nom,
    tour: gt.tour,
    annee: gt.annee,
    draw_size: gt.drawSize,
    statut: gt.statut,
    verrouille: false,
    tournament_id_interne: tournamentId,
  });
  if (error) return { ok: false, erreur: `tn_bracket_externe_tournois : ${error.message}` };
  return { ok: true, cree: true };
}