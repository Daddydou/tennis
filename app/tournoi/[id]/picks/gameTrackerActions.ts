'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { supabaseAdmin } from '@/db/server';
import { supabaseAnon } from '@/db/anon';
import { chargerContexteLocalGT, ecrireLienGT } from '@/db/gameTrackerPicks';
import { alignerSurGameTracker } from '@/db/gameTrackerAlignement';
import { decrireChangement } from '@/lib/gameTrackerAlignement';
import { etatPicksGT, listerTournoisPicks, poserPicksGT } from '@/externe/gameTrackerPicksClient';
import {
  candidatsLienGT,
  ecartsApresEnvoi,
  type CandidatLienGT,
  preparerEnvoi,
  type EcartApresEnvoi,
  type EtatGT,
  type PickGT,
  type PoolLocalGT,
  type PreparationEnvoi,
  poolParJoueur,
  type TourOuvertGT,
  tourPickable,
} from '@/lib/gameTrackerPicks';

/**
 * PICKS -> GAME TRACKER, depuis l'écran picks. Deux actions, TOUJOURS
 * déclenchées à la main :
 *   - `lireGameTracker`   : un GET chez Game Tracker, montre ce qui serait envoyé
 *                           et aligne nos tours verrouillés (voir ci-dessous) ;
 *   - `envoyerGameTracker`: UN POST, au nom du joueur de la clé.
 *
 * `envoyerGameTracker` n'écrit RIEN dans NOTRE base. `lireGameTracker` aligne
 * nos picks (Moi, Laki, Thomas) sur ceux de Game Tracker pour les tours DÉJÀ
 * verrouillés chez eux (leur jeu fait foi, db/gameTrackerAlignement.ts) ; le
 * tour ouvert n'est jamais touché. `lierGameTracker` écrit le lien tournoi,
 * sur choix explicite. Le client ne fournit que l'identifiant du tournoi
 * (et, pour l'envoi, ce qu'il a vu à l'écran) : les positions sont TOUJOURS
 * recalculées ici, côté serveur, depuis nos picks.
 *
 * Server Action = POST : la garde de session est ici, pas dans le proxy.
 * Messages d'erreur sûrs : jamais de clé (cf. externe/gameTrackerPicksClient.ts).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFUS = { ok: false as const, erreur: 'Non authentifié.' };

/** Ce que la lecture a aligné chez nous sur les tours verrouillés de Game Tracker. */
export type AlignementLu =
  | { ok: true; rounds: string[]; changements: string[]; avertissements: string[] }
  | { ok: false; raisons: string[] };

export type LectureGameTracker =
  | { ok: true; lie: false; message: string; candidats: CandidatLienGT[] }
  | {
      ok: true;
      lie: true;
      etat: EtatGT;
      preparation: PreparationEnvoi;
      /** Tours à venir (picks à l'avance) : ce qui serait envoyé pour chacun. */
      aVenir: { tour: TourOuvertGT; preparation: PreparationEnvoi }[];
      pool: PoolLocalGT | null;
      alignement: AlignementLu;
    }
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
  'Ce tournoi n’est pas encore relié à un tournoi Game Tracker. Choisis-le dans la liste ci-dessous.';

async function preparer(tournamentId: string, etatDeja?: EtatGT, tourCible?: number) {
  const ctx = await chargerContexteLocalGT(supabaseAnon(), tournamentId);
  if (!ctx.gtId) return { lie: false as const, interne: ctx.interne };
  const etat = etatDeja ?? (await etatPicksGT(ctx.gtId));
  const preparation = preparerEnvoi({
    etat,
    rounds: ctx.rounds,
    matchsPremierTour: ctx.matchs,
    noms: ctx.noms,
    picksLocaux: ctx.picks,
    maintenant: new Date(),
    tourCible,
  });
  // Tours à venir : même calcul, un par tour (rien n'est envoyé, c'est un aperçu).
  const aVenir = etat.toursAVenir.map((tour) => ({
    tour,
    preparation: preparerEnvoi({
      etat,
      rounds: ctx.rounds,
      matchsPremierTour: ctx.matchs,
      noms: ctx.noms,
      picksLocaux: ctx.picks,
      maintenant: new Date(),
      tourCible: tour.numero,
    }),
  }));
  const pool = poolParJoueur(etat, ctx.rounds, ctx.matchs);
  return { lie: true as const, gtId: ctx.gtId, etat, preparation, aVenir, pool };
}

