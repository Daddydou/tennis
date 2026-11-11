import { ChipStatutPick, classeLigneResultat, EtiquetteResultat, PuceParticipant } from '@/app/pastillesPicks';
import { carte, couleurPoints } from '@/app/ui';
import { libelleTourMasters } from '@/lib/masters';
import { ligneDepuisPoints } from '@/lib/pastillesPicks';

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
      <header className="flex flex-wrap items-center justify-between gap-x-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <PuceParticipant nom={nom} />
          Picks de {nom}
        </h2>
        <span className="text-sm tabular-nums text-zinc-700">{total} pts</span>
      </header>
      {picks.length === 0 && (
        <p className="text-sm text-zinc-600">
          Aucun pick de {nom} chez nous pour l&apos;instant : ils arrivent quand le tour est verrouillé chez Game Tracker, à chaque lecture.
        </p>
      )}
      <ul className="space-y-1.5 text-sm">
        {EMPLACEMENTS.map((e) => {
          // Demie et finale : un seul pick, quelle que soit la moitié stockée (Game Tracker écrit « haut »).
          const pick = picks.find((p) => p.round === e.round && (e.half === null || p.half === e.half));
          // Fond de la ligne : des points = juste (vert pâle), zéro = raté (rouge pâle), null = pas joué (blanc).
          const ligne = ligneDepuisPoints(pick?.points);
          return (
            <li key={`${e.round}|${e.half ?? ''}`} className={`flex items-center gap-3 ${pick ? classeLigneResultat(ligne) : 'rounded-xl px-2.5 py-1.5'}`} data-resultat={pick ? ligne : 'vide'}>
              <span className="w-28 shrink-0 text-xs text-zinc-600">
                {libelleTourMasters(e.round)}
                {e.half ? ` · ${POULE[e.half]}` : ''}
              </span>
              {pick ? (
                <>
                  <span className="min-w-0 flex-1 truncate font-medium">{noms[pick.playerId] ?? pick.playerId}</span>
                  {pick.points === null ? (
                    <span className="shrink-0 text-xs text-zinc-600">à jouer</span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1.5">
                      <EtiquetteResultat r={ligne} />
                      <span className={`font-mono tabular-nums ${couleurPoints(pick.points)}`}>{pick.points}</span>
                    </span>
                  )}
                </>
              ) : (
                <span className="min-w-0 flex-1">
                  <ChipStatutPick statut="a_poser" libelle="pas posé" />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
