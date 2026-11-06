'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { enregistrerPronostic } from '@/db/mastersPronostic';
import { supabaseAdmin } from '@/db/server';
import { validerPronostic, type PronosticMasters } from '@/lib/masters';
import { pronosticFerme } from '@/lib/mastersPronostic';
import { vueMasters } from '@/lib/mastersVue';

/**
 * Enregistre le pronostic d'un participant à un Masters (moi, ou un autre dont on saisit le pronostic à la main).
 * Refusé si le pronostic est fermé (premier match du tournoi commencé ou heure passée), s'il est incohérent
 * (classements qui ne sont pas les 4 joueurs de la poule, vainqueur de demie hors de sa demie, championne qui
 * n'est pas finaliste), ou si le participant est inconnu. Protégé par la session.
 */

export type ResultatPronostic = { ok: true } | { ok: false; erreurs: string[] };

export async function enregistrerPronosticMasters(tournamentId: string, participantId: string | null, pronostic: PronosticMasters): Promise<ResultatPronostic> {
  if (!(await sessionValide())) return { ok: false, erreurs: ['Session expirée : reconnecte-toi.'] };
  try {
    const sb = supabaseAdmin();
    const { data: rows, error } = await sb
      .from('tn_matches')
      .select('round, position, half, player1_id, player2_id, winner_id, status, sets, scheduled_at')
      .eq('tournament_id', tournamentId);
    if (error) throw new Error(`tn_matches : ${error.message}`);
    const lignes = (rows ?? []).map((r) => ({
      round: r.round as string,
      position: r.position as number | null,
      half: r.half as 'top' | 'bottom' | null,
      player1Id: r.player1_id as string | null,
      player2Id: r.player2_id as string | null,
      winnerId: r.winner_id as string | null,
      status: r.status as string,
      sets: r.sets as { g1: number | null; g2: number | null }[] | null,
    }));
    if (pronosticFerme(lignes.map((l, i) => ({ status: l.status, scheduledAt: (rows ?? [])[i].scheduled_at as string | null })), new Date())) {
      return { ok: false, erreurs: ['Le pronostic est fermé : le premier match du tournoi est lancé.'] };
    }
    const vue = vueMasters(lignes);
    const poules = { A: vue.poules.A.joueurs, B: vue.poules.B.joueurs };
    if (poules.A.length !== 4 || poules.B.length !== 4) return { ok: false, erreurs: ['Les poules du tournoi ne sont pas complètes.'] };
    const erreurs = validerPronostic(pronostic, poules);
    if (erreurs.length) return { ok: false, erreurs };
    if (participantId !== null) {
      const { data: p } = await sb.from('tn_participants').select('id').eq('id', participantId).maybeSingle();
      if (!p) return { ok: false, erreurs: ['Participant inconnu.'] };
    }
    await enregistrerPronostic(sb, tournamentId, participantId, pronostic, participantId === null ? 'app' : 'manuel');
    revalidatePath(`/tournoi/${tournamentId}`, 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, erreurs: [(e as Error).message] };
  }
}
