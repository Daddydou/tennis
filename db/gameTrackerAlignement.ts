import 'server-only';
import { supabaseAnon } from './anon';
import { supabaseAdmin } from './server';
import { recalculerPoints } from './points';
import { synchroniserPickSimuleDepuisReel } from './picksSimulesSync';
import { genererSlots } from '@/lib/optimizer';
import { planAlignementGT, type ChangementAlignement, type PlanAlignement } from '@/lib/gameTrackerAlignement';
import type { EtatGT } from '@/lib/gameTrackerPicks';

/**
 * Aligne NOS picks (Moi, Laki, Thomas) sur ceux de Game Tracker pour les tours
 * verrouillés ou terminés chez eux : c'est leur jeu qui compte au classement.
 * Le plan est calculé par lib/gameTrackerAlignement.ts (pur, testé).
 *
 * SANS garde de session : l'appelant vérifie (Server Action après
 * sessionValide()). Lectures avec la clé publique, écritures service role.
 * Jamais de POST chez Game Tracker ici : on ne fait que LIRE leur état (déjà lu
 * par l'appelant) et réécrire notre tn_picks.
 */

export type ResultatAlignement =
  | { ok: true; rounds: string[]; changements: ChangementAlignement[]; avertissements: string[] }
  | { ok: false; raisons: string[] };

async function lire<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>, quoi: string): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(`${quoi} : ${error.message}`);
  return (data ?? []) as T;
}

export async function planPourTournoi(tournamentId: string, etat: EtatGT): Promise<PlanAlignement> {
  const sb = supabaseAnon();
  const [tournoi, matchs, picks, participants] = await Promise.all([
    lire<{ rounds: string[] | null } | null>(sb.from('tn_tournaments').select('rounds').eq('id', tournamentId).maybeSingle(), 'tn_tournaments'),
    lire<{ round: string; position: number | null; player1_id: string | null; player2_id: string | null; status: string | null }[]>(
      sb.from('tn_matches').select('round, position, player1_id, player2_id, status').eq('tournament_id', tournamentId),
      'tn_matches',
    ),
    lire<{ participant_id: string | null; round: string; half: 'top' | 'bottom' | null; player_id: string }[]>(
      sb.from('tn_picks').select('participant_id, round, half, player_id').eq('tournament_id', tournamentId),
      'tn_picks',
    ),
    lire<{ id: string; name: string }[]>(sb.from('tn_participants').select('id, name'), 'tn_participants'),
  ]);
  const rounds = tournoi?.rounds ?? [];
  const ids = new Set<string>();
  for (const m of matchs) {
    if (m.player1_id) ids.add(m.player1_id);
    if (m.player2_id) ids.add(m.player2_id);
  }
  for (const p of picks) ids.add(p.player_id);
  const joueurs = ids.size
    ? await lire<{ id: string; name: string }[]>(sb.from('tn_players').select('id, name').in('id', [...ids]), 'tn_players')
    : [];

  return planAlignementGT({
    drawSize: etat.tournoi.drawSize,
    tourOuvert: etat.tourOuvert?.numero ?? null,
    tours: etat.tours,
    rounds,
    slots: genererSlots(rounds).map((s) => ({ round: s.round, half: (s.half ?? null) as 'top' | 'bottom' | null })),
    matchs: matchs
      .filter((m) => m.position !== null)
      .map((m) => ({ round: m.round, position: m.position as number, player1Id: m.player1_id, player2Id: m.player2_id, status: m.status })),
    noms: new Map(joueurs.map((j) => [j.id, j.name])),
    participants,
    picks: picks.map((p) => ({ stockId: p.participant_id, round: p.round, half: p.half, playerId: p.player_id })),
  });
}

/** Calcule le plan puis l'applique. Aucun changement = aucune écriture. */
export async function alignerSurGameTracker(tournamentId: string, etat: EtatGT): Promise<ResultatAlignement> {
  const plan = await planPourTournoi(tournamentId, etat);
  if (!plan.ok) return plan;
  if (plan.changements.length === 0) return plan;

  const sb = supabaseAdmin();
  // 1) Tout ce qui change est d'abord SUPPRIMÉ (les index uniques « un joueur
  //    par stock » et « un pick par slot » interdiraient sinon un échange
  //    entre deux tours), 2) puis les picks de Game Tracker sont insérés.
  for (const c of plan.changements) {
    let del = sb.from('tn_picks').delete().eq('tournament_id', tournamentId).eq('round', c.round);
    del = c.half === null ? del.is('half', null) : del.eq('half', c.half);
    del = c.stockId === null ? del.is('participant_id', null) : del.eq('participant_id', c.stockId);
    const { error } = await del;
    if (error) throw new Error(`tn_picks (suppression) : ${error.message}`);
  }
  const lignes = plan.changements
    .filter((c) => c.apres !== null)
    .map((c) => ({
      tournament_id: tournamentId,
      participant_id: c.stockId,
      round: c.round,
      half: c.half,
      player_id: c.apres!.playerId,
      e_points: null,
      locked_at: new Date().toISOString(),
    }));
  if (lignes.length) {
    const { error } = await sb.from('tn_picks').insert(lignes);
    if (error) throw new Error(`tn_picks (ajout) : ${error.message}`);
  }

  await recalculerPoints(tournamentId);
  // Bac à sable du simulateur : même report que validerPick (best-effort).
  for (const c of plan.changements) {
    if (!c.apres) continue;
    const s = await synchroniserPickSimuleDepuisReel(tournamentId, c.round, c.half, c.apres.playerId, c.stockId);
    if (!s.ok) console.error(`Sync pick simulé (${c.round}|${c.half ?? ''}, ${c.stockNom}) :`, s.error);
  }
  return plan;
}
