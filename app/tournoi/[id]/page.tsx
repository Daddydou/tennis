import Link from 'next/link';
import { notFound } from 'next/navigation';
import TournoiNav from './TournoiNav';
import { pointsBracketParStock, pointsPicksParStock, stocksDuGroupe } from './pointsStock';
import { lienBouton } from '@/app/ui';
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Tour actuel : <span className="font-semibold text-zinc-800">{tourActuel ?? '—'}</span>
        </p>
        <div className="flex gap-2">
          <Link href={`/tournoi/${id}/picks`} className={lienBouton}>
            Picks →
          </Link>
          <Link href={`/tournoi/${id}/bracket`} className={lienBouton}>
            Bracket →
          </Link>
        </div>
      </div>

      {matchRows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Aucun match importé pour ce tournoi — rends-toi sur l&apos;onglet Tableau.
        </p>
      ) : (
        <div className="space-y-2.5">
          {lignes.map((l, i) => {
            // Le meneur ressort du lot (accent + fond teinté) : c'est
            // l'information qu'on vient chercher en premier sur ce classement.
            const enTete = i === 0 && l.total > 0;
            return (
              <div
                key={l.id ?? 'moi'}
                className={`relative overflow-hidden rounded-2xl pl-4 shadow-card ${enTete ? 'bg-blue-50' : 'bg-white'}`}
              >
                {enTete && <span className="absolute inset-y-0 left-0 w-1.5 bg-blue-600" aria-hidden="true" />}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 p-3">
                  <span className="w-5 shrink-0 text-sm text-zinc-400">{i + 1}.</span>
                  <span className="flex-1 truncate text-base font-semibold">
                    {enTete && '🏆 '}
                    {l.nom}
                  </span>

                  <span className="shrink-0 text-xs text-zinc-500">
                    Bracket{' '}
                    {l.aBracket ? (
                      <span className="font-semibold tabular-nums text-zinc-900">{l.bracket}</span>
                    ) : (
                      <span
                        className="font-medium text-amber-600"
                        title="Aucun bracket de ce participant importé (onglet Simulateur → Bracket → Importer)"
                      >
                        à importer
                      </span>
                    )}
                  </span>

                  <span className="shrink-0 text-xs text-zinc-500">
                    Picks <span className="font-semibold tabular-nums text-zinc-900">{l.picks}</span>
                  </span>

                  <span className="ml-auto flex shrink-0 items-baseline gap-1.5">
                    <span className="text-2xl font-bold tabular-nums leading-none">{l.total}</span>
                    <span className="text-xs text-zinc-400">pts</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
