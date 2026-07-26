import { notFound } from 'next/navigation';
import TournoiNav from '../TournoiNav';
import { loadEngineData, tourCourantMatches } from '@/supabase/queries';
import { getProjections, ROUND_TITRE } from '@/supabase/projections';

export const dynamic = 'force-dynamic';

/** Une probabilité se lit mieux en %, avec une décimale sous les 10 %. */
function pourcent(p: number): string {
  if (p <= 0) return '—';
  if (p >= 0.995) return '100 %';
  return `${(p * 100).toFixed(p < 0.1 ? 1 : 0)} %`;
}

/** Fond d'autant plus marqué que la probabilité est forte. */
function intensite(p: number): string {
  if (p <= 0) return 'text-zinc-300 dark:text-zinc-700';
  if (p >= 0.5) return 'bg-emerald-100 font-semibold dark:bg-emerald-950';
  if (p >= 0.25) return 'bg-emerald-50 dark:bg-emerald-950/50';
  if (p >= 0.1) return 'bg-zinc-50 dark:bg-zinc-900';
  return 'text-zinc-500';
}

export default async function PredictionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const engine = await loadEngineData(id);
  if (!engine) notFound();
  const { tournament, matchRows, players } = engine;
  const rounds = tournament.rounds ?? [];

  // On simule depuis le tour en cours : seuls les survivants réels y figurent,
  // ce qui donne exactement « les joueurs encore en lice ». Même cache que
  // l'écran picks (tn_projections, indexé par from_round) — rien n'est
  // recalculé si la page picks est déjà passée par là.
  const tourCourant = tourCourantMatches(matchRows, rounds);

  // Tournoi entièrement joué : tourCourantMatches se replie sur le premier
  // tour, et la simulation redevient donc celle d'avant-tournoi. Personne
  // n'est plus « en lice » — on le dit plutôt que d'afficher 96 survivants.
  const indecis: string[] = ['scheduled', 'live'];
  const termine =
    matchRows.length > 0 && !matchRows.some((m) => indecis.includes(m.status));

  if (!tourCourant) {
    return (
      <div className="space-y-5">
        <TournoiNav id={id} nom={tournament.name} active="predictions" />
        <p className="text-sm text-zinc-500">Aucun tour à simuler.</p>
      </div>
    );
  }

  const { presence } = await getProjections(engine, tourCourant);

  // Colonnes : tous les tours restants, puis le titre.
  const depuis = rounds.indexOf(tourCourant);
  const coloness = rounds.slice(depuis === -1 ? 0 : depuis);

  const lignes = Object.keys(presence)
    .map((playerId) => {
      const p = players[playerId];
      const parTour = presence[playerId] ?? {};
      return {
        playerId,
        nom: p?.name ?? playerId,
        rang: p?.rank ?? null,
        pays: p?.country ?? null,
        titre: parTour[ROUND_TITRE] ?? 0,
        parTour,
      };
    })
    // « Encore en lice » : présent au tour courant.
    .filter((l) => (l.parTour[tourCourant] ?? 0) > 0)
    .sort((a, b) => b.titre - a.titre || a.nom.localeCompare(b.nom));

  const sommeTitres = lignes.reduce((s, l) => s + l.titre, 0);

  return (
    <div className="space-y-5">
      <TournoiNav id={id} nom={tournament.name} active="predictions" />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-zinc-500">
          {termine ? (
            <>
              Tournoi terminé : projections telles qu&apos;elles étaient{' '}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                avant le {tourCourant}
              </span>
              , conservées à titre rétrospectif.
            </>
          ) : (
            <>
              Probabilité d&apos;atteindre chaque tour, simulation Monte Carlo
              depuis les{' '}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {tourCourant}
              </span>
              .
            </>
          )}
        </p>
        <p className="text-xs text-zinc-400">
          {lignes.length} {termine ? 'joueurs au départ' : 'joueurs encore en lice'}
        </p>
      </div>

      {lignes.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Aucune projection disponible pour ce tournoi.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <th className="py-2 pr-3 font-medium">Joueur</th>
                <th className="py-2 pr-3 text-right font-medium">Rang</th>
                {coloness.map((r) => (
                  <th key={r} className="py-2 pr-3 text-right font-medium">
                    {r}
                  </th>
                ))}
                <th className="py-2 pr-3 text-right font-medium">Titre</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr
                  key={l.playerId}
                  className="border-b border-zinc-100 dark:border-zinc-900"
                >
                  <td className="py-1.5 pr-3 font-medium">
                    {l.nom}
                    {l.pays && (
                      <span className="ml-1.5 text-xs text-zinc-400">{l.pays}</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-500">
                    {l.rang ?? '—'}
                  </td>
                  {coloness.map((r) => {
                    const p = l.parTour[r] ?? 0;
                    return (
                      <td
                        key={r}
                        className={`py-1.5 pr-3 text-right tabular-nums ${intensite(p)}`}
                      >
                        {pourcent(p)}
                      </td>
                    );
                  })}
                  <td
                    className={`py-1.5 pr-3 text-right tabular-nums ${intensite(l.titre)}`}
                  >
                    {pourcent(l.titre)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-zinc-300 text-xs text-zinc-500 dark:border-zinc-700">
                <td colSpan={2 + coloness.length} className="py-2 pr-3 text-right">
                  Somme des probabilités de titre
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {pourcent(sommeTitres)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
