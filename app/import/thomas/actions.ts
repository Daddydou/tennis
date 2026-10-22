'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { bracketThomas } from '@/externe/thomasClient';
import { supabaseAdmin } from '@/db/server';
import { supabaseAnon } from '@/db/anon';
import { BracketIncoherent, ecrireBracketExterne, preparerSynchro, type ResumeSynchro } from '@/db/bracketExterneEcriture';
import { pontVersRoundPicks, type ResumePont } from '@/db/bracketExternePont';

/**
 * Synchro du bracket de Thomas DEPUIS L'APP — même travail que
 * `npm run sync:bracket-thomas -- --tournoi=<id> [--apercu] [--ecraser]`
 * (scripts/sync-bracket-thomas.mts), sans terminal : session exigée, écriture
 * en service role. API de Thomas en lecture seule, comme le script.
 *
 * Le lien vers notre tournoi (tournament_id_interne), posé jusqu'ici à la
 * main en SQL, peut être choisi dans l'écran : il n'est écrit qu'avec une
 * vraie synchro (jamais en aperçu, où il ne sert qu'à prévisualiser le pont).
 */

export type ResultatSynchroThomas =
  | { ok: true; ecrit: boolean; resume: ResumeSynchro; pont: ResumePont }
  | { ok: false; erreur: string; details?: string[] };

const ID_THOMAS = /^[A-Za-z0-9_-]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function synchroniserThomas(
  idThomas: string,
  options: { apercu: boolean; ecraser: boolean; interne: string | null },
): Promise<ResultatSynchroThomas> {
  // Server Action = POST : la garde de session est ici, pas dans le proxy.
  if (!(await sessionValide())) return { ok: false, erreur: 'Non authentifié.' };
  if (!ID_THOMAS.test(idThomas)) return { ok: false, erreur: 'Identifiant de tournoi invalide.' };
  if (options.interne !== null && !UUID.test(options.interne)) return { ok: false, erreur: 'Tournoi interne invalide.' };

  try {
    const bracket = await bracketThomas(idThomas);
    if (options.apercu) {
      const resume = preparerSynchro(bracket).resume;
      const pont = await pontVersRoundPicks(supabaseAnon(), null, bracket, {
        ecraser: options.ecraser,
        tournamentIdInterne: options.interne ?? undefined,
      });
      return { ok: true, ecrit: false, resume, pont };
    }

    const sb = supabaseAdmin();
    const resume = await ecrireBracketExterne(sb, bracket);
    if (options.interne) {
      const { error } = await sb
        .from('tn_bracket_externe_tournois')
        .update({ tournament_id_interne: options.interne })
        .eq('id', bracket.tournoi.id);
      if (error) return { ok: false, erreur: `Lien vers le tournoi : ${error.message}` };
    }
    const pont = await pontVersRoundPicks(sb, sb, bracket, { ecraser: options.ecraser });
    revalidatePath('/import/thomas');
    if (pont.statut === 'ok') revalidatePath(`/tournoi/${pont.tournamentId}/simulateur`);
    return { ok: true, ecrit: true, resume, pont };
  } catch (e) {
    if (e instanceof BracketIncoherent) return { ok: false, erreur: e.message, details: e.erreurs.slice(0, 30) };
    // Messages déjà sûrs (jamais de clé) : ErreurApiThomas, ErreurFormatThomas, erreurs Supabase.
    return { ok: false, erreur: (e as Error).message };
  }
}
