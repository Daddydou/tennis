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
import {
  creerLecteurEloAnterieur,
  eloAnterieur,
  type EloALaDate,
} from '@/supabase/elo-historique';
import { blendAvecCotes, pVictoire } from '@/lib/elo';
import {
  ecartRelatif,
  scorerMethode,
  type Prediction,
  type ScoreMethode,
} from '@/lib/cotes';

export const dynamic = 'force-dynamic';

/** Poids de l'Elo dans le mélange. 50/50 au départ, comme demandé. */
const POIDS_ELO = 0.5;

/**
 * Second mélange, qui pèse davantage le marché que l'Elo. Il ne remplace pas le
 * 50/50 : les deux sont mesurés côte à côte, pour voir lequel calibre le mieux.
 */
const POIDS_ELO_MARCHE = 0.3;

/** « Blend 30/70 » — poids Elo d'abord, poids cotes ensuite. */
const libelleBlend = (poidsElo: number) =>
  `Blend ${Math.round(poidsElo * 100)}/${Math.round((1 - poidsElo) * 100)}`;

const pct = (p: number | null) =>
  p === null || !Number.isFinite(p) ? '—' : `${(p * 100).toFixed(1)} %`;

/** Cellule d'écart relatif : vert si meilleur que la référence, rouge sinon. */
function CelluleEcart({ valeur }: { valeur: number | null }) {
  return (
    <td
      className={`py-1.5 pr-3 text-right font-mono tabular-nums ${
        valeur === null || Math.abs(valeur) < 0.05
          ? 'text-zinc-400'
          : valeur < 0
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-red-600 dark:text-red-400'
      }`}
    >
      {valeur === null ? '—' : `${valeur > 0 ? '+' : ''}${valeur.toFixed(1)} %`}
    </td>
  );
}

/**
 * Les quatre méthodes d'un corpus, jugées au Brier et à la log-loss.
 *
 * Les colonnes « vs Elo » comparent à la PREMIÈRE ligne du tableau, donc à
 * l'Elo du corpus considéré : dans le tableau propre c'est l'Elo antérieur,
 * dans celui d'en dessous l'Elo courant. Comparer un blend à l'Elo d'un autre
 * corpus ne voudrait rien dire.
 */
