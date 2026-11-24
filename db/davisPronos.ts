import { supabaseAnon } from './anon';
import type { LigneProno } from '@/lib/davisPronos';
import type { CodeNation } from '@/lib/davisEquipes';
import type { OrdreMatch, ScoreSets, TourDavis } from '@/lib/davis';

/**
 * Pronos de la Coupe Davis (table tn_davis_pronos, migration 0036) : pronos des matchs et score du bracket,
 * lus sur le site de Game Tracker puis enregistrés par l'onglet Pronos. LECTURE SEULE ici (clé anon, RLS
 * select) ; l'écriture se fait dans l'action serveur, après la garde de session.
 * Lecture tolérante : si la table n'existe pas encore, aucun prono.
 */

interface LigneBase {
  participant_id: string | null;
  round: string;
  match_position: number;
  jeu: 'match' | 'bracket';
  ordre: number | null;
  nation: string;
  sets: string;
}

export async function lireDavisPronos(tournamentId: string): Promise<LigneProno[]> {
  const { data, error } = await supabaseAnon()
    .from('tn_davis_pronos')
    .select('participant_id, round, match_position, jeu, ordre, nation, sets')
    .eq('tournament_id', tournamentId);
  if (error) {
    // 42P01 / PGRST205 : table pas encore créée.
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    throw new Error(`tn_davis_pronos : ${error.message}`);
  }
  return ((data ?? []) as LigneBase[]).map((r) => ({
    participantId: r.participant_id,
    round: r.round as TourDavis,
    matchPosition: r.match_position,
    jeu: r.jeu,
    ordre: r.ordre as OrdreMatch | null,
    nation: r.nation as CodeNation,
    sets: r.sets as ScoreSets,
  }));
}
