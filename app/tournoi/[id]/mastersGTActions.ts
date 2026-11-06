'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { alignerPicksMasters, idGameTrackerDuTournoi, type ResumeAlignementMasters } from '@/db/mastersGT';
import { supabaseAdmin } from '@/db/server';
import { etatPicksGT, poserPicksGT } from '@/externe/gameTrackerPicksClient';
import type { EtatGT } from '@/lib/gameTrackerPicks';
import {
  picksDepuisGT,
  positionsGT,
  preparerEnvoiMasters,
  roundDeTourGT,
  type PreparationEnvoiMasters,
  type Souhait,
} from '@/lib/mastersGT';

/**
 * PICKS D'UN MASTERS <-> GAME TRACKER, depuis l'écran du tournoi. Trois actions, TOUJOURS protégées par la session :
 *  - lire : lit Game Tracker et recopie ses picks chez nous (Game Tracker fait foi) ;
 *  - preparer : calcule ce qui serait envoyé pour un tour (aucune écriture) ;
 *  - envoyer : pose le pick d'un tour chez Game Tracker, sur clic, après vérification.
 * Rien ne part tout seul. La clé GAMETRACKER_PICKS_KEY ne quitte jamais le serveur.
 */

const REFUS = { ok: false as const, erreur: 'Session expirée : reconnecte-toi.' };

export interface TourMastersGT {
  numero: number;
  nom: string;
  round: string;
  lockAt: string | null;
  picksAttendus: number;
  /** Mes picks actuels chez Game Tracker (noms). */
  haut: string | null;
  bas: string | null;
}

export type LectureMasters =
  | {
      ok: true;
      tours: TourMastersGT[];
      classement: { pseudo: string; moi: boolean; points: number; rang: number | null }[];
      alignement: ResumeAlignementMasters;
    }
  | { ok: false; erreur: string };

async function contexte(tournamentId: string) {
  const sb = supabaseAdmin();
  const gtId = await idGameTrackerDuTournoi(sb, tournamentId);
  if (!gtId) throw new Error('Ce tournoi n\'est pas relié à Game Tracker.');
  const { data: matchs, error } = await sb.from('tn_matches').select('player1_id, player2_id').eq('tournament_id', tournamentId);
  if (error) throw new Error(`tn_matches : ${error.message}`);
  const ids = [...new Set((matchs ?? []).flatMap((m) => [m.player1_id, m.player2_id]).filter((x): x is string => !!x))];
  const { data: lignes, error: e2 } = ids.length ? await sb.from('tn_players').select('id, name').in('id', ids) : { data: [], error: null };
  if (e2) throw new Error(`tn_players : ${e2.message}`);
  const joueurs = (lignes ?? []) as { id: string; name: string }[];
  const nomDe = (id: string) => joueurs.find((j) => j.id === id)?.name ?? id;
  return { sb, gtId, joueurs, nomDe };
}

const nomPick = (p: { prenom: string | null; nom: string | null } | null) => (p ? `${p.prenom ?? ''} ${p.nom ?? ''}`.trim() : null);

async function lireEtMiroiter(tournamentId: string, c: Awaited<ReturnType<typeof contexte>>, etat: EtatGT): Promise<LectureMasters> {
  const positions = positionsGT(etat, c.joueurs);
  if (positions.erreurs.length) return { ok: false, erreur: positions.erreurs.join(' ') };
  const { picks, erreurs } = picksDepuisGT(etat, positions, c.joueurs);
  if (erreurs.length) return { ok: false, erreur: erreurs.join(' ') };
  const tours = [etat.tourOuvert, ...etat.toursAVenir].filter((t) => t !== null);
  const toursMoi = tours.map((t) => roundDeTourGT(t.numero)).filter((r): r is NonNullable<typeof r> => r !== null);
  const alignement = await alignerPicksMasters(c.sb, tournamentId, picks, toursMoi);
  if (alignement.ecrits + alignement.supprimes > 0) revalidatePath(`/tournoi/${tournamentId}`, 'layout');
  return {
    ok: true,
    tours: tours.map((t) => ({
      numero: t.numero,
      nom: t.nom,
      round: roundDeTourGT(t.numero) ?? '',
      lockAt: t.lockAt,
      picksAttendus: t.picksAttendus,
      haut: nomPick(t.monPick.haut),
      bas: nomPick(t.monPick.bas),
    })),
    classement: etat.classement,
    alignement,
  };
}

