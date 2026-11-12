import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanDavis } from '@/lib/davisImport';
import type { TournoiPicksGT } from '@/lib/gameTrackerPicks';
import { ecrireLienGT } from './gameTrackerPicks';

/**
 * Écriture de la Coupe Davis (plan construit par lib/davisImport.ts).
 *
 * IDEMPOTENT et PRUDENT, comme db/importMasters.ts : relancer ne duplique rien et ne touche JAMAIS un résultat.
 *   - nations : créées dans tn_players si absentes (identifiant `davis-<pays>`), sinon laissées telles quelles ;
 *   - tournoi : créé s'il n'existe pas (clé : external_id + circuit + année), sinon laissé tel quel ;
 *   - match absent : créé (« scheduled », sans score) ; match présent sans vainqueur : joueurs mis à jour seulement ;
 *     match présent avec vainqueur : jamais modifié ;
 *   - lien avec le tournoi de Thomas : posé (tn_bracket_externe_tournois.tournament_id_interne), jamais remplacé.
 */

export interface ResumeImportDavis {
  tournamentId: string | null;
  tournoiCree: boolean;
  nationsCreees: number;
  matchsCrees: number;
  matchsMisAJour: number;
  matchsInchanges: number;
  /** Lien avec Game Tracker : posé, déjà posé, ou message d'échec (null = pas demandé / simulation). */
  lien: 'pose' | 'dejaPose' | string | null;
  ecrit: boolean;
}

async function lire<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>, quoi: string): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(`${quoi} : ${error.message}`);
  return data as T;
}

export async function ecrireDavis(sb: SupabaseClient, plan: PlanDavis, ecrire: boolean, gt: TournoiPicksGT | null = null): Promise<ResumeImportDavis> {
  const t = plan.tournoi;

  // Nations
  const ids = plan.nations.map((n) => n.id);
  const presentes = new Set((await lire<{ id: string }[]>(sb.from('tn_players').select('id').in('id', ids), 'tn_players')).map((p) => p.id));
  const aCreer = plan.nations.filter((n) => !presentes.has(n.id));
  if (ecrire && aCreer.length) {
    const { error } = await sb.from('tn_players').insert(aCreer.map((n) => ({ id: n.id, tour: 'ATP', name: n.name, full_name: n.name, country: n.country })));
    if (error) throw new Error(`tn_players (création des nations) : ${error.message}`);
  }

  // Tournoi
  const existant = await lire<{ id: string } | null>(
    sb.from('tn_tournaments').select('id').eq('external_id', t.externalId).eq('tour', t.tour).eq('year', t.year).maybeSingle(),
    'tn_tournaments',
  );
  let tournamentId = existant?.id ?? null;
  const tournoiCree = existant === null;
  if (tournoiCree && ecrire) {
    const cree = await lire<{ id: string }>(
      sb
        .from('tn_tournaments')
        .insert({
          external_id: t.externalId,
          name: t.name,
          tour: t.tour,
          category: t.category,
          surface: t.surface,
          draw_size: t.drawSize,
          best_of: t.bestOf,
          year: t.year,
          start_date: t.debut,
          end_date: t.fin,
          status: 'upcoming',
          rounds: t.rounds,
        })
        .select('id')
        .single(),
      'tn_tournaments (création)',
    );
    tournamentId = cree.id;
  }

  // Matchs
  const lignes = tournamentId
    ? await lire<{ round: string; position: number | null; player1_id: string | null; player2_id: string | null; winner_id: string | null }[]>(
        sb.from('tn_matches').select('round, position, player1_id, player2_id, winner_id').eq('tournament_id', tournamentId),
        'tn_matches',
      )
    : [];
  let crees = 0;
  let majs = 0;
  let inchanges = 0;
  for (const m of plan.matchs) {
    const ex = lignes.find((l) => l.round === m.round && l.position === m.position);
    if (!ex) {
      crees++;
      if (ecrire && tournamentId) {
        const { error } = await sb.from('tn_matches').insert({
          tournament_id: tournamentId,
          external_id: m.externalId,
          round: m.round,
          round_order: m.roundOrder,
          position: m.position,
          half: m.half,
          player1_id: m.player1Id,
          player2_id: m.player2Id,
          status: 'scheduled',
          sets: [],
        });
        if (error) throw new Error(`tn_matches (création ${m.round}|${m.position}) : ${error.message}`);
      }
      continue;
    }
    const joueursDuPlan = m.player1Id !== null && m.player2Id !== null;
    const different = ex.player1_id !== m.player1Id || ex.player2_id !== m.player2Id;
    if (ex.winner_id === null && joueursDuPlan && different) {
      majs++;
      if (ecrire && tournamentId) {
        const { error } = await sb
          .from('tn_matches')
          .update({ player1_id: m.player1Id, player2_id: m.player2Id })
          .eq('tournament_id', tournamentId)
          .eq('round', m.round)
          .eq('position', m.position)
          .is('winner_id', null);
        if (error) throw new Error(`tn_matches (mise à jour ${m.round}|${m.position}) : ${error.message}`);
      }
    } else inchanges++;
  }
  let lien: ResumeImportDavis['lien'] = null;
  if (gt && ecrire && tournamentId) {
    const r = await ecrireLienGT(sb, tournamentId, gt);
    lien = r.ok ? (r.cree ? 'pose' : 'dejaPose') : r.erreur;
  }
  return { tournamentId, tournoiCree, nationsCreees: aCreer.length, matchsCrees: crees, matchsMisAJour: majs, matchsInchanges: inchanges, lien, ecrit: ecrire };
}
