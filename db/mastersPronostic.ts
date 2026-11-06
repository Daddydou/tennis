import type { SupabaseClient } from '@supabase/supabase-js';
import type { PronosticMasters } from '@/lib/masters';

/**
 * Pronostics d'un Masters (table tn_masters_pronostics, migration 0032) : un par participant et par
 * tournoi (participant null = moi). Lecture tolérante : si la table n'existe pas encore, aucun pronostic.
 */

export interface PronosticStocke {
  participantId: string | null;
  pronostic: PronosticMasters;
  source: string;
  updatedAt: string;
}

interface LignePronostic {
  participant_id: string | null;
  classement_a: string[];
  classement_b: string[];
  vainqueur_demi1: string;
  vainqueur_demi2: string;
  champion: string;
  source: string;
  updated_at: string;
}

export async function lirePronostics(sb: SupabaseClient, tournamentId: string): Promise<PronosticStocke[]> {
  const { data, error } = await sb
    .from('tn_masters_pronostics')
    .select('participant_id, classement_a, classement_b, vainqueur_demi1, vainqueur_demi2, champion, source, updated_at')
    .eq('tournament_id', tournamentId);
  if (error) {
    // 42P01 / PGRST205 : table pas encore créée.
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    throw new Error(`tn_masters_pronostics : ${error.message}`);
  }
  return ((data ?? []) as LignePronostic[]).map((r) => ({
    participantId: r.participant_id,
    pronostic: { classementA: r.classement_a, classementB: r.classement_b, vainqueursDemis: [r.vainqueur_demi1, r.vainqueur_demi2], champion: r.champion },
    source: r.source,
    updatedAt: r.updated_at,
  }));
}

/** Remplace le pronostic d'un participant (il n'y en a qu'un par tournoi). */
export async function enregistrerPronostic(
  sb: SupabaseClient,
  tournamentId: string,
  participantId: string | null,
  p: PronosticMasters,
  source: 'app' | 'thomas' | 'manuel',
): Promise<void> {
  let del = sb.from('tn_masters_pronostics').delete().eq('tournament_id', tournamentId);
  del = participantId === null ? del.is('participant_id', null) : del.eq('participant_id', participantId);
  const { error: e1 } = await del;
  if (e1) throw new Error(`tn_masters_pronostics (remplacement) : ${e1.message}`);
  const { error: e2 } = await sb.from('tn_masters_pronostics').insert({
    tournament_id: tournamentId,
    participant_id: participantId,
    classement_a: p.classementA,
    classement_b: p.classementB,
    vainqueur_demi1: p.vainqueursDemis[0],
    vainqueur_demi2: p.vainqueursDemis[1],
    champion: p.champion,
    source,
  });
  if (e2) throw new Error(`tn_masters_pronostics (ajout) : ${e2.message}`);
}