export async function lireGameTrackerMasters(tournamentId: string): Promise<LectureMasters> {
  if (!(await sessionValide())) return REFUS;
  try {
    const c = await contexte(tournamentId);
    return await lireEtMiroiter(tournamentId, c, await etatPicksGT(c.gtId));
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}

export async function preparerGameTrackerMasters(
  tournamentId: string,
  numeroTour: number,
  souhaits: Souhait[],
): Promise<PreparationEnvoiMasters | { ok: false; raisons: string[] }> {
  if (!(await sessionValide())) return { ok: false, raisons: [REFUS.erreur] };
  try {
    const c = await contexte(tournamentId);
    const etat = await etatPicksGT(c.gtId);
    const positions = positionsGT(etat, c.joueurs);
    if (positions.erreurs.length) return { ok: false, raisons: positions.erreurs };
    return preparerEnvoiMasters({ etat, numeroTour, souhaits, positions, nomDe: c.nomDe });
  } catch (e) {
    return { ok: false, raisons: [(e as Error).message] };
  }
}

export type ResultatEnvoiMasters = { ok: true; message: string; lecture: LectureMasters } | { ok: false; raisons: string[] };

export async function envoyerGameTrackerMasters(
  tournamentId: string,
  numeroTour: number,
  souhaits: Souhait[],
  attendu: { haut: number | null; bas: number | null },
): Promise<ResultatEnvoiMasters> {
  if (!(await sessionValide())) return { ok: false, raisons: [REFUS.erreur] };
  try {
    const c = await contexte(tournamentId);
    const etat = await etatPicksGT(c.gtId);
    const positions = positionsGT(etat, c.joueurs);
    if (positions.erreurs.length) return { ok: false, raisons: positions.erreurs };
    const prep = preparerEnvoiMasters({ etat, numeroTour, souhaits, positions, nomDe: c.nomDe });
    if (!prep.ok) return { ok: false, raisons: prep.raisons };
    // Ce que tu as vu doit être ce qui part : si Game Tracker a changé entre-temps, on s'arrête.
    if (prep.haut !== attendu.haut || prep.bas !== attendu.bas) {
      return { ok: false, raisons: ['Game Tracker a changé depuis la vérification : revérifie avant d\'envoyer.'] };
    }
    if (prep.dejaAJour) {
      return { ok: true, message: `${prep.nomTour} : Game Tracker a déjà ces picks, rien à envoyer.`, lecture: await lireEtMiroiter(tournamentId, c, etat) };
    }
    const r = await poserPicksGT(c.gtId, numeroTour, prep.haut, prep.bas);
    if (!r.enregistre) return { ok: false, raisons: [r.erreur ?? 'Game Tracker a refusé le pick (sans précision).'] };
    // Relecture : on ne dit « envoyé » que si Game Tracker confirme les positions posées.
    const apres = await etatPicksGT(c.gtId);
    const reel = [apres.tourOuvert, ...apres.toursAVenir].find((t) => t?.numero === numeroTour);
    const unique = reel?.picksAttendus === 1;
    const conforme = (reel?.monPick.haut?.position ?? null) === prep.haut && (unique || (reel?.monPick.bas?.position ?? null) === prep.bas);
    const lecture = await lireEtMiroiter(tournamentId, c, apres);
    if (!conforme) {
      return { ok: false, raisons: ['Game Tracker a accepté l\'envoi mais montre un autre pick (redirection d\'une joueuse en attente ?) : vérifie ci-dessous.'] };
    }
    return { ok: true, message: `${prep.nomTour} : picks posés chez Game Tracker.`, lecture };
  } catch (e) {
    return { ok: false, raisons: [(e as Error).message] };
  }
}
