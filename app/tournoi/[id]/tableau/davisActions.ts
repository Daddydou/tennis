'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { recalculerPoints } from '@/db/points';
import { supabaseAdmin } from '@/db/server';
import { TOURS_DAVIS, STATUTS_MATCH_DAVIS, type TourDavis } from '@/lib/davis';
import { construireResultat, estDavis, type SaisieMatch } from '@/lib/davisRencontre';

/**
 * Saisie du résultat d'une rencontre de la Coupe Davis (tournoi aux tours QF, SF, F).
 *
 * Une rencontre est une ligne de tn_matches ; ses matchs (simple 1, simple 2, double) sont rangés dans `sets`
 * (lib/davisRencontre.ts). Écriture en service role APRÈS la garde de session. Le vainqueur avance dans la
 * rencontre suivante (place vide ou remplacée), puis les points des picks sont recalculés (tn_score_davis).
 * Refus si la rencontre suivante est déjà commencée : on ne change pas ses nations sous ses pieds.
 */

export type ResultatSaisieDavis = { ok: true; message: string } | { ok: false; erreur: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFUS: ResultatSaisieDavis = { ok: false, erreur: 'Non authentifié.' };
const RANG_STATUT: Record<string, number> = { upcoming: 0, running: 1, completed: 2 };

interface LigneRencontre {
  round: string;
  position: number | null;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  status: string | null;
  sets: unknown;
}

function saisieValide(x: unknown): x is SaisieMatch[] {
  if (!Array.isArray(x) || x.length > 3) return false;
  return x.every((s) => {
    const m = s as Partial<SaisieMatch> | null;
    return (
      !!m &&
      (m.ordre === 1 || m.ordre === 2 || m.ordre === 3) &&
      typeof m.statut === 'string' &&
      (STATUTS_MATCH_DAVIS as readonly string[]).includes(m.statut) &&
      (m.gagnant === 1 || m.gagnant === 2 || m.gagnant === null) &&
      typeof m.score === 'string' &&
      m.score.length <= 60
    );
  });
}

export async function enregistrerRencontreDavis(
  tournamentId: string,
  round: string,
  position: number,
  saisie: SaisieMatch[],
): Promise<ResultatSaisieDavis> {
  if (!(await sessionValide())) return REFUS;
  if (!UUID.test(tournamentId)) return { ok: false, erreur: 'Tournoi invalide.' };
  if (!(TOURS_DAVIS as readonly string[]).includes(round) || !Number.isInteger(position) || position < 0 || position > 3) {
    return { ok: false, erreur: 'Rencontre invalide.' };
  }
  if (!saisieValide(saisie)) return { ok: false, erreur: 'Saisie invalide.' };

  try {
    const sb = supabaseAdmin();
    const [{ data: tournoi, error: e1 }, { data: lignes, error: e2 }] = await Promise.all([
      sb.from('tn_tournaments').select('rounds, status').eq('id', tournamentId).maybeSingle(),
      sb.from('tn_matches').select('round, position, player1_id, player2_id, winner_id, status, sets').eq('tournament_id', tournamentId),
    ]);
    if (e1) throw new Error(`tn_tournaments : ${e1.message}`);
    if (e2) throw new Error(`tn_matches : ${e2.message}`);
    if (!tournoi || !estDavis(tournoi.rounds)) return { ok: false, erreur: 'Ce tournoi n’est pas une Coupe Davis.' };
    const matchs = (lignes ?? []) as LigneRencontre[];
    const cible = matchs.find((m) => m.round === round && m.position === position);
    if (!cible) return { ok: false, erreur: 'Rencontre introuvable.' };
    if (!cible.player1_id || !cible.player2_id) return { ok: false, erreur: 'Les deux nations ne sont pas encore connues.' };

    const r = construireResultat(saisie);
    if (!r.ok) return { ok: false, erreur: r.erreurs.join(' ') };
    const winnerId = r.gagnant === 1 ? cible.player1_id : r.gagnant === 2 ? cible.player2_id : null;

    // Rencontre suivante : la nation qui avance y prend la place (côté 1 si la position est paire).
    const idx = TOURS_DAVIS.indexOf(round as TourDavis);
    const roundSuivant = TOURS_DAVIS[idx + 1] ?? null;
    const suivant = roundSuivant ? matchs.find((m) => m.round === roundSuivant && m.position === Math.floor(position / 2)) : undefined;
    const colonne = position % 2 === 0 ? 'player1_id' : 'player2_id';
    const changeLeVainqueur = winnerId !== cible.winner_id;
    if (suivant && changeLeVainqueur) {
      const commence = suivant.winner_id !== null || (suivant.status !== null && suivant.status !== 'scheduled') || (Array.isArray(suivant.sets) && suivant.sets.length > 0);
      if (commence) return { ok: false, erreur: 'La rencontre suivante est déjà commencée : corrige-la d’abord.' };
    }

    const { error: e3 } = await sb
      .from('tn_matches')
      .update({ sets: r.stockage, winner_id: winnerId, status: r.statut, updated_at: new Date().toISOString() })
      .eq('tournament_id', tournamentId)
      .eq('round', round)
      .eq('position', position);
    if (e3) throw new Error(`tn_matches : ${e3.message}`);

    if (suivant && changeLeVainqueur) {
      const { error: e4 } = await sb
        .from('tn_matches')
        .update({ [colonne]: winnerId })
        .eq('tournament_id', tournamentId)
        .eq('round', roundSuivant!)
        .eq('position', Math.floor(position / 2));
      if (e4) throw new Error(`tn_matches (rencontre suivante) : ${e4.message}`);
    }

    // Statut du tournoi : on avance (upcoming -> running -> completed), on ne recule jamais.
    const nouveau = round === 'F' && r.gagnant !== null ? 'completed' : r.statut === 'scheduled' ? null : 'running';
    if (nouveau && (RANG_STATUT[nouveau] ?? 0) > (RANG_STATUT[tournoi.status ?? 'upcoming'] ?? 0)) {
      const { error: e5 } = await sb.from('tn_tournaments').update({ status: nouveau }).eq('id', tournamentId);
      if (e5) throw new Error(`tn_tournaments (statut) : ${e5.message}`);
    }

    const calcul = await recalculerPoints(tournamentId);
    revalidatePath(`/tournoi/${tournamentId}`, 'layout');
    return {
      ok: true,
      message:
        (r.gagnant !== null ? `Rencontre décidée (${r.score}).` : 'Rencontre enregistrée, pas encore décidée.') +
        (calcul.ok ? ' Points des picks recalculés.' : ` Attention : recalcul des points impossible (${calcul.error}).`),
    };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
