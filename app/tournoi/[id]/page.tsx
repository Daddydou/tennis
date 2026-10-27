import Link from 'next/link';
import { notFound } from 'next/navigation';
import TournoiNav from './TournoiNav';
import { pointsBracketParStock, pointsPicksParStock, stocksDuGroupe } from './pointsStock';
import { boutonPrimaire, boutonSecondaire, carte, zoneTactile } from '@/app/ui';
import {
  avancementPicks,
  getTournament,
  getMatchRows,
  getParticipants,
  getBracketRoundPicks,
  getTousLesPicks,
  tourCourantMatches,
} from '@/db/queries';

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
  // « Matchs en cours » (état du tableau) et « tour à picker » (avancement
  // de CHAQUE stock) sont deux notions distinctes : on affiche les deux,
  // nommées, plutôt qu'un « tour actuel » qui contredisait l'onglet Picks.
  const tourEnJeu = tourCourantMatches(matchRows, rounds);
  const avancements = stocks.map((s) => {
    const { parTour, tourCourant } = avancementPicks(
      rounds,
      matchRows,
      tousLesPicks.filter((p) => (p.participant_id ?? null) === s.id),
    );
    const t = parTour.find((x) => x.round === tourCourant);
    return {
      ...s,
      tour: tourCourant,
      faits: t?.faits ?? 0,
      requis: t?.requis ?? 0,
    };
  });
  const moi = avancements[0];
  const resteMoi = moi ? Math.max(0, moi.requis - moi.faits) : 0;

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

      {/* ── La décision du moment : mes picks du tour ouvert, puis où en sont
          les autres. C'est ce qu'on vient chercher quand un tour s'ouvre. ── */}
      {matchRows.length > 0 && moi?.tour && (
        <section className={`${carte} space-y-3 p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {resteMoi > 0
                  ? `Tour ${moi.tour} : ${resteMoi} pick${resteMoi > 1 ? 's' : ''} à poser`
                  : `Tour ${moi.tour} : mes picks sont posés ✓`}
              </h2>
              <p className="text-sm text-zinc-600">
                {moi.faits}/{moi.requis} posé{moi.faits > 1 ? 's' : ''}
                {tourEnJeu && ` · matchs en cours : ${tourEnJeu}`}
              </p>
            </div>
            <Link
              href={`/tournoi/${id}/picks`}
              className={resteMoi > 0 ? boutonPrimaire : boutonSecondaire}
            >
              {resteMoi > 0 ? 'Poser mes picks' : 'Voir mes picks'}
            </Link>
          </div>
          {avancements.length > 1 && (
            <ul className="flex flex-wrap gap-x-5 gap-y-1 border-t border-zinc-100 pt-3 text-sm text-zinc-600">
              {avancements.slice(1).map((a) => (
                <li key={a.id ?? 'moi'}>
                  <Link
                    href={`/tournoi/${id}/picks?participant=${a.id}`}
                    className={`${zoneTactile} gap-1.5 hover:text-zinc-900`}
                  >
                    <span className="font-medium text-zinc-900">{a.nom}</span>
                    <span className="tabular-nums">
                      {a.tour} {a.faits}/{a.requis}
                      {a.requis > 0 && a.faits >= a.requis ? ' ✓' : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {matchRows.length === 0 ? (
        <p className="text-sm text-zinc-600">
          Aucun match importé pour ce tournoi — rends-toi sur l&apos;onglet Tableau.
        </p>
      ) : (
        <section className="space-y-2.5">
          <h2 className="text-sm font-semibold">Classement</h2>
          {lignes.map((l, i) => {
            // Le meneur ressort par le trophée et le poids du total — jamais
            // par le bleu, réservé aux actions (DESIGN.md).
            const enTete = i === 0 && l.total > 0;
            return (
              <div key={l.id ?? 'moi'} className={carte}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 p-3 pl-4">
                  <span className="w-5 shrink-0 text-sm tabular-nums text-zinc-500">{i + 1}.</span>
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
                        className="font-medium text-amber-700"
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
                    <span className="text-xs text-zinc-500">pts</span>
                  </span>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
