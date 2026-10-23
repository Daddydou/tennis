'use server';

import { sessionValide } from '@/auth/garde';
import { supabaseAnon } from '@/db/anon';
import { chargerContexteLocalGT } from '@/db/gameTrackerPicks';
import { etatPicksGT, poserPicksGT } from '@/externe/gameTrackerPicksClient';
import {
  ecartsApresEnvoi,
  preparerEnvoi,
  type EcartApresEnvoi,
  type EtatGT,
  type PickGT,
  type PreparationEnvoi,
} from '@/lib/gameTrackerPicks';

/**
 * PICKS -> GAME TRACKER, depuis l'écran picks. Deux actions, TOUJOURS
 * déclenchées à la main :
 *   - `lireGameTracker`   : lecture seule (GET), montre ce qui serait envoyé ;
 *   - `envoyerGameTracker`: UN POST, au nom du joueur de la clé.
 *
 * Aucune de ces actions n'écrit dans NOTRE base : tout est lu avec la clé
 * publique (RLS = select). Le client ne fournit que l'identifiant du tournoi
 * (et, pour l'envoi, ce qu'il a vu à l'écran) : les positions sont TOUJOURS
 * recalculées ici, côté serveur, depuis nos picks.
 *
 * Server Action = POST : la garde de session est ici, pas dans le proxy.
 * Messages d'erreur sûrs : jamais de clé (cf. externe/gameTrackerPicksClient.ts).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFUS = { ok: false as const, erreur: 'Non authentifié.' };

export type LectureGameTracker =
  | { ok: true; lie: false; message: string }
  | { ok: true; lie: true; etat: EtatGT; preparation: PreparationEnvoi }
  | { ok: false; erreur: string };

export interface Attendu {
  tour: number;
  haut: number | null;
  bas: number | null;
}

export type EnvoiGameTracker =
  | {
      ok: true;
      /** Rien envoyé : Game Tracker avait déjà exactement ces picks. */
      dejaAJour: boolean;
      envoye: Attendu;
      /** Pick RÉEL relu après l'envoi, et ses écarts avec ce qu'on a envoyé. */
      reel: { haut: PickGT | null; bas: PickGT | null; etat: string };
      ecarts: EcartApresEnvoi[];
    }
  | { ok: false; erreur: string };

const MESSAGE_SANS_LIEN =
  'Ce tournoi n’est pas relié à un tournoi Game Tracker. Pose le lien depuis Import > Thomas (choix du tournoi interne), puis reviens ici.';

async function preparer(tournamentId: string) {
  const ctx = await chargerContexteLocalGT(supabaseAnon(), tournamentId);
  if (!ctx.gtId) return { lie: false as const };
  const etat = await etatPicksGT(ctx.gtId);
  const preparation = preparerEnvoi({
    etat,
    rounds: ctx.rounds,
    matchsPremierTour: ctx.matchs,
    noms: ctx.noms,
    picksLocaux: ctx.picks,
    maintenant: new Date(),
  });
  return { lie: true as const, gtId: ctx.gtId, etat, preparation };
}

export async function lireGameTracker(tournamentId: string): Promise<LectureGameTracker> {
  if (!(await sessionValide())) return REFUS;
  if (!UUID.test(tournamentId)) return { ok: false, erreur: 'Tournoi invalide.' };
  try {
    const r = await preparer(tournamentId);
    if (!r.lie) return { ok: true, lie: false, message: MESSAGE_SANS_LIEN };
    return { ok: true, lie: true, etat: r.etat, preparation: r.preparation };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}

export async function envoyerGameTracker(tournamentId: string, attendu: Attendu): Promise<EnvoiGameTracker> {
  if (!(await sessionValide())) return REFUS;
  if (!UUID.test(tournamentId)) return { ok: false, erreur: 'Tournoi invalide.' };
  try {
    // Tout est relu et recalculé MAINTENANT : l'état affiché a pu vieillir
    // (verrou passé, pick redirigé, pick local modifié entre-temps).
    const r = await preparer(tournamentId);
    if (!r.lie) return { ok: false, erreur: MESSAGE_SANS_LIEN };
    const prep = r.preparation;
    if (!prep.ok) return { ok: false, erreur: `Rien envoyé : ${prep.raisons.join(' ')}` };

    if (prep.tour !== attendu.tour || prep.haut !== attendu.haut || prep.bas !== attendu.bas) {
      return {
        ok: false,
        erreur: 'Rien envoyé : ce qui serait envoyé a changé depuis ton dernier affichage. Relis Game Tracker et vérifie.',
      };
    }

    const envoye: Attendu = { tour: prep.tour, haut: prep.haut, bas: prep.bas };
    const unSeulPick = r.etat.tourOuvert?.picksAttendus === 1;

    if (!prep.dejaAJour) {
      const rep = await poserPicksGT(r.gtId, prep.tour, prep.haut, prep.bas);
      if (!rep.enregistre) {
        return { ok: false, erreur: `Refusé par Game Tracker${rep.erreur ? ` : ${rep.erreur}` : ''}. Rien n’a changé.` };
      }
    }

    // Le serveur de Game Tracker peut modifier un pick après coup : on relit le RÉEL.
    const apres = await etatPicksGT(r.gtId);
    const reel = apres.tourOuvert?.monPick ?? { haut: null, bas: null, etat: 'manquant' };
    return {
      ok: true,
      dejaAJour: prep.dejaAJour,
      envoye,
      reel,
      ecarts: ecartsApresEnvoi(envoye, reel, unSeulPick),
    };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
