import Link from 'next/link';
import { calibrerElo } from '@/supabase/calibration';

export const dynamic = 'force-dynamic';

/**
 * CALIBRATION DE LA COURBE ELO → PROBABILITÉ
 *
 * Constat, pas réglage. Le moteur reste en 400 : cette page dit seulement si
 * la constante tient la route sur les matchs réellement joués, et laisse la
 * décision à l'utilisateur — même principe que l'historique Fantasy.
 */

function pourcent(p: number, decimales = 1): string {
  return `${(p * 100).toFixed(decimales)} %`;
}

/** Vert si le modèle colle, rouge s'il s'écarte de plus de 5 points. */
function classeEcart(ecart: number, significatif: boolean): string {
  if (!significatif) return 'text-zinc-400';
  const a = Math.abs(ecart);
  if (a <= 0.02) return 'text-emerald-600 dark:text-emerald-400';
  if (a <= 0.05) return 'text-zinc-700 dark:text-zinc-300';
  return 'text-red-600 dark:text-red-400';
}

export default async function CalibrationPage() {
  const c = await calibrerElo();

  const significatives = c.tranches.filter((t) => t.significatif);
  const meilleure = c.constantes.reduce((a, b) => (b.sse < a.sse ? b : a));
  const moteur = c.constantes.find((x) => x.constante === c.constanteMoteur);

  // Un écart de moins de 50 sur la constante ne change presque rien à la
  // courbe : le dire évite de lire un changement de palier comme un verdict.
  const changementNet =
    Math.abs(c.optimumFin - c.constanteMoteur) >= 50 && significatives.length >= 4;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">
          Calibration Elo → probabilité
        </h1>
        <div className="flex items-center gap-4">
          <Link
            href="/calibration/echelle"
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            Effet sur le Fantasy →
          </Link>
          <Link href="/" className="text-sm text-zinc-500 hover:underline">
            ← Tournois
          </Link>
        </div>
      </div>

      <div className="space-y-1 text-sm text-zinc-500">
        <p>
          Le moteur convertit un écart d&apos;Elo en probabilité de victoire par{' '}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">
            P = 1 / (1 + 10^(−Δ/{c.constanteMoteur}))
          </code>
          . La constante {c.constanteMoteur} vient des échecs. Cette page la
          confronte aux matchs réellement joués.
        </p>
        <p className="text-xs">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {c.matchsRetenus}
          </span>{' '}
          matchs analysés sur {c.matchsCharges} terminés en base
          {c.exclusEloDefaut > 0 && (
            <> — {c.exclusEloDefaut} écartés (un joueur sans Elo réel)</>
          )}
          {c.exclusEgalite > 0 && <>, {c.exclusEgalite} à Elo strictement égal</>}
          {c.exclusDonneesIncompletes > 0 && (
            <>, {c.exclusDonneesIncompletes} incomplets</>
          )}
          . {c.matchsDeuxEloTa} ont un Elo Tennis Abstract des deux côtés.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
              <th className="py-2 pr-3 font-medium">Tranche Δ Elo</th>
              <th className="py-2 pr-3 text-right font-medium">Matchs</th>
              <th className="py-2 pr-3 text-right font-medium">Δ moyen</th>
              <th className="py-2 pr-3 text-right font-medium">
                P(favori gagne) réelle
              </th>
              <th className="py-2 pr-3 text-right font-medium">
                P prédite (÷{c.constanteMoteur})
              </th>
              <th className="py-2 pr-3 text-right font-medium">Écart</th>
            </tr>
          </thead>
          <tbody>
            {c.tranches.map((t) => (
              <tr
                key={t.libelle}
                className={`border-b border-zinc-100 dark:border-zinc-900 ${
                  t.significatif ? '' : 'opacity-60'
                }`}
              >
                <td className="py-2 pr-3 font-mono tabular-nums">
                  {t.libelle}
                  {!t.significatif && (
                    <span
                      className="ml-2 text-xs font-sans text-amber-600 dark:text-amber-400"
                      title={`Moins de ${c.seuilSignificatif} matchs : la fréquence observée n'est que du bruit. Tranche exclue de l'ajustement.`}
                    >
                      non significatif
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-zinc-500">
                  {t.matchs}
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums text-zinc-500">
                  {t.matchs > 0 ? Math.round(t.deltaMoyen) : '—'}
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums">
                  {t.matchs > 0 ? (
                    <>
                      {pourcent(t.pReelle)}
                      <span className="ml-1 text-xs text-zinc-400">
                        ±{(t.erreurType * 100).toFixed(1)}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums text-zinc-500">
                  {t.matchs > 0 ? pourcent(t.pPredite) : '—'}
                </td>
                <td
                  className={`py-2 pr-3 text-right font-mono tabular-nums ${classeEcart(
                    t.ecart,
                    t.significatif,
                  )}`}
                >
                  {t.matchs > 0
                    ? `${t.ecart >= 0 ? '+' : ''}${(t.ecart * 100).toFixed(1)}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500">
        La probabilité prédite est évaluée sur l&apos;écart{' '}
        <span className="font-medium text-zinc-700 dark:text-zinc-300">
          moyen observé
        </span>{' '}
        dans chaque tranche, et non sur son centre nominal : la dernière tranche
        est ouverte et n&apos;a pas de centre, et une tranche large n&apos;est
        pas peuplée uniformément. Le ± est l&apos;erreur type de la fréquence :
        un écart plus petit qu&apos;elle ne veut rien dire. Le favori est celui
        au plus haut{' '}
        <span className="font-medium text-zinc-700 dark:text-zinc-300">
          Elo effectif
        </span>{' '}
        — pas la tête de série, pas le mieux classé.
      </p>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Constante optimale</h2>

        {significatives.length === 0 ? (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Aucune tranche n&apos;atteint {c.seuilSignificatif} matchs : rien à
            ajuster, le corpus est trop mince.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full max-w-xl text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                    <th className="py-2 pr-3 font-medium">Constante</th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Somme des carrés
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Pondérée par l&apos;effectif
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {c.constantes.map((k) => (
                    <tr
                      key={k.constante}
                      className="border-b border-zinc-100 dark:border-zinc-900"
                    >
                      <td className="py-1.5 pr-3 font-mono tabular-nums">
                        {k.constante}
                        {k.constante === c.constanteMoteur && (
                          <span className="ml-2 font-sans text-xs text-zinc-400">
                            moteur actuel
                          </span>
                        )}
                        {k.constante === c.meilleure && (
                          <span className="ml-2 font-sans text-xs text-emerald-600 dark:text-emerald-400">
                            meilleure
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                        {k.sse.toFixed(5)}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-zinc-500">
                        {k.ssePondere.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-sm">
              Meilleure des cinq valeurs testées :{' '}
              <span className="font-mono font-semibold">{c.meilleure}</span>{' '}
              (pondérée par l&apos;effectif :{' '}
              <span className="font-mono">{c.meilleurePonderee}</span>). Sur un
              balayage fin, le minimum tombe vers{' '}
              <span className="font-mono font-semibold">{c.optimumFin}</span>{' '}
              (pondéré : <span className="font-mono">{c.optimumFinPondere}</span>
              ).
            </p>

            {moteur && (
              <p className="text-xs text-zinc-500">
                Pour référence, la constante du moteur ({c.constanteMoteur})
                donne une somme des carrés de {moteur.sse.toFixed(5)}, contre{' '}
                {meilleure.sse.toFixed(5)} pour la meilleure —{' '}
                {moteur.sse <= meilleure.sse * 1.2
                  ? 'un écart faible : les deux courbes se valent en pratique.'
                  : 'un écart net sur ce corpus.'}
              </p>
            )}
          </>
        )}
      </div>

      <div className="rounded border border-zinc-200 px-3 py-3 text-xs text-zinc-500 dark:border-zinc-800">
        <p className="font-medium text-zinc-700 dark:text-zinc-300">
          Ce que ce constat vaut — et ce qu&apos;il ne vaut pas
        </p>
        <p className="mt-1.5">
          Les Elo utilisés sont ceux{' '}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            d&apos;aujourd&apos;hui
          </span>
          , pas ceux du jour du match — et ce n&apos;est pas un biais neutre.
          L&apos;Elo actuel intègre le résultat du match qu&apos;on cherche à
          prédire : le vainqueur en est ressorti avec un Elo relevé, le perdant
          abaissé. A posteriori, le « favori » d&apos;une affiche est donc en
          partie désigné{' '}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            par son résultat
          </span>
          .
        </p>
        <p className="mt-1.5">
          Le sens de la distorsion est connu : la fréquence de victoire du
          favori est <em>surestimée</em>, la courbe paraît plus raide
          qu&apos;elle ne l&apos;est, et la constante ajustée ressort plus{' '}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            basse
          </span>{' '}
          que la vraie. Une part de l&apos;écart mesuré sous {c.constanteMoteur}{' '}
          revient donc à cette circularité, pas au tennis. L&apos;ampleur reste
          limitée — les Elo Tennis Abstract portent sur 52 semaines de circuit,
          un match n&apos;y pèse qu&apos;une fraction — mais seule une
          reconstitution des Elo à la date de chaque match lèverait la réserve.
        </p>
        <p className="mt-1.5">
          {changementNet ? (
            <>
              L&apos;optimum s&apos;écarte nettement de {c.constanteMoteur} sur
              ce corpus. Cela reste un signal, pas une conclusion : une part de
              l&apos;écart tient à la circularité ci-dessus, et la trancher
              demanderait des Elo reconstitués à la date de chaque match. À
              confirmer avant de toucher à{' '}
              <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">
                pVictoire
              </code>
              .
            </>
          ) : (
            <>
              L&apos;écart à {c.constanteMoteur} reste modeste : rien qui
              justifie de toucher au moteur aujourd&apos;hui.
            </>
          )}{' '}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            Rien n&apos;est modifié automatiquement.
          </span>{' '}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">
            lib/elo.ts
          </code>{' '}
          reste en {c.constanteMoteur} tant que tu n&apos;en décides pas
          autrement.
        </p>
      </div>
    </div>
  );
}
