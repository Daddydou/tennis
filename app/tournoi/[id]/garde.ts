import { redirect } from 'next/navigation';
import { getTournament } from '@/db/queries';
import { estMasters } from '@/lib/masters';

/**
 * Garde des écrans pensés pour un tableau à élimination directe (Tableau, Picks, Bracket, Fantasy,
 * Prédictions, Résultats) : un tournoi au format Masters (poules + phase finale) n'a ni arbre ni tours
 * de puissance de 2, ces calculs n'ont pas de sens — on renvoie vers son écran propre (le Dashboard).
 * À appeler tout en haut de la page, avant tout calcul : `redirect` interrompt le rendu.
 */
export async function redirigerSiMasters(id: string): Promise<void> {
  const t = await getTournament(id);
  if (t && estMasters(t.rounds)) redirect(`/tournoi/${id}`);
}