export async function lireGameTracker(tournamentId: string): Promise<LectureGameTracker> {
  if (!(await sessionValide())) return REFUS;
  if (!UUID.test(tournamentId)) return { ok: false, erreur: 'Tournoi invalide.' };
  try {
    const r = await preparer(tournamentId);
    if (!r.lie) {
      // Pas de lien : on propose les tournois de l'API picks (Lyon y est, alors
      // qu'il manque à l'API bracket de Thomas), restreints à ceux qui peuvent
      // correspondre. Le choix reste à l'utilisateur.
      const liste = await listerTournoisPicks();
      return { ok: true, lie: false, message: MESSAGE_SANS_LIEN, candidats: candidatsLienGT(r.interne, liste) };
    }
    // Tours verrouillés ou terminés chez Game Tracker : LEUR jeu fait foi, on
    // aligne nos picks (Moi, Laki, Thomas). Le tour ouvert n'est jamais touché.
    let alignement: AlignementLu;
    try {
      const a = await alignerSurGameTracker(tournamentId, r.etat);
      alignement = a.ok
        ? { ok: true, rounds: a.rounds, changements: a.changements.map(decrireChangement), avertissements: a.avertissements }
        : { ok: false, raisons: a.raisons };
    } catch (e) {
      alignement = { ok: false, raisons: [(e as Error).message] };
    }
    if (alignement.ok && alignement.changements.length > 0) {
      revalidatePath(`/tournoi/${tournamentId}`, 'layout');
      // Nos picks ont changé : ce qui serait envoyé est recalculé (même état lu, pas de 2e appel).
      const r2 = await preparer(tournamentId, r.etat);
      if (r2.lie) return { ok: true, lie: true, etat: r2.etat, preparation: r2.preparation, aVenir: r2.aVenir, pool: r2.pool, alignement };
    }
    return { ok: true, lie: true, etat: r.etat, preparation: r.preparation, aVenir: r.aVenir, pool: r.pool, alignement };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}

const ID_GT = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * Relie notre tournoi à un tournoi Game Tracker, sur choix explicite.
 * Seule écriture de ce fichier : service role APRÈS la garde de session, et
 * seulement vers un tournoi que l'API picks liste ET qui correspond au nôtre
 * (même circuit, même année, même tableau).
 */
export async function lierGameTracker(
  tournamentId: string,
  gtId: string,
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  if (!(await sessionValide())) return REFUS;
  if (!UUID.test(tournamentId)) return { ok: false, erreur: 'Tournoi invalide.' };
  if (!ID_GT.test(gtId)) return { ok: false, erreur: 'Identifiant Game Tracker invalide.' };
  try {
    const ctx = await chargerContexteLocalGT(supabaseAnon(), tournamentId);
    const liste = await listerTournoisPicks();
    const gt = liste.find((t) => t.id === gtId);
    if (!gt || !candidatsLienGT(ctx.interne, [gt]).length) {
      return { ok: false, erreur: 'Ce tournoi Game Tracker ne correspond pas à celui-ci (circuit, année ou taille du tableau).' };
    }
    const r = await ecrireLienGT(supabaseAdmin(), tournamentId, gt);
    if (!r.ok) return r;
    revalidatePath(`/tournoi/${tournamentId}/picks`);
    revalidatePath('/import/thomas');
    return { ok: true };
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
    const r = await preparer(tournamentId, undefined, attendu.tour);
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
    const unSeulPick = tourPickable(r.etat, prep.tour)?.picksAttendus === 1;

    if (!prep.dejaAJour) {
      const rep = await poserPicksGT(r.gtId, prep.tour, prep.haut, prep.bas);
      if (!rep.enregistre) {
        return { ok: false, erreur: `Refusé par Game Tracker${rep.erreur ? ` : ${rep.erreur}` : ''}. Rien n’a changé.` };
      }
    }

    // Le serveur de Game Tracker peut modifier un pick après coup : on relit le RÉEL.
    const apres = await etatPicksGT(r.gtId);
    const reel = tourPickable(apres, prep.tour)?.monPick ?? { haut: null, bas: null, etat: 'manquant' };
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
