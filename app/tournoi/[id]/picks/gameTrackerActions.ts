'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { supabaseAdmin } from '@/db/server';
import { supabaseAnon } from '@/db/anon';
import { chargerContexteLocalGT, ecrireLienGT } from '@/db/gameTrackerPicks';
import { alignerSurGameTracker } from '@/db/gameTrackerAlignement';
import { recalculerPoints } from '@/db/points';
import { reprendreResultatsThomas } from '@/db/resultatsSecoursThomas';
import { BracketIncoherent, ecrireBracketExterne } from '@/db/bracketExterneEcriture';
import { pontVersRoundPicks } from '@/db/bracketExternePont';
import { bracketThomas } from '@/externe/thomasClient';
import { decrireChangement } from '@/lib/gameTrackerAlignement';
import { etatPicksGT, listerTournoisPicks, poserPicksGT } from '@/externe/gameTrackerPicksClient';
import {
  candidatsLienGT,
  decisionEnvoiAuto,
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

/** Ce que la lecture a rapatrié du bracket de Thomas (lecture seule chez lui). */
export type ResumeThomasLecture =
  | { ok: true; matchs: number; pronostics: number; points: { pseudo: string; points: number }[]; pont: string }
  | { ok: false; message: string };

/** Envoi de mes picks VALIDÉS à Game Tracker, déclenché par le bouton de l'écran Picks (jamais par la lecture globale). */
export interface EnvoiAuto {
  envoye: boolean;
  message: string;
  /** Écarts constatés après relecture du pick réel (redirection d'une joueuse en attente...). */
  ecarts?: number;
}

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
      /**
       * Résultats que l'app de Thomas avait et que notre source (import espacé) n'avait pas
       * encore, repris à la lecture (« Fritz bat Fils (R16) »). Vide la plupart du temps.
       */
      resultatsRepris: string[];
      /** Bracket de Thomas rapatrié (résultats, pronostics, points). */
      thomas?: ResumeThomasLecture;
      /** Présent seulement si la lecture a été demandée avec l'envoi des picks validés. */
      envoiAuto?: EnvoiAuto | null;
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

/**
 * Tout ce qu'on rapatrie de chez Thomas à la lecture (UNE seule lecture de son API, en lecture seule).
 * Au mieux : une panne de l'API de Thomas ne doit jamais empêcher de lire Game Tracker.
 *  1. filet de sécurité : les résultats que notre source n'a pas encore (lib/resultatsSecours.ts) ;
 *  2. le bracket complet (résultats, pronostics, points de chacun : tn_bracket_externe_*) et le report des
 *     pronostics dans le Simulateur (pont : emplacements vides seulement, écarts signalés, jamais de suppression).
 * Avant, seule la partie 1 était faite à la lecture : la partie 2 restait une synchro manuelle, d'où des points
 * Bracket figés à la dernière synchro.
 */
async function rapatrierDepuisThomas(
  tournamentId: string,
  thomasId: string,
): Promise<{ resultatsRepris: string[]; thomas: ResumeThomasLecture }> {
  let bracket;
  try {
    bracket = await bracketThomas(thomasId);
  } catch (e) {
    return { resultatsRepris: [], thomas: { ok: false, message: `Bracket de Thomas indisponible : ${(e as Error).message}` } };
  }
  const sb = supabaseAdmin();

  let resultatsRepris: string[] = [];
  try {
    const res = await reprendreResultatsThomas(sb, tournamentId, bracket);
    if (!('erreurs' in res) && res.repris.length > 0) {
      // Les points des picks sont ENREGISTRÉS (tn_picks.points) : sans ce recalcul, un pick dont le
      // match vient d'être complété garderait ses anciens points (Fritz : 0 au lieu de 16).
      await recalculerPoints(tournamentId);
      resultatsRepris = res.repris.map((x) => `${x.vainqueur}${x.perdant ? ` bat ${x.perdant}` : ''} (${x.round})`);
    }
  } catch {
    /* au mieux */
  }

  let thomas: ResumeThomasLecture;
  try {
    const resume = await ecrireBracketExterne(sb, bracket);
    const pont = await pontVersRoundPicks(sb, sb, bracket, { ecraser: false });
    thomas = {
      ok: true,
      matchs: resume.matchs,
      pronostics: resume.pronostics,
      points: resume.participants.map((p) => ({ pseudo: p.pseudo, points: p.thomas ?? p.calcule })),
      pont:
        pont.statut === 'ok'
          ? `${pont.inseres} pronostic(s) ajouté(s) au Simulateur${pont.ecarts.length > 0 ? `, ${pont.ecarts.length} écart(s) avec chez Thomas (non écrasés)` : ''}`
          : pont.message,
    };
  } catch (e) {
    thomas = {
      ok: false,
      message: e instanceof BracketIncoherent ? `Bracket de Thomas incohérent, rien écrit : ${e.message}` : `Synchro du bracket de Thomas impossible : ${(e as Error).message}`,
    };
  }
  revalidatePath(`/tournoi/${tournamentId}`, 'layout');
  return { resultatsRepris, thomas };
}

/**
 * Pose chez Game Tracker MES picks VALIDÉS du tour ouvert quand ils diffèrent des leurs. Appelé seulement
 * depuis la lecture d'un tournoi (clic sur le bouton de l'écran Picks) :
 *   - jamais une simple réservation (seulement un pick validé dans l'app) ;
 *   - uniquement le tour ouvert, jamais verrouillé, jamais un côté vidé (preparerEnvoi renvoie tel quel
 *     le côté que nous n'avons pas posé) ;
 *   - au moindre doute (refus de preparerEnvoi) on n'envoie rien ;
 *   - le pick RÉEL est relu après l'envoi et les écarts sont signalés.
 */
async function envoyerSiValides(
  r: { gtId: string; etat: EtatGT; preparation: PreparationEnvoi },
): Promise<{ envoi: EnvoiAuto; etatApres: EtatGT | null }> {
  const prep = r.preparation;
  const decision = decisionEnvoiAuto(prep);
  if (!decision.envoyer) return { envoi: { envoye: false, message: decision.message }, etatApres: null };
  if (!prep.ok) return { envoi: { envoye: false, message: 'Rien envoyé.' }, etatApres: null };
  const rep = await poserPicksGT(r.gtId, prep.tour, prep.haut, prep.bas);
  if (!rep.enregistre) {
    return { envoi: { envoye: false, message: `Refusé par Game Tracker${rep.erreur ? ` : ${rep.erreur}` : ''}. Rien n’a changé.` }, etatApres: null };
  }
  const apres = await etatPicksGT(r.gtId);
  const reel = tourPickable(apres, prep.tour)?.monPick ?? { haut: null, bas: null, etat: 'manquant' };
  const unSeulPick = tourPickable(apres, prep.tour)?.picksAttendus === 1;
  const ecarts = ecartsApresEnvoi({ haut: prep.haut, bas: prep.bas }, reel, unSeulPick);
  return {
    envoi: { envoye: true, message: `Picks validés envoyés à Game Tracker (tour ${prep.roundLocal}).`, ecarts: ecarts.length },
    etatApres: apres,
  };
}

export async function lireGameTracker(tournamentId: string, options: { envoyer?: boolean } = {}): Promise<LectureGameTracker> {
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
    const { resultatsRepris, thomas } = await rapatrierDepuisThomas(tournamentId, r.gtId);
    let courant = r;
    if ((alignement.ok && alignement.changements.length > 0) || resultatsRepris.length > 0) {
      revalidatePath(`/tournoi/${tournamentId}`, 'layout');
      // Nos picks (ou nos résultats) ont changé : ce qui serait envoyé est recalculé (même état lu, pas de 2e appel).
      const r2 = await preparer(tournamentId, r.etat);
      if (r2.lie) courant = r2;
    }
    if (!courant.lie) return { ok: false, erreur: MESSAGE_SANS_LIEN };

    // Envoi de mes picks validés, seulement si le bouton de l'écran Picks l'a demandé.
    let envoiAuto: EnvoiAuto | null = null;
    if (options.envoyer) {
      const e = await envoyerSiValides({ gtId: courant.gtId, etat: courant.etat, preparation: courant.preparation });
      envoiAuto = e.envoi;
      if (e.etatApres) {
        // Game Tracker a changé : on recalcule l'aperçu sur l'état RÉEL relu.
        const r3 = await preparer(tournamentId, e.etatApres);
        if (r3.lie) courant = r3;
      }
    }
    return { ok: true, lie: true, etat: courant.etat, preparation: courant.preparation, aVenir: courant.aVenir, pool: courant.pool, alignement, resultatsRepris, thomas, envoiAuto };
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