function TableScores({
  scores,
  refBrier,
  refLog,
  meilleurBrier,
}: {
  scores: ScoreMethode[];
  refBrier: number;
  refLog: number;
  meilleurBrier: number | null;
}) {
  return (
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
            const gagnant = meilleurBrier !== null && s.brier === meilleurBrier;
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
                <CelluleEcart valeur={ecartRelatif(s.brier, refBrier)} />
                <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                  {s.logLoss.toFixed(4)}
                </td>
                <CelluleEcart valeur={ecartRelatif(s.logLoss, refLog)} />
                <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-500">
                  {pct(s.exactitude)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

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

  /* ── Confrontation des méthodes sur les matchs joués ──────────────────────
   *
   * DEUX ÉVALUATIONS, JAMAIS CONFONDUES.
   *
   * 1. PROPRE — l'Elo de chaque joueur tel qu'il était AVANT le match (dernier
   *    relevé Tennis Abstract strictement antérieur, cf. elo-historique.ts).
   *    C'est la seule méthodologiquement valide : les cotes, elles, sont par
   *    construction capturées avant la rencontre, et les comparer à un Elo
   *    postérieur reviendrait à faire courir les deux sur des pistes de
   *    longueurs différentes.
   *
   * 2. POUR MÉMOIRE — l'Elo COURANT, celui de `ta_elo`. Il a déjà intégré le
   *    résultat du match : le vainqueur en est ressorti relevé, le perdant
   *    abaissé, si bien qu'a posteriori le favori est en partie désigné PAR
   *    son résultat. Le biais a un sens connu — l'Elo paraît meilleur qu'il
   *    ne l'est. On garde la mesure pour pouvoir LIRE cet écart, pas pour
   *    conclure avec.
   *
   * L'archive ne remonte pas le temps (cf. migration 0010) : sur les tournois
   * déjà en base, l'évaluation propre est vide, et c'est normal. Elle se
   * remplira avec les tournois à venir.
   */
  const surfElo = engine ? surfacePourElo(engine.tournament.surface) : 'hard';
  const eloDe = (pid: string): number | null => {
    const e = engine?.elos[pid] as ElosResolus | undefined;
    return e ? eloEffectifResolu(e, surfElo) : null;
  };

  const lecteur = creerLecteurEloAnterieur();
  const joueurDe = new Map((engine?.playerRows ?? []).map((p) => [p.id, p]));

  /** Elo effectif d'un joueur dans un état daté. null s'il n'y figure pas. */
  const eloAvantDe = (pid: string | null, etat: EloALaDate | null): number | null => {
    const p = pid ? joueurDe.get(pid) : undefined;
    const e = p ? eloAnterieur(p, etat) : null;
    return e ? eloEffectifResolu(e, surfElo) : null;
  };

  /** Pourquoi un match n'entre pas dans l'évaluation propre. */
  type SansAnterieur = 'instantane' | 'joueur';

  interface LigneVue {
    nomA: string;
    nomB: string;
    favori: string | null;
    pEloFavori: number | null;
    pEloAvantFavori: number | null;
    pCotesFavori: number | null;
    /** Mélanges de l'évaluation PROPRE : ils partent de l'Elo antérieur. */
    pBlendFavori: number | null;
    pBlendMarcheFavori: number | null;
    vainqueur: string | null;
    favoriGagne: boolean | null;
    bookmakers: number;
    apparie: boolean;
    /** Relevé Elo utilisé pour ce match, quand il en existe un. */
    releveLe: string | null;
    sansAnterieur: SansAnterieur | null;
  }

  const vues: LigneVue[] = [];

  // Corpus « pour mémoire » : Elo courant.
  const predElo: Prediction[] = [];
  const predCotes: Prediction[] = [];
  const predBlend: Prediction[] = [];
  const predBlendMarche: Prediction[] = [];

  // Corpus « propre » : Elo antérieur au match. Sous-ensemble du précédent.
  const predEloAvant: Prediction[] = [];
  const predCotesPropre: Prediction[] = [];
  const predBlendAvant: Prediction[] = [];
  const predBlendMarcheAvant: Prediction[] = [];

  // Matchs évaluables aujourd'hui mais exclus de l'évaluation propre, par
  // motif. Comptés et affichés : une mesure qui porte silencieusement sur un
  // sous-ensemble ne vaut rien.
  let sansInstantane = 0;
  let sansEloJoueur = 0;

  for (const c of cotes) {
    const a = c.player_a_id;
    const b = c.player_b_id;
    const apparie = Boolean(a && b);

    const eloA = a ? eloDe(a) : null;
    const eloB = b ? eloDe(b) : null;
    const pEloA = eloA !== null && eloB !== null ? pVictoire(eloA, eloB) : null;
    const pCotesA = c.proba_a;
    const melangeable = pEloA !== null && pCotesA !== null;
    const pBlendA = melangeable ? blendAvecCotes(pEloA, pCotesA, POIDS_ELO) : null;
    const pBlendMarcheA = melangeable
      ? blendAvecCotes(pEloA, pCotesA, POIDS_ELO_MARCHE)
      : null;

    // Date du match : l'heure de coup d'envoi annoncée par le bookmaker, la
    // seule date par match dont on dispose. À défaut, le début du tournoi —
    // antérieur à toutes ses rencontres, donc jamais optimiste.
    const dateMatch = c.commence_time ?? engine?.tournament.start_date ?? null;
    const etat = engine
      ? await lecteur.avant(engine.tournament.tour, dateMatch)
      : null;

    const eloAvantA = eloAvantDe(a, etat);
    const eloAvantB = eloAvantDe(b, etat);
    const pEloAvantA =
      eloAvantA !== null && eloAvantB !== null
        ? pVictoire(eloAvantA, eloAvantB)
        : null;
    const melangeableAvant = pEloAvantA !== null && pCotesA !== null;
    const pBlendAvantA = melangeableAvant
      ? blendAvecCotes(pEloAvantA, pCotesA, POIDS_ELO)
      : null;
    const pBlendMarcheAvantA = melangeableAvant
      ? blendAvecCotes(pEloAvantA, pCotesA, POIDS_ELO_MARCHE)
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

    const evaluable =
      aGagne !== null &&
      pEloA !== null &&
      pCotesA !== null &&
      pBlendA !== null &&
      pBlendMarcheA !== null;

    if (evaluable) {
      predElo.push({ p: pEloA, gagne: aGagne });
      predCotes.push({ p: pCotesA, gagne: aGagne });
      predBlend.push({ p: pBlendA, gagne: aGagne });
      predBlendMarche.push({ p: pBlendMarcheA, gagne: aGagne });
    }

    // Un match n'est exclu de l'évaluation propre que s'il aurait pu y entrer :
    // compter comme « sans Elo antérieur » une rencontre non appariée ou non
    // jouée mélangerait deux motifs différents.
    let sansAnterieur: SansAnterieur | null = null;
    if (evaluable) {
      if (pEloAvantA !== null && pBlendAvantA !== null && pBlendMarcheAvantA !== null) {
        predEloAvant.push({ p: pEloAvantA, gagne: aGagne });
        predCotesPropre.push({ p: pCotesA, gagne: aGagne });
        predBlendAvant.push({ p: pBlendAvantA, gagne: aGagne });
        predBlendMarcheAvant.push({ p: pBlendMarcheAvantA, gagne: aGagne });
      } else if (etat === null) {
        sansAnterieur = 'instantane';
        sansInstantane++;
      } else {
        sansAnterieur = 'joueur';
        sansEloJoueur++;
      }
    }

    // Affichage orienté sur le favori de l'Elo — celui d'AVANT le match quand
    // on l'a, sinon celui d'aujourd'hui. Les scores, eux, sont indifférents à
    // l'orientation (cf. lib/cotes.ts) : elle ne joue que sur la lisibilité.
    const pOrientation = pEloAvantA ?? pEloA;
    const favoriEstA = pOrientation === null ? true : pOrientation >= 0.5;
    const orienter = (p: number | null) =>
      p === null ? null : favoriEstA ? p : 1 - p;
    const nomJoueur = (pid: string | null, repli: string) =>
      (pid && engine?.players[pid]?.name) || repli;
    vues.push({
      nomA: nomJoueur(a, c.nom_a),
      nomB: nomJoueur(b, c.nom_b),
      favori: favoriEstA ? nomJoueur(a, c.nom_a) : nomJoueur(b, c.nom_b),
      pEloFavori: orienter(pEloA),
      pEloAvantFavori: orienter(pEloAvantA),
      pCotesFavori: orienter(pCotesA),
      // Le détail montre les mélanges de l'évaluation propre : ceux de l'Elo
      // courant n'existent que pour situer le biais, en agrégé.
      pBlendFavori: orienter(pBlendAvantA),
      pBlendMarcheFavori: orienter(pBlendMarcheAvantA),
      vainqueur: vainqueurId ? nomJoueur(vainqueurId, '—') : null,
      favoriGagne:
        aGagne === null ? null : favoriEstA ? aGagne : !aGagne,
      bookmakers: c.bookmakers,
      apparie,
      releveLe: etat?.releveLePlusRecent ?? null,
      sansAnterieur,
    });
  }

  /** Les quatre méthodes d'un corpus, la première servant de référence. */
  const scorer = (libelleElo: string, p: Prediction[][]) => {
    const scores = [
      scorerMethode(libelleElo, p[0]),
      scorerMethode('Cotes seules', p[1]),
      scorerMethode(libelleBlend(POIDS_ELO), p[2]),
      scorerMethode(libelleBlend(POIDS_ELO_MARCHE), p[3]),
    ];
    const evalues = scores.filter((s) => s.n > 0);
    return {
      scores,
      refBrier: scores[0].brier,
      refLog: scores[0].logLoss,
      meilleurBrier: evalues.length
        ? Math.min(...evalues.map((s) => s.brier))
        : null,
    };
  };

  const propre = scorer('Elo antérieur au match', [
    predEloAvant,
    predCotesPropre,
    predBlendAvant,
    predBlendMarcheAvant,
  ]);
  const courant = scorer('Elo courant', [
    predElo,
    predCotes,
    predBlend,
    predBlendMarche,
  ]);

  const nonApparies = vues.filter((v) => !v.apparie);
  const tournoiCourant = tournois.find((t) => t.id === tournoiId);
  /** Relevés effectivement utilisés — l'âge des Elo qui ont servi. */
  const relevesUtilises = [
    ...new Set(vues.map((v) => v.releveLe).filter((r): r is string => r !== null)),
  ].sort();

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
            <p className="text-xs text-red-600 dark:text-red-400">
              Liste des sports indisponible : {erreurSports}
            </p>
          )}
        </div>
      )}

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
                  <p className="text-xs text-amber-700 dark:text-amber-400">
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
              <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
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
                <th className="py-2 pr-3 text-right font-medium">
                  P(favori) Elo antérieur
                </th>
                <th className="py-2 pr-3 text-right font-medium">
                  P(favori) Elo courant
                </th>
                <th className="py-2 pr-3 text-right font-medium">P(favori) cotes</th>
                <th className="py-2 pr-3 text-right font-medium">
                  P(favori) {libelleBlend(POIDS_ELO).toLowerCase()}
                </th>
                <th className="py-2 pr-3 text-right font-medium">
                  P(favori) {libelleBlend(POIDS_ELO_MARCHE).toLowerCase()}
                </th>
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
                    {v.sansAnterieur !== null && (
                      <span
                        className="ml-1.5 rounded border border-violet-300 px-1 text-[10px] text-violet-700 dark:border-violet-800 dark:text-violet-400"
                        title={
                          v.sansAnterieur === 'instantane'
                            ? "Aucun relevé Elo n'est antérieur à ce match : il est exclu de l'évaluation propre."
                            : "Au moins un des deux joueurs est absent du relevé antérieur : il est exclu de l'évaluation propre."
                        }
                      >
                        {v.sansAnterieur === 'instantane'
                          ? 'pas d’Elo antérieur'
                          : 'joueur hors relevé'}
                      </span>
                    )}
                    {v.bookmakers > 0 && (
                      <span className="ml-1.5 text-[10px] text-zinc-400">
                        {v.bookmakers} book{v.bookmakers > 1 ? 's' : ''}
                      </span>
                    )}
                    {v.releveLe && (
                      <span
                        className="ml-1.5 text-[10px] text-zinc-400"
                        title="Relevé Tennis Abstract le plus récent antérieur à ce match."
                      >
                        Elo du {v.releveLe}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                    {pct(v.pEloAvantFavori)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-zinc-500">
                    {pct(v.pEloFavori)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                    {pct(v.pCotesFavori)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                    {pct(v.pBlendFavori)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                    {pct(v.pBlendMarcheFavori)}
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
