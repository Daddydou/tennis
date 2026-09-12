import Link from 'next/link';
import { notFound } from 'next/navigation';
import TournoiNav from './TournoiNav';
import { pointsBracketParStock, pointsPicksParStock, stocksDuGroupe } from './pointsStock';
import {
  getTournament,
  getMatchRows,
  getParticipants,
  getBracketRoundPicks,
  getTousLesPicks,
  tourCourantMatches,
} from '@/supabase/queries';

export const dynamic = 'force-dynamic';

/**
 * Dashboard — page d'atterrissage du tournoi : synthèse Bracket + Picks pour
 * les trois participants (moi + tn_participants), avant le détail des
 * autres onglets. Les deux calculs (points Bracket, points Picks) vivent
 * dans `./pointsStock`, partagés avec le résumé en tête de l'onglet Picks —
 * jamais recalculés deux fois différemment.
 */
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tournoi = await getTournament(id);
  if (!tournoi) notFound();

  const [matchRows, participants, bracketRoundPicks, tousLesPicks] = await Promise.all([
    getMatchRows(id),
    getParticipants(),
    getBracketRoundPicks(id),
    getTousLesPicks(id),
  ]);

  const rounds = tournoi.rounds ?? [];
  const stocks = stocksDuGroupe(participants);
  const bracketParStock = pointsBracketParStock(matchRows, rounds, bracketRoundPicks);
  const picksParStock = pointsPicksParStock(tousLesPicks);
  const tourActuel = tourCourantMatches(matchRows, rounds);

  // Le total combiné traite « à importer » (aucun pronostic de bracket pour
  // ce stock) comme 0 pour le classement — c'est le seul moyen de comparer
  // quand même les stocks entre eux ; la cellule Bracket, elle, distingue
  // toujours ce cas d'un vrai 0 (cf. rendu ci-dessous).
  const lignes = stocks
    .map((s) => {
      const aBracket = bracketParStock.has(s.id);
      const bracket = bracketParStock.get(s.id) ?? 0;
      const picks = picksParStock.get(s.id) ?? 0;
      return { ...s, aBracket, bracket, picks, total: bracket + picks };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-5">
      <TournoiNav id={id} nom={tournoi.name} active="dashboard" />

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-zinc-500">
          Tour actuel :{' '}
          <span className="font-medium text-zinc-800 dark:text-zinc-200">
            {tourActuel ?? '—'}
          </span>
        </p>
        <div className="flex gap-4 text-xs">
          <Link
            href={`/tournoi/${id}/picks`}
            className="text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
          >
            Aller aux Picks →
          </Link>
          <Link
            href={`/tournoi/${id}/bracket`}
            className="text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
          >
            Aller au Bracket →
          </Link>
        </div>
      </div>

      {matchRows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Aucun match importé pour ce tournoi — rends-toi sur l&apos;onglet Tableau.
        </p>
      ) : (
        <div className="space-y-2">
          {lignes.map((l, i) => (
            <div
              key={l.id ?? 'moi'}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <span className="w-5 shrink-0 text-xs text-zinc-400">{i + 1}.</span>
              <span className="flex-1 truncate text-sm font-medium">
                {i === 0 && l.total > 0 && '🏆 '}
                {l.nom}
              </span>

              <span className="shrink-0 text-xs text-zinc-500">
                Bracket{' '}
                {l.aBracket ? (
                  <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {l.bracket}
                  </span>
                ) : (
                  <span
                    className="font-medium text-amber-600 dark:text-amber-400"
                    title="Aucun bracket de ce participant importé (onglet Simulateur → Bracket → Importer)"
                  >
                    à importer
                  </span>
                )}
              </span>

              <span className="shrink-0 text-xs text-zinc-500">
                Picks{' '}
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {l.picks}
                </span>
              </span>

              <span className="w-16 shrink-0 text-right text-base font-semibold tabular-nums">
                {l.total}
              </span>
              <span className="shrink-0 text-xs text-zinc-400">pts total</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
