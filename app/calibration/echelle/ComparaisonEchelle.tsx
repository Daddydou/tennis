'use client';

import { useState, useTransition } from 'react';

interface Agregat {
  tournois: number;
  predit: number;
  reel: number;
  ecart: number;
}

interface ResultatEchelle {
  echelle: number;
  global: Agregat;
  parGroupe: { groupe: string; agregat: Agregat }[];
  pireEcartGroupe: number;
}

interface Comparaison {
  echelleProduction: number;
  simulations: number;
  tournoisCouverts: number;
  tournoisTotal: number;
  partiel: boolean;
  resultats: ResultatEchelle[];
  tournois: {
    tournamentId: string;
    nom: string;
    groupe: string;
    reel: number;
    preditParEchelle: Record<string, number>;
  }[];
  meilleureGlobale: number;
  meilleureParGroupe: number;
}

const LIBELLE_GROUPE: Record<string, string> = {
  GC: 'Grand Chelem',
  M1000: 'Masters 1000',
  AUTRE: 'Autres',
};

function pct(x: number): string {
  return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} %`;
}

/** Vert quand l'écart est faible, rouge au-delà de 15 %. */
function classeEcart(ecart: number): string {
  const a = Math.abs(ecart);
  if (a <= 0.05) return 'text-emerald-600 dark:text-emerald-400';
  if (a <= 0.15) return 'text-zinc-700 dark:text-zinc-300';
  return 'text-red-600 dark:text-red-400';
}

export default function ComparaisonEchelle() {
  const [data, setData] = useState<Comparaison | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function lancer() {
    setErreur(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/calibration/echelle', { method: 'POST' });
        const json = await res.json();
        if (json.ok) setData(json.comparaison as Comparaison);
        else setErreur(json.error ?? 'Erreur');
      } catch (e) {
        setErreur((e as Error).message);
      }
    });
  }

  const groupes = data
    ? [...new Set(data.resultats.flatMap((r) => r.parGroupe.map((g) => g.groupe)))]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={lancer}
          disabled={pending}
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          title="Rejoue chaque tournoi terminé sous chaque échelle. Plusieurs dizaines de secondes."
        >
          {pending ? 'Simulation en cours…' : 'Lancer le comparatif'}
        </button>
        {pending && (
          <span className="text-xs text-zinc-500">
            une simulation Monte Carlo par tournoi et par échelle — compter
            plusieurs dizaines de secondes
          </span>
        )}
        {erreur && (
          <span className="text-xs text-red-600 dark:text-red-400">{erreur}</span>
        )}
      </div>

      {data && (
        <div className="space-y-4">
          <p className="text-xs text-zinc-500">
            {data.tournoisCouverts} tournoi(s) terminé(s) rejoué(s)
            {data.tournoisTotal !== data.tournoisCouverts &&
              ` sur ${data.tournoisTotal}`}
            , {data.simulations.toLocaleString('fr-FR')} simulations par tournoi
            et par échelle.
            {data.partiel && (
              <span className="ml-1 font-medium text-amber-600 dark:text-amber-400">
                Budget de temps atteint : le comparatif ne porte que sur les
                tournois traités, identiques pour toutes les échelles.
              </span>
            )}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                  <th className="py-2 pr-3 font-medium">Échelle</th>
                  <th className="py-2 pr-3 text-right font-medium">Prédit</th>
                  <th className="py-2 pr-3 text-right font-medium">Réalisé</th>
                  <th className="py-2 pr-3 text-right font-medium">Écart global</th>
                  {groupes.map((g) => {
                    // L'effectif d'un groupe est le même pour toutes les
                    // échelles : on le sort dans l'en-tête, où il se lit avant
                    // les écarts qu'il conditionne.
                    const n = data.resultats[0]?.parGroupe.find(
                      (x) => x.groupe === g,
                    )?.agregat.tournois;
                    return (
                      <th key={g} className="py-2 pr-3 text-right font-medium">
                        {LIBELLE_GROUPE[g] ?? g}
                        {n !== undefined && (
                          <span className="ml-1 font-normal normal-case text-zinc-400">
                            (n={n})
                          </span>
                        )}
                      </th>
                    );
                  })}
                  <th className="py-2 pr-3 text-right font-medium">
                    Pire catégorie
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.resultats.map((r) => (
                  <tr
                    key={r.echelle}
                    className="border-b border-zinc-100 dark:border-zinc-900"
                  >
                    <td className="py-2 pr-3 font-mono tabular-nums">
                      {r.echelle}
                      {r.echelle === data.echelleProduction && (
                        <span className="ml-2 font-sans text-xs text-zinc-400">
                          production
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-zinc-500">
                      {r.global.predit.toFixed(0)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-zinc-500">
                      {r.global.reel.toFixed(0)}
                    </td>
                    <td
                      className={`py-2 pr-3 text-right font-mono font-medium tabular-nums ${classeEcart(
                        r.global.ecart,
                      )}`}
                    >
                      {pct(r.global.ecart)}
                    </td>
                    {groupes.map((g) => {
                      const e = r.parGroupe.find((x) => x.groupe === g);
                      return (
                        <td
                          key={g}
                          className={`py-2 pr-3 text-right font-mono tabular-nums ${
                            e ? classeEcart(e.agregat.ecart) : 'text-zinc-400'
                          }`}
                          title={
                            e
                              ? `${e.agregat.tournois} tournoi(s) — ${e.agregat.predit.toFixed(0)} attendus, ${e.agregat.reel.toFixed(0)} réalisés`
                              : undefined
                          }
                        >
                          {e ? pct(e.agregat.ecart) : '—'}
                        </td>
                      );
                    })}
                    <td
                      className={`py-2 pr-3 text-right font-mono tabular-nums ${classeEcart(
                        r.pireEcartGroupe,
                      )}`}
                    >
                      {(r.pireEcartGroupe * 100).toFixed(1)} %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded border border-zinc-200 px-3 py-3 text-sm dark:border-zinc-800">
            <p>
              Écart global le plus faible :{' '}
              <span className="font-mono font-semibold">
                {data.meilleureGlobale}
              </span>
              . Écart le plus faible sur la{' '}
              <em>pire</em> catégorie :{' '}
              <span className="font-mono font-semibold">
                {data.meilleureParGroupe}
              </span>
              .
            </p>
            <p className="mt-1.5 text-xs text-zinc-500">
              Les deux critères ne coïncident pas forcément. Une échelle peut
              annuler l&apos;écart global en compensant une catégorie trop
              optimiste par une autre trop pessimiste — c&apos;est exactement ce
              que la colonne « pire catégorie » sert à démasquer. Si les deux
              désignent la même valeur, le signal est cohérent ; sinon, il y a
              un arbitrage, pas un optimum.
            </p>
            <p className="mt-1.5 text-xs text-zinc-500">
              Regarder les effectifs (n) avant les pourcentages : un écart de
              catégorie calculé sur deux ou trois tournois bouge de dizaines de
              points selon qu&apos;un favori a tenu ou non. Un écart de
              catégorie stable d&apos;une échelle à l&apos;autre signale un
              biais propre à cette catégorie, que l&apos;échelle ne corrige
              pas — c&apos;est ailleurs qu&apos;il faudrait alors chercher
              (barème de multiplicateurs, format en cinq sets…).
            </p>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-zinc-500">
              Détail par tournoi
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-200 text-left uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                    <th className="py-1 pr-3 font-medium">Tournoi</th>
                    <th className="py-1 pr-3 font-medium">Catégorie</th>
                    <th className="py-1 pr-3 text-right font-medium">Réalisé</th>
                    {data.resultats.map((r) => (
                      <th
                        key={r.echelle}
                        className="py-1 pr-3 text-right font-medium"
                      >
                        {r.echelle}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.tournois.map((t) => (
                    <tr
                      key={t.tournamentId}
                      className="border-b border-zinc-100 dark:border-zinc-900"
                    >
                      <td className="py-1 pr-3">{t.nom}</td>
                      <td className="py-1 pr-3 text-zinc-500">
                        {LIBELLE_GROUPE[t.groupe] ?? t.groupe}
                      </td>
                      <td className="py-1 pr-3 text-right font-mono tabular-nums">
                        {t.reel.toFixed(0)}
                      </td>
                      {data.resultats.map((r) => {
                        const p = t.preditParEchelle[String(r.echelle)] ?? 0;
                        return (
                          <td
                            key={r.echelle}
                            className={`py-1 pr-3 text-right font-mono tabular-nums ${
                              p > 0 ? classeEcart(t.reel / p - 1) : 'text-zinc-400'
                            }`}
                            title={`Espérance ${p.toFixed(1)}`}
                          >
                            {p.toFixed(0)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
