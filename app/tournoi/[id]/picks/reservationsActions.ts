'use server';

import { sessionValide } from '@/auth/garde';
import { supabaseAdmin } from '@/db/server';

export interface ReservationsResult {
  ok: boolean;
  error?: string;
}

export interface Reservation {
  round: string;
  half: 'top' | 'bottom' | null;
  playerId: string;
}

const REFUS: ReservationsResult = { ok: false, error: 'Non authentifié.' };

/** Au-delà, ce n'est plus un plan de 12 picks : on refuse sans écrire. */
const MAX_RESERVATIONS = 16;

/**
 * Remplace TOUTES les réservations d'un stock sur un tournoi par celles de
 * l'écran (tn_plan_reservations, migration 0029). Les réservations ne sont
 * pas des picks : rien n'est compté, rien n'est envoyé à Game Tracker. Elles
 * vivent en base pour que l'app fasse foi sur tous les appareils.
 *
 * Remplacement complet plutôt que ligne à ligne : l'écran déplace souvent un
 * joueur d'un slot à l'autre, ce qui violerait temporairement l'unicité.
 *
 * @param participantId null = mes réservations ; sinon celles d'un participant.
 */
export async function enregistrerReservations(
  tournamentId: string,
  participantId: string | null,
  reservations: Reservation[],
): Promise<ReservationsResult> {
  if (!(await sessionValide())) return REFUS;

  // Contrôles avant toute écriture : forme, doublons (joueur ou slot).
  if (!Array.isArray(reservations) || reservations.length > MAX_RESERVATIONS) {
    return { ok: false, error: 'Réservations invalides.' };
  }
  const joueurs = new Set<string>();
  const slots = new Set<string>();
  for (const r of reservations) {
    if (
      typeof r?.round !== 'string' ||
      typeof r.playerId !== 'string' ||
      !(r.half === null || r.half === 'top' || r.half === 'bottom')
    ) {
      return { ok: false, error: 'Réservations invalides.' };
    }
    const slot = `${r.round}|${r.half ?? ''}`;
    if (joueurs.has(r.playerId) || slots.has(slot)) {
      return { ok: false, error: 'Un joueur ou un pick réservé deux fois.' };
    }
    joueurs.add(r.playerId);
    slots.add(slot);
  }

  const sb = supabaseAdmin();

  let del = sb.from('tn_plan_reservations').delete().eq('tournament_id', tournamentId);
  del = participantId === null ? del.is('participant_id', null) : del.eq('participant_id', participantId);
  const { error: eDel } = await del;
  if (eDel) return { ok: false, error: eDel.message };

  if (reservations.length > 0) {
    const { error } = await sb.from('tn_plan_reservations').insert(
      reservations.map((r) => ({
        tournament_id: tournamentId,
        participant_id: participantId,
        round: r.round,
        half: r.half,
        player_id: r.playerId,
      })),
    );
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}
