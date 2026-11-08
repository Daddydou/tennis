import { carte, couleurPoints } from '@/app/ui';
import { libelleTourMasters } from '@/lib/masters';

/**
 * Picks d'un autre participant (Laki, Thomas) sur un Masters, en LECTURE SEULE : un emplacement par
 * journée et par poule, puis la demie et la finale, avec ses points. Ses picks arrivent chez nous à
 * chaque lecture de Game Tracker, pour les tours verrouillés (Game Tracker fait foi).
 */

export interface PickParticipantMasters {
  round: string;
  half: 'top' | 'bottom' | null;
  playerId: string;
  /** null = match pas encore joué. */
  points: number | null;
}

/** Les emplacements d'un Masters, dans l'ordre du jeu. */
const EMPLACEMENTS: { round: string; half: 'top' | 'bottom' | null }[] = [
  { round: 'J1', half: 'top' },
  { round: 'J1', half: 'bottom' },
  { round: 'J2', half: 'top' },
  { round: 'J2', half: 'bottom' },
  { round: 'J3', half: 'top' },
  { round: 'J3', half: 'bottom' },
  { round: 'SF', half: null },
  { round: 'F', half: null },
];

const POULE: Record<'top' | 'bottom', string> = { top: 'poule A', bottom: 'poule B' };

export default function PicksParticipantMasters({
  nom,
  picks,
  noms,
}: {
  nom: string;
  picks: PickParticipantMasters[];
  noms: Record<string, string>;
}) {
  const total = picks.reduce((s, p) => s + (p.points ?? 0), 0);
  return (
    <section className={`${carte} space-y-2 p-4`} data-testid="picks-participant-masters" aria-label={`Picks de ${nom}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-base font-semibold">Picks de {nom}</h2>
        <span className="text-sm tabular-nums text-zinc-700">{total} pts</span>
      </header>
      {picks.length === 0 && (
        <p className="text-sm text-zinc-600">
          Aucun pick de {nom} chez nous pour l&apos;instant : ils arrivent quand le tour est verrouillé chez Game Tracker, à chaque lecture.
        </p>
      )}
      <ul className="divide-y divide-zinc-100 text-sm">
        {EMPLACEMENTS.map((e) => {
          // Demie et finale : un seul pick, quelle que soit la moitié stockée (Game Tracker écrit « haut »).
          const pick = picks.find((p) => p.round === e.round && (e.half === null || p.half === e.half));
          return (
            <li key={`${e.round}|${e.half ?? ''}`} className="flex items-baseline gap-3 py-1.5">
              <span className="w-28 shrink-0 text-xs text-zinc-500">
                {libelleTourMasters(e.round)}
                {e.half ? ` · ${POULE[e.half]}` : ''}
              </span>
              {pick ? (
                <>
                  <span className="min-w-0 flex-1 truncate font-medium">{noms[pick.playerId] ?? pick.playerId}</span>
                  {pick.points === null ? (
                    <span className="shrink-0 text-xs text-zinc-500">à jouer</span>
                  ) : (
                    <span className={`shrink-0 font-mono tabular-nums ${couleurPoints(pick.points)}`}>{pick.points}</span>
                  )}
                </>
              ) : (
                <span className="min-w-0 flex-1 text-zinc-500">pas posé</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
