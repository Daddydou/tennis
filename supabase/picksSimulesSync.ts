import 'server-only';
import { supabaseAdmin } from './server';
import type { Half } from '@/lib/types';

/**
 * Synchronise un vrai pick tout juste validé (tn_picks) vers le bac à sable
 * du simulateur (tn_simulated_picks) — SENS UNIQUE, jamais l'inverse :
 * modifier un pick hypothétique (picksActions.ts) n'écrit jamais ici.
 *
 * Appelée depuis `validerPick` (app/tournoi/[id]/picks/actions.ts) juste
 * après la vraie écriture, pour CE tour et CETTE moitié uniquement — les
 * autres tours/moitiés, sans vrai pick, restent librement éditables côté
 * Picks hypothétiques. Le choix hypothétique déjà présent sur ce slot est
 * écrasé sans confirmation (même règle d'unicité par joueur que
 * `validerPickSimule` : si ce joueur était déjà pické ailleurs dans le
 * bac à sable de ce stock, cette ancienne ligne est libérée d'abord).
 *
 * Ne lève jamais : un échec de synchronisation ne doit pas faire échouer la
 * validation du vrai pick qui l'a déclenchée (même convention que
 * `recalculerPoints`, supabase/points.ts).
 */
export async function synchroniserPickSimuleDepuisReel(
  tournamentId: string,
  round: string,
  half: Half | null,
  playerId: string,
  participantId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = supabaseAdmin();

    let qConf = sb
      .from('tn_simulated_picks')
      .select('id, round, half')
      .eq('tournament_id', tournamentId)
      .eq('player_id', playerId);
    qConf =
      participantId === null ? qConf.is('participant_id', null) : qConf.eq('participant_id', participantId);
    const { data: existants, error: eConf } = await qConf;
    if (eConf) return { ok: false, error: eConf.message };

    const ailleurs = (existants ?? []).find(
      (c) => !(c.round === round && (c.half ?? null) === half),
    );
    if (ailleurs) {
      const { error: eDel } = await sb.from('tn_simulated_picks').delete().eq('id', ailleurs.id);
      if (eDel) return { ok: false, error: eDel.message };
    }

    let sel = sb
      .from('tn_simulated_picks')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('round', round);
    sel = half === null ? sel.is('half', null) : sel.eq('half', half);
    sel = participantId === null ? sel.is('participant_id', null) : sel.eq('participant_id', participantId);
    const { data: existant, error: eSel } = await sel.maybeSingle();
    if (eSel) return { ok: false, error: eSel.message };

    const payload = { tournament_id: tournamentId, participant_id: participantId, round, half, player_id: playerId };

    if (existant) {
      const { error } = await sb.from('tn_simulated_picks').update(payload).eq('id', existant.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await sb.from('tn_simulated_picks').insert(payload);
      if (error) return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
