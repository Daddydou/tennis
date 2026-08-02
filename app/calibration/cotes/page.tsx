import Link from 'next/link';
import BoutonCotes from './BoutonCotes';
import { listTournaments } from '@/supabase/queries';
import { loadEngineData, surfacePourElo } from '@/supabase/queries';
import { eloEffectifResolu, type ElosResolus } from '@/supabase/elo';
import {
  chargerCotes,
  cleCotesConfiguree,
  compterCotesParTournoi,
  listerSportsTennis,
} from '@/supabase/cotes';
import { blendAvecCotes, pVictoire } from '@/lib/elo';
import { ecartRelatif, scorerMethode, type Prediction } from '@/lib/cotes';

export const dynamic = 'force-dynamic';

/** Poids de l'Elo dans le mélange. 50/50 au départ, comme demandé. */
const POIDS_ELO = 0.5;

const pct = (p: number | null) =>
  p === null || !Number.isFinite(p) ? '—' : `${(p * 100).toFixed(1)} %`;

/**
 * Devine la clé de sport correspondant au tournoi, pour présélectionner la
 * bonne entrée dans la liste. Simple aide à la saisie : le choix reste manuel.
 */
function sportSuggere(
  sports: { key: string; title: string }[],
  slug: string | null,
  tour: string,
): string | null {
  if (!slug) return null;
  const jetons = slug.split('-').filter((j) => j.length > 3);
  const circuit = tour.toLowerCase();
  const candidat = sports.find(
    (s) =>
      s.key.startsWith(`tennis_${circuit}`) &&
      jetons.some((j) => s.key.includes(j) || s.title.toLowerCase().includes(j)),
  );
  return candidat?.key ?? null;
}

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
  const cotes = tournoiId ? await chargerCotes(tournoiId) : [];

  /* ── Confrontation des trois méthodes sur les matchs joués ── */
  const surfElo = engine ? surfacePourElo(engine.tournament.surface) : 'hard';
  const eloDe = (pid: string): number | null => {
    const e = engine?.elos[pid] as ElosResolus | undefined;
    return e ? eloEffectifResolu(e, surfElo) : null;
  };

  interface LigneVue {
    nomA: string;
    nomB: string;
    favori: string | null;
    pEloFavori: number | null;
    pCotesFavori: number | null;
    pBlendFavori: number | null;
    vainqueur: string | null;
    favoriGagne: boolean | null;
    bookmakers: number;
    apparie: boolean;
  }

  const vues: LigneVue[] = [];
  const predElo: Prediction[] = [];
  const predCotes: Prediction[] = [];
  const predBlend: Prediction[] = [];

  for (const c of cotes) {
    const a = c.player_a_id;
    const b = c.player_b_id;
    const apparie = Boolean(a && b);

    const eloA = a ? eloDe(a) : null;
    const eloB = b ? eloDe(b) : null;
    const pEloA = eloA !== null && eloB !== null ? pVictoire(eloA, eloB) : null;
    const pCotesA = c.proba_a;
    const pBlendA =
      pEloA !== null && pCotesA !== null
        ? blendAvecCotes(pEloA, pCotesA, POIDS_ELO)
        : null;

    // Résultat réel : on lit ici le vainqueur, ce que les écrans de pronostic
    // s'interdisent — c'est précisément l'objet de la mesure.
    const match =
      apparie && engine
        ? engine.matches.find(
            (m) =>
              m.players.some((p) => p.id === a) && m.players.some((p) => p.id === b),
          )
        : undefined;
    const vainqueurId = match?.players.find((p) => p.winner)?.id ?? null;
    const aGagne = vainqueurId === null ? null : vainqueurId === a;

    if (aGagne !== null && pEloA !== null && pCotesA !== null && pBlendA !== null) {
      predElo.push({ p: pEloA, gagne: aGagne });
      predCotes.push({ p: pCotesA, gagne: aGagne });
      predBlend.push({ p: pBlendA, gagne: aGagne });
    }

    // Affichage orienté sur le favori de l'Elo, comme demandé.
    const favoriEstA = pEloA === null ? true : pEloA >= 0.5;
    const nomJoueur = (pid: string | null, repli: string) =>
      (pid && engine?.players[pid]?.name) || repli;
    vues.push({
      nomA: nomJoueur(a, c.nom_a),
      nomB: nomJoueur(b, c.nom_b),
      favori: favoriEstA ? nomJoueur(a, c.nom_a) : nomJoueur(b, c.nom_b),
      pEloFavori: pEloA === null ? null : favoriEstA ? pEloA : 1 - pEloA,
      pCotesFavori: pCotesA === null ? null : favoriEstA ? pCotesA : 1 - pCotesA,
      pBlendFavori: pBlendA === null ? null : favoriEstA ? pBlendA : 1 - pBlendA,
      vainqueur: vainqueurId ? nomJoueur(vainqueurId, '—') : null,
      favoriGagne:
        aGagne === null ? null : favoriEstA ? aGagne : !aGagne,
      bookmakers: c.bookmakers,
      apparie,
    });
  }

  const scores = [
    scorerMethode('Elo seul', predElo),
    scorerMethode('Cotes seules', predCotes),
    scorerMethode(`Blend ${POIDS_ELO * 100}/${100 - POIDS_ELO * 100}`, predBlend),
  ];
  const refBrier = scores[0].brier;
  const refLog = scores[0].logLoss;
  const meilleurBrier = Math.min(...scores.filter((s) => s.n > 0).map((s) => s.brier));

  const nonApparies = vues.filter((v) => !v.apparie);
  const tournoiCourant = tournois.find((t) => t.id === tournoiId);

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Blend Elo / cotes — évaluation</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Le marché intègre ce que l&apos;Elo ignore : blessures, forme, motivation.
          Cet écran mesure si le mélanger améliore vraiment les prédictions —{' '}
          <strong>rien n&apos;est branché</strong> : ni les picks, ni le fantasy, ni la
          simulation ne lisent ces cotes. Les trois méthodes sont jugées au score de
          Brier et à la log-loss, tous deux «&nbsp;plus bas = mieux&nbsp;».
        </p>
      </div>

      {!cleOk && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
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
              className={`rounded border px-2 py-1 ${
                actif
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                  : n > 0
                    ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400'
                    : 'border-zinc-300 text-zinc-500 hover:border-zinc-500 dark:border-zinc-700'
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
        <div className="space-y-2 rounded border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-sm">
            <span className="font-medium">{tournoiCourant.name}</span>{' '}
            <span className="text-zinc-500">
              — {cotes.length} rencontre(s) en cache
              {cotes.length > 0 &&
                ` · ${scores[0].n} évaluable(s) (appariées et jouées)`}
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
            <p className="text-xs text-red-600 dark:text-red-400">
              Liste des sports indisponible : {erreurSports}
            </p>
          )}
        </div>
      )}

      {/* ── Scores de calibration ── */}
      {scores[0].n > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <th className="py-2 pr-3 font-medium">Méthode</th>
                <th className="py-2 pr-3 text-right font-medium">Matchs</th>
                <th className="py-2 pr-3 text-right font-medium">Brier</th>
                <th className="py-2 pr-3 text-right font-medium">vs Elo</th>
                <th className="py-2 pr-3 text-right font-medium">Log-loss</th>
                <th className="py-2 pr-3 text-right font-medium">vs Elo</th>
                <th className="py-2 pr-3 text-right font-medium">Favori gagnant</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((s) => {
                const eb = ecartRelatif(s.brier, refBrier);
                const el = ecartRelatif(s.logLoss, refLog);
                const gagnant = s.brier === meilleurBrier;
                return (
                  <tr
                    key={s.methode}
                    className={`border-b border-zinc-100 dark:border-zinc-900 ${
                      gagnant ? 'bg-emerald-50 dark:bg-emerald-950/40' : ''
                    }`}
                  >
                    <td className="py-1.5 pr-3 font-medium">
                      {s.methode}
                      {gagnant && (
                        <span className="ml-1.5 text-[10px] uppercase text-emerald-700 dark:text-emerald-400">
                          meilleur
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-500">
                      {s.n}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                      {s.brier.toFixed(4)}
                    </td>
                    <td
                      className={`py-1.5 pr-3 text-right font-mono tabular-nums ${
                        eb === null || Math.abs(eb) < 0.05
                          ? 'text-zinc-400'
                          : eb < 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {eb === null ? '—' : `${eb > 0 ? '+' : ''}${eb.toFixed(1)} %`}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                      {s.logLoss.toFixed(4)}
                    </td>
                    <td
                      className={`py-1.5 pr-3 text-right font-mono tabular-nums ${
                        el === null || Math.abs(el) < 0.05
                          ? 'text-zinc-400'
                          : el < 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {el === null ? '—' : `${el > 0 ? '+' : ''}${el.toFixed(1)} %`}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-500">
                      {pct(s.exactitude)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-zinc-400">
            {scores[0].n} match(s) évalué(s). Un écart lu sur si peu de matchs est
            dominé par le bruit : c&apos;est une collecte, pas encore une conclusion —
            même prudence que les autres écrans de calibration.
          </p>
        </div>
      ) : (
        <div className="rounded border border-zinc-200 p-3 text-sm text-zinc-500 dark:border-zinc-800">
          <p className="font-medium text-zinc-700 dark:text-zinc-300">
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
        <div className="overflow-x-auto">
          <h2 className="mb-2 text-sm font-semibold">Détail par match</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <th className="py-2 pr-3 font-medium">Match</th>
                <th className="py-2 pr-3 text-right font-medium">P(favori) Elo</th>
                <th className="py-2 pr-3 text-right font-medium">P(favori) cotes</th>
                <th className="py-2 pr-3 text-right font-medium">P(favori) blend</th>
                <th className="py-2 pr-3 font-medium">Vainqueur réel</th>
              </tr>
            </thead>
            <tbody>
              {vues.map((v, i) => (
                <tr
                  key={`${v.nomA}-${v.nomB}-${i}`}
                  className="border-b border-zinc-100 dark:border-zinc-900"
                >
                  <td className="py-1.5 pr-3">
                    <span className={v.apparie ? '' : 'text-amber-700 dark:text-amber-400'}>
                      {v.nomA} <span className="text-zinc-400">vs</span> {v.nomB}
                    </span>
                    {!v.apparie && (
                      <span
                        className="ml-1.5 rounded border border-amber-300 px-1 text-[10px] text-amber-700 dark:border-amber-800 dark:text-amber-400"
                        title="Au moins un des deux joueurs n’a pas été apparié au tableau : ce match est exclu du score."
                      >
                        non apparié
                      </span>
                    )}
                    {v.bookmakers > 0 && (
                      <span className="ml-1.5 text-[10px] text-zinc-400">
                        {v.bookmakers} book{v.bookmakers > 1 ? 's' : ''}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                    {pct(v.pEloFavori)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                    {pct(v.pCotesFavori)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                    {pct(v.pBlendFavori)}
                  </td>
                  <td className="py-1.5 pr-3">
                    {v.vainqueur === null ? (
                      <span className="text-zinc-400">pas encore joué</span>
                    ) : (
                      <span
                        className={
                          v.favoriGagne
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }
                      >
                        {v.vainqueur}
                        <span className="ml-1 text-[10px] text-zinc-400">
                          {v.favoriGagne ? '(favori)' : '(surprise)'}
                        </span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {nonApparies.length > 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              {nonApparies.length} rencontre(s) non appariée(s) au tableau, conservées
              et affichées mais exclues du score : soit le joueur n&apos;est pas dans ce
              tournoi (clé de sport trop large), soit son nom ne se rapproche pas
              (cf. <code>lib/matching.ts</code>).
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-zinc-400">
        Probabilités dévigorisées (1/cote, puis normalisation à somme 1) et agrégées
        par la médiane des bookmakers. Le mélange applique{' '}
        <code>blendAvecCotes</code> (<code>lib/elo.ts</code>) à{' '}
        {POIDS_ELO * 100} % d&apos;Elo. Les cotes sont mises en cache dans{' '}
        <code>tn_odds</code> : l&apos;affichage ne consomme jamais de quota, seul le
        bouton le fait.{' '}
        <Link href="/calibration" className="underline">
          Retour à la calibration
        </Link>
      </p>
    </div>
  );
}
