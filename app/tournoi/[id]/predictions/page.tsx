import { notFound } from 'next/navigation';
import { after } from 'next/server';
import TournoiNav from '../TournoiNav';
import NoteCotesUtilisees from '../NoteCotesUtilisees';
import { loadEngineData, tourCourantMatches } from '@/db/queries';
import { computeAndStoreProjections, projectionsEnCache, ROUND_TITRE } from '@/db/projections';
import { chargerBlendProduction } from '@/db/cotesBlend';
import { estIndecis } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Une probabilité se lit mieux en %, avec une décimale sous les 10 %. */
function pourcent(p: number): string {
  if (p <= 0) return '—';
  if (p >= 0.995) return '100 %';
  return `${(p * 100).toFixed(p < 0.1 ? 1 : 0)} %`;
}

/** Fond d'autant plus marqué que la probabilité est forte. */
function intensite(p: number): string {
  if (p <= 0) return 'text-zinc-300';
  if (p >= 0.5) return 'bg-emerald-100 font-semibold';
  if (p >= 0.25) return 'bg-emerald-50';
  if (p >= 0.1) return 'bg-zinc-50';
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
  const termine =
    matchRows.length > 0 && !matchRows.some((m) => estIndecis(m.status));

  if (!tourCourant) {
    return (
      <div className="space-y-5">
        <TournoiNav id={id} nom={tournament.name} active="predictions" />
        <p className="text-sm text-zinc-500">Aucun tour à simuler.</p>
      </div>
    );
  }

  // NE BLOQUE JAMAIS sur un cache tn_projections froid (même correctif que
  // Picks/Simulateur/Fantasy/Résultats, cf. db/reference.ts et mémoire
  // perf-resultats-chargerreference) : `getProjections` relançait ICI une
  // simulation Monte Carlo (20 000 tirages) dès que ce tour n'avait jamais
  // été visité — mesuré à 30-52 s sur un tableau de 128, largement au-dessus
  // du timeout d'une fonction Vercel. Un cache manquant est ignoré POUR CETTE
  // REQUÊTE (aucun joueur affiché, signalé) et son calcul programmé en
  // arrière-plan via `after()`.
  const depuisCache = await projectionsEnCache(id, tourCourant);
  const presence = depuisCache?.presence ?? {};
  const projectionsEnCalcul = !depuisCache;
  if (projectionsEnCalcul) {
    after(async () => {
      try {
        await computeAndStoreProjections(engine, tourCourant);
      } catch (e) {
        console.error(`Projections en arrière-plan (${tourCourant}) :`, (e as Error).message);
      }
    });
  }

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

  // Traçabilité du blend Elo/cotes (cf. db/cotesBlend.ts) : indépendante
  // du cache tn_projections, toujours à jour — une lecture légère de tn_odds,
  // jamais une resimulation.
  const { coteUtilisables } = await chargerBlendProduction(id);

  return (
    <div className="space-y-5">
      <TournoiNav id={id} nom={tournament.name} active="predictions" />
      <NoteCotesUtilisees n={coteUtilisables} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-zinc-500">
          {termine ? (
            <>
              Tournoi terminé : projections telles qu&apos;elles étaient{' '}
              <span className="font-medium text-zinc-700">
                avant le {tourCourant}
              </span>
              , conservées à titre rétrospectif.
            </>
          ) : (
            <>
              Probabilité d&apos;atteindre chaque tour, simulation Monte Carlo
              depuis les{' '}
              <span className="font-medium text-zinc-700">
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

      {projectionsEnCalcul ? (
        <p className="text-sm text-zinc-500">
          Simulation Monte Carlo pas encore en cache pour le tour {tourCourant}
          — calcul lancé en arrière-plan, recharge la page dans un instant.
        </p>
      ) : lignes.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Aucune projection disponible pour ce tournoi.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
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
                  className="border-b border-zinc-100"
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
              <tr className="border-t-2 border-zinc-300 text-xs text-zinc-500">
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
