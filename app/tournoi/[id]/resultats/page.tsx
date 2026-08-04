import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import TournoiNav from '../TournoiNav';
import RecomputeButton from './RecomputeButton';
import {
  DetailReference,
  ReferenceEnCours,
  TotalReference,
  type PickUtilisateur,
} from './ScoreReference';
import {
  getTournament,
  getPicks,
  getPlayerRows,
  getMatchRows,
  etatsSlots,
} from '@/supabase/queries';
import { genererSlots } from '@/lib/optimizer';
import { estEnCours, estIndecis } from '@/lib/types';

export const dynamic = 'force-dynamic';

const HALF_LABEL: Record<string, string> = { top: 'Haut', bottom: 'Bas' };

function num(n: number | null): string {
  return n === null || n === undefined ? '—' : String(n);
}

export default async function ResultatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tournoi = await getTournament(id);
  if (!tournoi) notFound();

  const picks = await getPicks(id);
  const players = await getPlayerRows(picks.map((p) => p.player_id));
  const nomDe = new Map(players.map((p) => [p.id, p.name]));

  // Ordre d'affichage : par round puis half
  const rounds = tournoi.rounds ?? [];
  const ordre = (r: string) => {
    const i = rounds.indexOf(r);
    return i === -1 ? 99 : i;
  };
  const picksTries = [...picks].sort(
    (a, b) =>
      ordre(a.round) - ordre(b.round) ||
      (a.half ?? '').localeCompare(b.half ?? ''),
  );

  // Total courant : la somme de ce qui est déjà scoré. Les points sont
  // recalculés à chaque import et à chaque pick, indépendamment de la
  // complétude des tours — un tournoi en cours a donc un total valide.
  const total = picks.reduce((s, p) => s + (p.points ?? 0), 0);

  // Un pick n'a de points que si son match est joué : on repère les picks
  // dont le match n'est pas encore terminé (info d'affichage).
  const matchRows = await getMatchRows(id);
  const statutMatch = (round: string, playerId: string) => {
    const m = matchRows.find(
      (mm) =>
        mm.round === round &&
        (mm.player1_id === playerId || mm.player2_id === playerId),
    );
    return m?.status ?? null;
  };

  const enAttenteCount = picks.filter((p) =>
    estIndecis(statutMatch(p.round, p.player_id)),
  ).length;

  // Slots que la contrainte d'unicité a rendus impossibles : ils expliquent
  // pourquoi le nombre de picks peut rester sous les 12 sur un tournoi fini.
  const etats = etatsSlots(genererSlots(rounds), matchRows, picks);
  const sansPickPossible = etats.filter((e) => e.impossible && !e.pick).length;

  // Picks réels réduits à ce que la comparaison avec la référence affiche.
  const miens: PickUtilisateur[] = picks.map((p) => ({
    round: p.round,
    half: p.half,
    nom: nomDe.get(p.player_id) ?? p.player_id,
    points: p.points,
  }));

  return (
    <div className="space-y-5">
      <TournoiNav id={id} nom={tournoi.name} active="resultats" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <div className="text-sm">
            <span className="text-zinc-500">Total du tournoi : </span>
            <span className="text-lg font-semibold tabular-nums">{total}</span>
            <span className="text-zinc-500"> pts</span>
            {enAttenteCount > 0 && (
              <span className="ml-2 text-xs text-zinc-500">
                ({enAttenteCount} pick{enAttenteCount > 1 ? 's' : ''} en attente
                de résultat)
              </span>
            )}
            {sansPickPossible > 0 && (
              <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                ({sansPickPossible} slot{sansPickPossible > 1 ? 's' : ''} sans
                pick possible)
              </span>
            )}
          </div>

          {/* Le score de référence peut demander une simulation Monte Carlo par
              tour quand le cache de projections est froid : on le laisse
              arriver en flux plutôt que de retarder tout le tableau. */}
          <Suspense fallback={<ReferenceEnCours />}>
            <TotalReference id={id} reel={total} />
          </Suspense>
        </div>
        <RecomputeButton tournamentId={id} />
      </div>

      <Suspense fallback={null}>
        <DetailReference id={id} picks={miens} />
      </Suspense>

      {picks.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Aucun pick pour ce tournoi. Rends-toi sur l&apos;onglet Picks.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
              <th className="py-2 pr-3 font-medium">Tour</th>
              <th className="py-2 pr-3 font-medium">Moitié</th>
              <th className="py-2 pr-3 font-medium">Joueur</th>
              <th className="py-2 pr-3 text-right font-medium">Match</th>
              <th className="py-2 pr-3 text-right font-medium">Net sets</th>
              <th className="py-2 pr-3 text-right font-medium">Net games</th>
              <th className="py-2 pr-3 text-right font-medium">Total</th>
              <th className="py-2 pr-3 text-right font-medium">E[pts]</th>
            </tr>
          </thead>
          <tbody>
            {picksTries.map((p) => {
              const st = statutMatch(p.round, p.player_id);
              const enAttente = estIndecis(st);
              return (
                <tr
                  key={p.id}
                  className="border-b border-zinc-100 dark:border-zinc-900"
                >
                  <td className="py-1.5 pr-3 font-medium">{p.round}</td>
                  <td className="py-1.5 pr-3 text-zinc-500">
                    {p.half ? HALF_LABEL[p.half] : '—'}
                  </td>
                  <td className="py-1.5 pr-3">
                    {nomDe.get(p.player_id) ?? p.player_id}
                    {enAttente && (
                      <span className="ml-1 text-xs text-zinc-400">
                        ({estEnCours(st) ? 'en cours' : 'à jouer'})
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {num(p.points_match)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {num(p.points_sets)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {num(p.points_games)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">
                    {num(p.points)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-400">
                    {p.e_points != null ? Number(p.e_points).toFixed(1) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-300 dark:border-zinc-700">
              <td colSpan={6} className="py-2 pr-3 text-right font-medium">
                Total
              </td>
              <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                {total}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
