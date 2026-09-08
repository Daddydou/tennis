import Link from 'next/link';
import { notFound } from 'next/navigation';
import TournoiNav from '../TournoiNav';
import PicksParticipantBoard, {
  type ColonneSimple,
  type CandidatSimple,
} from './PicksParticipantBoard';
import {
  etatsSlots,
  getParticipants,
  getTousLesPicks,
  joueursEnLice,
  loadEngineData,
  type PickRow,
} from '@/supabase/queries';
import { genererSlots } from '@/lib/optimizer';
import { adversaireDe } from '@/lib/parser';
import type { DrawExtract, Half, Slot } from '@/lib/types';

export const dynamic = 'force-dynamic';

const HALF_LABEL: Record<string, string> = { top: 'Moitié haute', bottom: 'Moitié basse' };
const HALF_LABEL_COURT: Record<string, string> = { top: 'haut', bottom: 'bas' };

/** Un « stock » = moi (id null) ou un participant configuré. */
interface Stock {
  id: string | null;
  nom: string;
  picks: PickRow[];
}

export default async function ParticipantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ round?: string; participant?: string }>;
}) {
  const { id } = await params;
  const { round: roundParam, participant: participantParam } = await searchParams;

  const engine = await loadEngineData(id);
  if (!engine) notFound();
  const { tournament, matches, matchRows, players } = engine;
  const rounds = tournament.rounds ?? [];

  const [participants, tousLesPicks] = await Promise.all([
    getParticipants(),
    getTousLesPicks(id),
  ]);

  const nomJoueur = (playerId: string) => players[playerId]?.name ?? playerId;
  const rangJoueur = (playerId: string) => players[playerId]?.rank ?? null;

  const enLice = joueursEnLice(matchRows);

  const ordre = (r: string) => {
    const i = rounds.indexOf(r);
    return i === -1 ? 99 : i;
  };

  const stocks: Stock[] = [
    { id: null, nom: 'Moi', picks: tousLesPicks.filter((p) => p.participant_id === null) },
    ...participants.map((part) => ({
      id: part.id,
      nom: part.name,
      picks: tousLesPicks.filter((p) => p.participant_id === part.id),
    })),
  ];

  const slots = genererSlots(rounds);
  const slotsParRound = new Map<string, Slot[]>();
  for (const s of slots) {
    const a = slotsParRound.get(s.round) ?? [];
    a.push(s);
    slotsParRound.set(s.round, a);
  }

  // Participant sélectionné pour LA SAISIE (jamais « Moi » : mes picks se
  // saisissent sur l'écran Picks, inchangé). Par défaut, le premier
  // participant configuré.
  const participantSelectionne =
    participantParam && participants.some((p) => p.id === participantParam)
      ? participantParam
      : (participants[0]?.id ?? null);

  let colonnes: ColonneSimple[] = [];
  let roundSelectionne: string | null = null;

  if (participantSelectionne) {
    const picksDuParticipant = stocks.find((s) => s.id === participantSelectionne)?.picks ?? [];
    const etatsParticipant = etatsSlots(slots, matchRows, picksDuParticipant);
    const etatDe = new Map(etatsParticipant.map((e) => [`${e.round}|${e.half ?? ''}`, e] as const));
    const estImpossible = (round: string, half: Half | null) =>
      etatDe.get(`${round}|${half ?? ''}`)?.impossible ?? false;

    const faitsParRound = new Map<string, number>();
    for (const p of picksDuParticipant) {
      faitsParRound.set(p.round, (faitsParRound.get(p.round) ?? 0) + 1);
    }
    const requis = (r: string) =>
      (slotsParRound.get(r) ?? []).filter((s) => !estImpossible(s.round, s.half as Half | null)).length;
    const faits = (r: string) => faitsParRound.get(r) ?? 0;

    const tourCourant = rounds.find((r) => faits(r) < requis(r)) ?? rounds[rounds.length - 1] ?? null;
    roundSelectionne = roundParam && rounds.includes(roundParam) ? roundParam : tourCourant;

    const extractLike = { matches } as unknown as DrawExtract;

    if (roundSelectionne) {
      const slotsDuRound = slotsParRound.get(roundSelectionne) ?? [];
      colonnes = slotsDuRound.map((slot) => {
        const half = slot.half as Half | null;
        const etat = etatDe.get(`${roundSelectionne}|${half ?? ''}`);
        const candidats: CandidatSimple[] = (etat?.disponibles ?? []).map((playerId) => {
          const advId = adversaireDe(extractLike, playerId, roundSelectionne!);
          const adv = advId ? nomJoueur(advId) : null;
          return {
            playerId,
            nom: nomJoueur(playerId),
            rang: rangJoueur(playerId),
            adversaire: adv,
          };
        });
        return {
          half,
          label: half ? HALF_LABEL[half] : 'Un seul pick',
          pickActuel: etat?.pick ?? null,
          impossible: etat?.impossible ?? false,
          candidats,
        };
      });
    }
  }

  return (
    <div className="space-y-6">
      <TournoiNav id={id} nom={tournament.name} active="participants" />

      <div>
        <p className="text-sm text-zinc-500">
          Les picks du groupe sur ce tournoi. Chacun a son propre stock de joueurs
          — un joueur pické par l&apos;un reste disponible pour les autres. Barème
          identique au mien.{' '}
          <Link href="/participants" className="underline">
            Gérer les participants
          </Link>
          .
        </p>
      </div>

      {/* Vue d'ensemble : score et disponibilité de chaque stock */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stocks.map((s) => {
          const total = s.picks.reduce((sum, p) => sum + (p.points ?? 0), 0);
          const utilises = new Set(s.picks.map((p) => p.player_id));
          const disponibles = [...enLice]
            .filter((pid) => !utilises.has(pid))
            .map((pid) => ({ playerId: pid, nom: nomJoueur(pid), rang: rangJoueur(pid) }))
            .sort((a, b) => (a.rang ?? 9999) - (b.rang ?? 9999));
          const picksTries = [...s.picks].sort(
            (a, b) => ordre(a.round) - ordre(b.round) || (a.half ?? '').localeCompare(b.half ?? ''),
          );

          return (
            <div
              key={s.id ?? 'moi'}
              className="space-y-2 rounded border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">{s.nom}</h2>
                <span className="text-sm font-semibold tabular-nums">
                  {total} <span className="font-normal text-zinc-500">pts</span>
                </span>
              </div>

              {picksTries.length === 0 ? (
                <p className="text-xs text-zinc-500">Aucun pick pour l&apos;instant.</p>
              ) : (
                <ul className="space-y-0.5 text-xs">
                  {picksTries.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-zinc-600 dark:text-zinc-400">
                        {p.round}
                        {p.half ? ` (${HALF_LABEL_COURT[p.half]})` : ''} — {nomJoueur(p.player_id)}
                      </span>
                      <span className="tabular-nums text-zinc-500">
                        {p.points ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <details className="text-xs">
                <summary className="cursor-pointer text-zinc-500">
                  {disponibles.length} encore en lice et disponible(s)
                </summary>
                {disponibles.length === 0 ? (
                  <p className="mt-1 text-zinc-400">Aucun.</p>
                ) : (
                  <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-zinc-600 dark:text-zinc-400">
                    {disponibles.map((d) => (
                      <li key={d.playerId} className="truncate">
                        {d.nom}
                        {d.rang ? <span className="text-zinc-400"> #{d.rang}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </div>
          );
        })}
      </div>

      {/* Saisie : uniquement pour les participants, jamais pour « Moi » */}
      <div className="space-y-3 border-t border-zinc-200 pt-5 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Saisir un pick</h2>

        {participants.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Aucun participant configuré.{' '}
            <Link href="/participants" className="underline">
              En ajouter un
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {participants.map((p) => (
                <Link
                  key={p.id}
                  href={`/tournoi/${id}/participants?participant=${p.id}`}
                  className={`rounded border px-2.5 py-1 text-xs ${
                    p.id === participantSelectionne
                      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                      : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
                  }`}
                >
                  {p.name}
                </Link>
              ))}
            </div>

            {participantSelectionne && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {rounds.map((r) => (
                    <Link
                      key={r}
                      href={`/tournoi/${id}/participants?participant=${participantSelectionne}&round=${r}`}
                      className={`rounded border px-2.5 py-1 text-xs ${
                        r === roundSelectionne
                          ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                          : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
                      }`}
                    >
                      {r}
                    </Link>
                  ))}
                </div>

                {!roundSelectionne ? (
                  <p className="text-sm text-zinc-500">Aucun tour à picker.</p>
                ) : colonnes.every((c) => c.candidats.length === 0 && !c.impossible) ? (
                  <p className="text-sm text-zinc-500">
                    Aucun joueur disponible pour ce tour.
                  </p>
                ) : (
                  <PicksParticipantBoard
                    tournamentId={id}
                    round={roundSelectionne}
                    participantId={participantSelectionne}
                    colonnes={colonnes}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
