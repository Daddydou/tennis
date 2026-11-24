'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { getParticipants } from '@/db/lectures';
import { lireEtatDavis } from '@/db/davisConseils';
import { supabaseAdmin } from '@/db/server';
import { estDavis } from '@/lib/davisRencontre';
import {
  PSEUDOS_GT,
  lireTexteGT,
  resoudreBracket,
  resoudrePronos,
  type LigneProno,
  type PseudoGT,
  type RencontreTable,
} from '@/lib/davisPronos';

/**
 * Enregistre les pronos de la Coupe Davis lus dans le texte collé d'une page de Game Tracker (écran « Pronos »
 * ou « Bracket »). Game Tracker n'a pas d'API pour ces deux jeux : on ne fait que lire le texte donné par
 * l'utilisateur, jamais d'appel vers Game Tracker. Écriture en service role APRÈS la garde de session.
 *
 * Tout ou rien : à la moindre erreur de lecture ou de rattachement, rien n'est écrit. Sinon, pour chaque
 * (participant, rencontre, jeu) lu, les anciennes lignes sont remplacées par les nouvelles ; tout le reste
 * est laissé tel quel.
 */

export type ResultatImportPronos = { ok: true; message: string; details: string[] } | { ok: false; erreur: string; details: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAILLE_MAX = 60_000;

export async function importerPronosGT(tournamentId: string, texte: string, pseudoBracket: string | null): Promise<ResultatImportPronos> {
  if (!(await sessionValide())) return { ok: false, erreur: 'Non authentifié.', details: [] };
  if (!UUID.test(tournamentId)) return { ok: false, erreur: 'Tournoi invalide.', details: [] };
  if (typeof texte !== 'string' || texte.length > TAILLE_MAX) return { ok: false, erreur: 'Texte trop long ou illisible.', details: [] };

  try {
    const sb = supabaseAdmin();
    const { data: tournoi, error: e0 } = await sb.from('tn_tournaments').select('rounds').eq('id', tournamentId).maybeSingle();
    if (e0) throw new Error(`tn_tournaments : ${e0.message}`);
    if (!tournoi || !estDavis(tournoi.rounds)) return { ok: false, erreur: "Ce tournoi n'est pas une Coupe Davis.", details: [] };

    const [etat, participants] = await Promise.all([lireEtatDavis(tournamentId), getParticipants()]);
    const rencontres: RencontreTable[] = etat.rencontres.map((r) => ({ tour: r.tour, position: r.position, nation1: r.nation1, nation2: r.nation2 }));
    const gens = participants.map((p) => ({ id: p.id, name: p.name }));

    const lu = lireTexteGT(texte);
    if (lu.type === 'inconnu') return { ok: false, erreur: lu.erreur, details: [] };

    let lignes: LigneProno[];
    let erreurs: string[];
    let avertissements: string[];
    let resume: string[];
    if (lu.type === 'bracket') {
      if (!pseudoBracket || !(PSEUDOS_GT as readonly string[]).includes(pseudoBracket)) {
        return { ok: false, erreur: 'Choisis de qui est ce bracket (Moi, Laki ou Thomas).', details: [] };
      }
      ({ lignes, erreurs, avertissements, resume } = resoudreBracket(lu.bracket, pseudoBracket as PseudoGT, rencontres, gens));
    } else {
      ({ lignes, erreurs, avertissements, resume } = resoudrePronos(lu.pronos, rencontres, gens));
    }
    if (erreurs.length) return { ok: false, erreur: erreurs.join(' '), details: avertissements };
    if (lignes.length === 0) {
      return { ok: false, erreur: 'Rien à enregistrer : aucune rencontre de la page ne correspond à notre tableau.', details: avertissements };
    }

    // Remplacement : une suppression par (participant, rencontre, jeu) lu, puis une seule insertion.
    const groupes = new Map<string, LigneProno>();
    for (const l of lignes) groupes.set(`${l.participantId}|${l.round}|${l.matchPosition}|${l.jeu}`, l);
    for (const g of groupes.values()) {
      let del = sb.from('tn_davis_pronos').delete().eq('tournament_id', tournamentId).eq('round', g.round).eq('match_position', g.matchPosition).eq('jeu', g.jeu);
      del = g.participantId === null ? del.is('participant_id', null) : del.eq('participant_id', g.participantId);
      const { error } = await del;
      if (error) throw new Error(`tn_davis_pronos (remplacement) : ${error.message}`);
    }
    const { error: eIns } = await sb.from('tn_davis_pronos').insert(
      lignes.map((l) => ({
        tournament_id: tournamentId,
        participant_id: l.participantId,
        round: l.round,
        match_position: l.matchPosition,
        jeu: l.jeu,
        ordre: l.ordre,
        nation: l.nation,
        sets: l.sets,
      })),
    );
    if (eIns) throw new Error(`tn_davis_pronos : ${eIns.message}`);

    revalidatePath(`/tournoi/${tournamentId}`, 'layout');
    return {
      ok: true,
      message: `${lignes.length} prono${lignes.length > 1 ? 's' : ''} enregistré${lignes.length > 1 ? 's' : ''} (${lu.type === 'bracket' ? 'bracket' : 'pronos des matchs'}).`,
      details: [...resume, ...avertissements],
    };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message, details: [] };
  }
}
