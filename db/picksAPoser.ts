import { avancementPicks } from './tableau';
import { getMatchRows, getPicks, getReservationsPlan } from './lectures';
import { estMasters } from '@/lib/masters';
import type { MatchRow, PickRow, PlanReservationRow, TournamentRow } from './types';

/**
 * Picks que JE dois encore poser sur un tournoi : le tour à picker et le
 * nombre de picks restants. Lecture seule (supabaseAnon via ./lectures).
 *
 * Même calcul que l'en-tête de l'écran Picks et que le Dashboard
 * (avancementPicks) : le chiffre de l'accueil ne peut pas différer.
 */
export interface PicksAPoser {
  tour: string;
  /** Picks pas encore VALIDÉS sur ce tour (une réservation n'est pas un pick). */
  reste: number;
  /** Parmi eux, ceux pour lesquels une réservation existe déjà (brouillon du plan). */
  reserves: number;
}

/**
 * Emplacements du tour déjà réservés et pas encore validés. Une réservation
 * n'est ni un pick ni un envoi à Game Tracker : elle sert au plan, et le tour
 * ne se valide qu'une fois ses joueurs connus.
 */
export function compterReserves(
  tour: string,
  picks: Pick<PickRow, 'round' | 'half'>[],
  reservations: Pick<PlanReservationRow, 'round' | 'half'>[],
): number {
  const cle = (x: { round: string; half: string | null }) => `${x.round}|${x.half ?? ''}`;
  const valides = new Set(picks.map((p) => cle({ round: p.round, half: p.half ?? null })));
  const reserves = new Set(
    reservations
      .filter((r) => r.round === tour)
      .map((r) => cle({ round: r.round, half: r.half ?? null }))
      .filter((c) => !valides.has(c)),
  );
  return reserves.size;
}

/** Le tour à picker et ce qu'il reste à y poser, à partir des données déjà lues. */
export function resumePicksAPoser(
  rounds: string[],
  matchRows: MatchRow[],
  mesPicks: PickRow[],
  mesReservations: Pick<PlanReservationRow, 'round' | 'half'>[] = [],
): PicksAPoser | null {
  const { parTour, tourCourant } = avancementPicks(rounds, matchRows, mesPicks);
  if (!tourCourant) return null;
  const t = parTour.find((x) => x.round === tourCourant);
  const reste = Math.max(0, (t?.requis ?? 0) - (t?.faits ?? 0));
  return { tour: tourCourant, reste, reserves: Math.min(reste, compterReserves(tourCourant, mesPicks, mesReservations)) };
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
          const [matchRows, mesPicks, reservations] = await Promise.all([
            getMatchRows(t.id),
            getPicks(t.id),
            // Une lecture ratée des réservations ne doit pas masquer le tournoi : on retombe sur « à poser ».
            getReservationsPlan(t.id).catch(() => []),
          ]);
          const mesReservations = reservations.filter((r) => (r.participant_id ?? null) === null);
          const resume = resumePicksAPoser(t.rounds ?? [], matchRows, mesPicks, mesReservations);
          if (resume) resultat.set(t.id, resume);
        } catch (e) {
          console.error(`Picks à poser illisibles (${t.id}) :`, (e as Error).message);
        }
      }),
  );
  return resultat;
}
