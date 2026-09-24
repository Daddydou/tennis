import Link from 'next/link';
import BoutonCotes from './BoutonCotes';
import TableScores from './TableScores';
import TableDetail from './TableDetail';
import EvolutionCotes from './EvolutionCotes';
import { POIDS_ELO, POIDS_ELO_MARCHE } from './constantes';
import { evaluerCotes, sportSuggere } from './evaluation';
import { listTournaments } from '@/db/queries';
import { loadEngineData } from '@/db/queries';
import {
  chargerCotes,
  chargerHistoriqueCotes,
  cleCotesConfiguree,
  compterCotesParTournoi,
  listerSportsTennis,
} from '@/db/cotes';
import { seriesCotes } from '@/lib/cotesEvolution';

export const dynamic = 'force-dynamic';

export default async function CotesPage({
  searchParams,
}: {
  searchParams: Promise<{ tournoi?: string }>;
}) {
  const { tournoi: tournoiParam } = await searchParams;

  const [tournois, comptes] = await Promise.all([
    listTournaments(),
    compterCotesParTournoi(),
  ]);

  // Par défaut, le tournoi qui a déjà des cotes — c'est là qu'il y a quelque
  // chose à lire. À défaut, le plus récent.
  const parDefaut =
    tournois.find((t) => (comptes[t.id] ?? 0) > 0)?.id ?? tournois[0]?.id ?? null;
  const tournoiId =
    tournoiParam && tournois.some((t) => t.id === tournoiParam)
      ? tournoiParam
      : parDefaut;

  const cleOk = cleCotesConfiguree();
  let sports: Awaited<ReturnType<typeof listerSportsTennis>> = [];
  let erreurSports: string | null = null;
  if (cleOk) {
    try {
      sports = await listerSportsTennis();
    } catch (e) {
      erreurSports = (e as Error).message;
    }
  }

  const engine = tournoiId ? await loadEngineData(tournoiId) : null;
  const [cotes, captures] = tournoiId
    ? await Promise.all([chargerCotes(tournoiId), chargerHistoriqueCotes(tournoiId)])
    : [[], []];

  // Confrontation des méthodes sur les matchs joués (cf. evaluation.ts).
  const {
    vues,
    propre,
    courant,
    sansInstantane,
    sansEloJoueur,
    nonApparies,
    relevesUtilises,
  } = await evaluerCotes(engine, cotes);
  const tournoiCourant = tournois.find((t) => t.id === tournoiId);

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Blend Elo / cotes — évaluation</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Le marché intègre ce que l&apos;Elo ignore : blessures, forme, motivation.
          Cet écran mesure si le mélanger améliore vraiment les prédictions —{' '}
          <strong>rien n&apos;est branché</strong> : ni les picks, ni le fantasy, ni la
          simulation ne lisent ces cotes. Les quatre méthodes — dont deux mélanges,
          l&apos;un équilibré, l&apos;autre penché vers le marché — sont jugées au score
          de Brier et à la log-loss, tous deux «&nbsp;plus bas = mieux&nbsp;».
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          L&apos;Elo comparé aux cotes est celui{' '}
          <strong>publié avant la rencontre</strong>, repris dans
          l&apos;archive datée des rapports Tennis Abstract. L&apos;Elo courant
          aurait déjà intégré le résultat du match : le comparer à une cote,
          elle, capturée avant, ferait courir les deux sur des pistes de
          longueurs différentes. Il reste affiché en second, pour que
          l&apos;écart entre les deux se lise.
        </p>
      </div>

      {!cleOk && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Clé The Odds API non configurée.</p>
          <p className="mt-1">
            Renseigner <code>ODDS_API_KEY</code> dans les variables
            d&apos;environnement (Vercel, puis <code>.env.local</code> pour le
            développement). L&apos;écran reste consultable : il lit le cache, et
            n&apos;a besoin de la clé que pour récupérer de nouvelles cotes.
          </p>
        </div>
      )}

      {/* ── Choix du tournoi ── */}
      <nav className="flex flex-wrap gap-1 text-xs">
        {tournois.map((t) => {
          const n = comptes[t.id] ?? 0;
          const actif = t.id === tournoiId;
          return (
            <Link
              key={t.id}
              href={`/calibration/cotes?tournoi=${t.id}`}
              className={`flex min-h-11 items-center rounded-lg border px-2.5 transition active:scale-[0.97] ${
                actif
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : n > 0
                    ? 'border-emerald-300 text-emerald-700'
                    : 'border-zinc-300 text-zinc-500 hover:border-zinc-500'
              }`}
              title={n > 0 ? `${n} cote(s) en cache` : 'aucune cote en cache'}
            >
              {t.name}
              {n > 0 && ` · ${n}`}
            </Link>
          );
        })}
      </nav>

      {tournoiCourant && (
        <div className="space-y-2 rounded-2xl bg-white p-3 shadow-card">
          <p className="text-sm">
            <span className="font-medium">{tournoiCourant.name}</span>{' '}
            <span className="text-zinc-500">
              — {cotes.length} rencontre(s) en cache
              {cotes.length > 0 &&
                ` · ${courant.scores[0].n} appariée(s) et jouée(s) · ${propre.scores[0].n} avec un Elo antérieur`}
            </span>
          </p>
          {cleOk && !erreurSports && (
            <BoutonCotes
              tournamentId={tournoiCourant.id}
              sports={sports}
              sportSuggere={sportSuggere(
                sports,
                tournoiCourant.slug,
                tournoiCourant.tour,
              )}
            />
          )}
          {erreurSports && (
            <p className="text-xs text-red-600">
              Liste des sports indisponible : {erreurSports}
            </p>
          )}
        </div>
      )}

      {tournoiCourant && <EvolutionCotes series={seriesCotes(captures)} />}

      {/* ── Évaluation propre : Elo antérieur au match ── */}
      {courant.scores[0].n > 0 ? (
        <div className="space-y-5">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">
              Évaluation propre — Elo antérieur au match
            </h2>
            {propre.scores[0].n > 0 ? (
              <>
                <TableScores {...propre} />
                <p className="text-xs text-zinc-400">
                  {propre.scores[0].n} match(s) jugé(s) sur l&apos;Elo publié{' '}
                  <strong>avant</strong> la rencontre
                  {relevesUtilises.length > 0 &&
                    ` (relevé${relevesUtilises.length > 1 ? 's' : ''} du ${relevesUtilises.join(', ')})`}
                  . C&apos;est la seule comparaison valide : les cotes sont
                  capturées avant le match, l&apos;Elo doit l&apos;être aussi. Un
                  écart lu sur si peu de matchs reste dominé par le bruit —
                  c&apos;est une collecte, pas encore une conclusion.
                </p>
                {(sansInstantane > 0 || sansEloJoueur > 0) && (
                  <p className="text-xs text-amber-700">
                    {sansInstantane + sansEloJoueur} match(s) écarté(s) de cette
                    évaluation :{' '}
                    {sansInstantane > 0 &&
                      `${sansInstantane} sans aucun relevé antérieur à la rencontre`}
                    {sansInstantane > 0 && sansEloJoueur > 0 && ', '}
                    {sansEloJoueur > 0 &&
                      `${sansEloJoueur} dont un joueur au moins est absent du relevé`}
                    . Ils restent listés plus bas, jamais remplacés par
                    l&apos;Elo courant : un trou se signale, il ne se remplit
                    pas.
                  </p>
                )}
              </>
            ) : (
              <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">
                  Aucun match ne dispose d&apos;un Elo antérieur.
                </p>
                <p className="mt-1">
                  L&apos;archive des Elo (<code>ta_elo_historique</code>) ne
                  remonte pas le temps : Tennis Abstract ne publie que le
                  rapport de la semaine, et l&apos;archive n&apos;accumule que
                  depuis sa mise en place. Aucun tournoi déjà joué n&apos;aura
                  donc d&apos;Elo antérieur — ce sont les tournois à venir qui
                  rempliront cette évaluation, à raison d&apos;un instantané par
                  import d&apos;Elo. Le tableau ci-dessous, lui, reste lisible
                  avec la réserve qui l&apos;accompagne.
                </p>
              </div>
            )}
          </div>

          {/* ── Pour mémoire : Elo courant, donc biaisé ── */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-500">
              Pour mémoire — Elo courant{' '}
              <span className="font-normal">(biais de look-ahead)</span>
            </h2>
            <TableScores {...courant} />
            <p className="text-xs text-zinc-400">
              {courant.scores[0].n} match(s), jugés sur l&apos;Elo{' '}
              <strong>d&apos;aujourd&apos;hui</strong>, qui a déjà intégré leur
              résultat : le vainqueur en est ressorti relevé, le perdant
              abaissé, si bien qu&apos;a posteriori le favori est en partie
              désigné par ce qu&apos;il a fait. Le biais a un sens connu —
              l&apos;Elo y paraît meilleur qu&apos;il ne l&apos;est, donc les
              mélanges moins utiles. À lire comme un repère, pas comme un
              résultat.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white p-3 text-sm text-zinc-500 shadow-card">
          <p className="font-medium text-zinc-700">
            Aucun match évaluable pour ce tournoi.
          </p>
          <p className="mt-1">
            Il en faut trois choses à la fois : des cotes en cache, les deux joueurs
            appariés au tableau, et un résultat connu.{' '}
            <strong>
              Les cotes doivent être capturées avant que le match ne se joue
            </strong>{' '}
            — le palier gratuit de The Odds API ne sert que les rencontres à venir ou
            en cours, l&apos;historique étant payant. Sur un tournoi déjà terminé sans
            capture préalable, il n&apos;y a rien à récupérer.
          </p>
        </div>
      )}

      {/* ── Détail match par match ── */}
      {vues.length > 0 && (
        <TableDetail vues={vues} nonApparies={nonApparies} />
      )}

      <p className="text-xs text-zinc-400">
        Probabilités dévigorisées (1/cote, puis normalisation à somme 1) et agrégées
        par la médiane des bookmakers. Les deux mélanges appliquent{' '}
        <code>blendAvecCotes</code> (<code>lib/elo.ts</code>) aux mêmes entrées, à{' '}
        {Math.round(POIDS_ELO * 100)} % puis {Math.round(POIDS_ELO_MARCHE * 100)} %
        d&apos;Elo — ils ne diffèrent que par ce poids. Les cotes sont mises en cache
        dans{' '}
        <code>tn_odds</code> : l&apos;affichage ne consomme jamais de quota, seul le
        bouton le fait.{' '}
        <Link href="/calibration" className="underline">
          Retour à la calibration
        </Link>
      </p>
    </div>
  );
}
