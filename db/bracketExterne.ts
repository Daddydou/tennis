import 'server-only';
import { exigerSession } from '@/auth/garde';
import { bracketThomas } from '@/externe/thomasClient';
import { supabaseAdmin } from './server';
import { ecrireBracketExterne, type ResumeSynchro } from './bracketExterneEcriture';

/**
 * Synchronise un tournoi de l'app bracket de Thomas, depuis l'APP : session
 * exigée, puis écriture en service role — la règle du repo pour toute
 * écriture. Aucun écran ne l'appelle encore ; le déclenchement actuel est le
 * script manuel scripts/sync-bracket-thomas.mts (hors Next, donc sans
 * session : il construit son propre client service role, comme les autres
 * scripts d'écriture).
 */
export async function synchroniserBracketExterne(tournoiId: string): Promise<ResumeSynchro> {
  await exigerSession();
  const bracket = await bracketThomas(tournoiId);
  return ecrireBracketExterne(supabaseAdmin(), bracket);
}
