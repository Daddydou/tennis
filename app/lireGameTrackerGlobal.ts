'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { listTournaments } from '@/db/queries';
import { estMasters } from '@/lib/masters';
import { resumerLecture, type LigneLecture } from '@/lib/lectureGlobaleGT';
import { lireGameTracker } from './tournoi/[id]/picks/gameTrackerActions';
import { commenceDansLaSemaine, fraicheur } from './tournoisUi';

/**
 * « Lire Game Tracker » de l'accueil : lit, UN PAR UN, les tournois en cours
 * et ceux de la semaine (les mêmes que les cartes de l'accueil). AUCUN ENVOI :
 * on appelle `lireGameTracker` en mode lecture (GET + alignement de nos tours
 * verrouillés + synchro du bracket de Thomas) ; l'ENVOI de mes picks validés
 * se fait depuis le bouton « Lire Game Tracker » de chaque tournoi.
 *
 * Toujours déclenché à la main (bouton), jamais à l'ouverture de la page.
 * Un tournoi à la fois, pour rester sous la limite de 60 requêtes/minute de
 * l'API Game Tracker. Les Masters (poules) se lisent depuis leur écran.
 *
 * Server Action = POST : la garde de session est ici, pas dans le proxy.
 */
export async function lireTousGameTracker(): Promise<{ ok: true; lignes: LigneLecture[] } | { ok: false; erreur: string }> {
  if (!(await sessionValide())) return { ok: false, erreur: 'Non authentifié.' };
  try {
    const tournois = await listTournaments();
    const aujourdHui = new Date().toISOString().slice(0, 10);
    const cibles = tournois.filter((t) => fraicheur(t, aujourdHui) === 'en-cours' || commenceDansLaSemaine(t, aujourdHui));

    const lignes: LigneLecture[] = [];
    for (const t of cibles) {
      const base = { tournoiId: t.id, nom: `${t.name} ${t.year}` };
      if (estMasters(t.rounds)) {
        lignes.push({ ...base, statut: 'masters', detail: 'Masters : à lire depuis son propre écran.', attention: false });
        continue;
      }
      try {
        lignes.push({ ...base, ...resumerLecture(await lireGameTracker(t.id)) });
      } catch (e) {
        lignes.push({ ...base, statut: 'erreur', detail: (e as Error).message, attention: true });
      }
    }

    // Les alignements changent les picks à poser affichés sur les cartes.
    revalidatePath('/');
    return { ok: true, lignes };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
