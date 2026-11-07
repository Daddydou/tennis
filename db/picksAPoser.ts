import { avancementPicks } from './tableau';
import { getMatchRows, getPicks } from './lectures';
import { estMasters } from '@/lib/masters';
import type { MatchRow, PickRow, TournamentRow } from './types';

/**
 * Picks que JE dois encore poser sur un tournoi : le tour à picker et le
 * nombre de picks restants. Lecture seule (supabaseAnon via ./lectures).
 *
 * Même calcul que l'en-tête de l'écran Picks et que le Dashboard
 * (avancementPicks) : le chiffre de l'accueil ne peut pas différer.
 */
export interface PicksAPoser {
  tour: string;
  reste: number;
}

/** Le tour à picker et ce qu'il reste à y poser, à partir des données déjà lues. */
export function resumePicksAPoser(
  rounds: string[],
  matchRows: MatchRow[],
  mesPicks: PickRow[],
): PicksAPoser | null {
  const { parTour, tourCourant } = avancementPicks(rounds, matchRows, mesPicks);
  if (!tourCourant) return null;
  const t = parTour.find((x) => x.round === tourCourant);
  return { tour: tourCourant, reste: Math.max(0, (t?.requis ?? 0) - (t?.faits ?? 0)) };
}

/**
 * Pour chaque tournoi (hors Masters : ses picks se posent dans son
 * Dashboard), les picks à poser. Un tournoi dont la lecture échoue est
 * simplement absent du résultat : la carte n'affiche alors rien plutôt qu'un
 * chiffre faux. Toutes les lectures partent en parallèle.
 */
export async function picksAPoserMoi(tournois: TournamentRow[]): Promise<Map<string, PicksAPoser>> {
  const resultat = new Map<string, PicksAPoser>();
  await Promise.all(
    tournois
      .filter((t) => !estMasters(t.rounds))
      .map(async (t) => {
        try {
          const [matchRows, mesPicks] = await Promise.all([getMatchRows(t.id), getPicks(t.id)]);
          const resume = resumePicksAPoser(t.rounds ?? [], matchRows, mesPicks);
          if (resume) resultat.set(t.id, resume);
        } catch (e) {
          console.error(`Picks à poser illisibles (${t.id}) :`, (e as Error).message);
        }
      }),
  );
  return resultat;
}
