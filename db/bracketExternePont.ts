import type { SupabaseClient } from '@supabase/supabase-js';
import type { BracketThomas } from '@/lib/thomasApi';
import {
  deriverPronostics,
  planifierEcriture,
  type Ecart,
  type MatchInterne,
  type PronosticExistant,
} from '@/lib/bracketExternePont';

/**
 * PONT BRACKET DE THOMAS -> tn_bracket_round_picks (lib/bracketExternePont.ts).
 *
 * Appelé par scripts/sync-bracket-thomas.mts APRÈS la synchro des tables
 * tn_bracket_externe_*. Clients Supabase INJECTÉS, comme
 * db/bracketExterneEcriture.ts : `lecture` peut être la clé publique (RLS =
 * select), `ecriture` la service role — ou null pour un aperçu.
 *
 * N'écrit RIEN si :
 *   - tn_bracket_externe_tournois.tournament_id_interne est NULL (lien posé à
 *     la main, jamais deviné) ;
 *   - le tournoi n'est pas verrouillé chez Thomas (aucun pronostic visible) ;
 *   - les tableaux ne se superposent pas (tours ou joueurs) : refus en bloc.
 * Sinon : insertions sur les emplacements vides, écarts signalés et jamais
 * écrasés sauf `ecraser`, JAMAIS de suppression. Rejouer ne change rien.
 */

export type ResumePont =
  | { statut: 'sans_lien' | 'non_verrouille'; message: string }
  | { statut: 'refuse'; message: string; erreurs: string[] }
  | {
      statut: 'ok';
      tournamentId: string;
      ecrit: boolean;
      inseres: number;
      modifies: number;
      identiques: number;
      ecarts: (Ecart & { stock: string; nomInterne: string; nomThomas: string })[];
      pseudosInconnus: string[];
      sansPronostic: number;
    };

async function lire<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>, quoi: string): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(`${quoi} : ${error.message}`);
  return data as T;
}

export async function pontVersRoundPicks(
  lecture: SupabaseClient,
  ecriture: SupabaseClient | null,
  b: BracketThomas,
  options: { ecraser?: boolean; tournamentIdInterne?: string } = {},
): Promise<ResumePont> {
  let interne = options.tournamentIdInterne ?? null;
  if (!interne) {
    const lien = await lire<{ tournament_id_interne: string | null } | null>(
      lecture.from('tn_bracket_externe_tournois').select('tournament_id_interne').eq('id', b.tournoi.id).maybeSingle(),
      'tn_bracket_externe_tournois',
    );
    interne = lien?.tournament_id_interne ?? null;
  }
  if (!interne) {
    return {
      statut: 'sans_lien',
      message: `tournament_id_interne non renseigné pour ${b.tournoi.id} : pronostics non reportés dans le Simulateur.`,
    };
  }
  if (!b.tournoi.verrouille) {
    return { statut: 'non_verrouille', message: 'Tournoi pas encore verrouillé chez Thomas : aucun pronostic à reporter.' };
  }

  const tournoi = await lire<{ rounds: string[] | null } | null>(
    lecture.from('tn_tournaments').select('rounds').eq('id', interne).maybeSingle(),
    'tn_tournaments',
  );
  if (!tournoi) return { statut: 'refuse', message: `Tournoi interne ${interne} introuvable.`, erreurs: [] };
  const rounds = tournoi.rounds ?? [];

  const [matchs, participants, existants] = await Promise.all([
    lire<{ round: string; position: number | null; player1_id: string | null; player2_id: string | null }[]>(
      lecture.from('tn_matches').select('round, position, player1_id, player2_id').eq('tournament_id', interne),
      'tn_matches',
    ),
    lire<{ id: string; name: string }[]>(lecture.from('tn_participants').select('id, name'), 'tn_participants'),
    lire<{ id: string; participant_id: string | null; round: string; position: number; player_id: string }[]>(
      lecture
        .from('tn_bracket_round_picks')
        .select('id, participant_id, round, position, player_id')
        .eq('tournament_id', interne),
      'tn_bracket_round_picks',
    ),
  ]);

  const matchsInternes: MatchInterne[] = matchs
    .filter((m) => m.position !== null)
    .map((m) => ({ round: m.round, position: m.position as number, player1Id: m.player1_id, player2Id: m.player2_id }));
  const ids = [...new Set(matchsInternes.flatMap((m) => [m.player1Id, m.player2Id]).filter((x): x is string => x !== null))];
  const joueurs = ids.length
    ? await lire<{ id: string; name: string }[]>(lecture.from('tn_players').select('id, name').in('id', ids), 'tn_players')
    : [];
  const noms = new Map(joueurs.map((j) => [j.id, j.name]));

  const derivation = deriverPronostics(b, rounds, matchsInternes, noms, participants);
  if (!derivation.ok) {
    return {
      statut: 'refuse',
      message: 'Tableaux non superposables : rien n’a été reporté dans le Simulateur.',
      erreurs: derivation.erreurs,
    };
  }

  const plan = planifierEcriture(
    derivation.pronostics,
    existants.map(
      (e): PronosticExistant => ({ id: e.id, participantId: e.participant_id, round: e.round, position: e.position, playerId: e.player_id }),
    ),
    options.ecraser ?? false,
  );

  if (ecriture) {
    if (plan.aInserer.length) {
      const { error } = await ecriture.from('tn_bracket_round_picks').insert(
        plan.aInserer.map((p) => ({
          tournament_id: interne,
          participant_id: p.participantId,
          round: p.round,
          position: p.position,
          player_id: p.playerId,
        })),
      );
      if (error) throw new Error(`tn_bracket_round_picks (insertion) : ${error.message}`);
    }
    for (const m of plan.aModifier) {
      const { error } = await ecriture.from('tn_bracket_round_picks').update({ player_id: m.playerId }).eq('id', m.id);
      if (error) throw new Error(`tn_bracket_round_picks (mise à jour) : ${error.message}`);
    }
  }

  const nomStock = (id: string | null) => (id === null ? 'Moi' : participants.find((p) => p.id === id)?.name ?? id);
  return {
    statut: 'ok',
    tournamentId: interne,
    ecrit: ecriture !== null,
    inseres: plan.aInserer.length,
    modifies: plan.aModifier.length,
    identiques: plan.identiques,
    ecarts: plan.ecarts.map((e) => ({
      ...e,
      stock: nomStock(e.participantId),
      nomInterne: noms.get(e.interne) ?? e.interne,
      nomThomas: noms.get(e.thomas) ?? e.thomas,
    })),
    pseudosInconnus: derivation.pseudosInconnus,
    sansPronostic: derivation.sansPronostic,
  };
}
