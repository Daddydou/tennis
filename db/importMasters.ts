import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanMasters } from '@/lib/mastersImport';

/**
 * Écriture d'un tournoi Masters (plan construit par lib/mastersImport.ts).
 *
 * IDEMPOTENT et PRUDENT : on peut relancer l'import sans rien dupliquer, et on ne touche JAMAIS à un
 * résultat (vainqueur, sets, statut) :
 *   - tournoi : créé s'il n'existe pas (clé : external_id + circuit + année) ; sinon laissé tel quel ;
 *   - match absent : créé (« scheduled », sans score) ;
 *   - match présent sans vainqueur : seuls ses joueurs sont mis à jour (si le plan en a et qu'ils diffèrent) ;
 *   - match présent avec vainqueur : jamais modifié.
 */

export interface ResumeImportMasters {
  tournamentId: string | null;
  tournoiCree: boolean;
  matchsCrees: number;
  matchsMisAJour: number;
  matchsInchanges: number;
  ecrit: boolean;
}

async function lire<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>, quoi: string): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(`${quoi} : ${error.message}`);
  return data as T;
}

export async function ecrireMasters(sb: SupabaseClient, plan: PlanMasters, debut: string | null, ecrire: boolean): Promise<ResumeImportMasters> {
  const t = plan.tournoi;
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
          start_date: debut,
          status: 'upcoming',
          rounds: t.rounds,
        })
        .select('id')
        .single(),
      'tn_tournaments (création)',
    );
    tournamentId = cree.id;
  }

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
  return { tournamentId, tournoiCree, matchsCrees: crees, matchsMisAJour: majs, matchsInchanges: inchanges, ecrit: ecrire };
}
