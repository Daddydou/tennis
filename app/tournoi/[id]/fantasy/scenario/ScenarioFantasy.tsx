'use client';

import { useState, useTransition } from 'react';
import { boutonPrimaire, boutonSecondaire, carte, Spinner } from '@/app/ui';
import { simulerScenario, type ResultatScenario } from './actions';

/** Un duel du tour, exprimé du point de vue du premier id (ordre de la clé). */
export interface DuelReglable {
  cle: string;
  nomPremier: string;
  nomSecond: string;
  /** P(premier gagne) selon le modèle de production. */
  pBase: number;
  vainqueurReel: 'premier' | 'second' | null;
  /** Un joueur de mon équipe Fantasy joue ce match. */
  equipe: boolean;
}

const enPct = (p: number) => Math.round(p * 100);
const signe = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}`;

export default function ScenarioFantasy({
  tournamentId,
  round,
  duels,
}: {
  tournamentId: string;
  round: string;
  duels: DuelReglable[];
}) {
  // Réglage en pourcentage entier, par duel. Absent = probabilité du modèle.
  const [reglages, setReglages] = useState<Record<string, number>>({});
  const [resultat, setResultat] = useState<ResultatScenario | null>(null);
  const [pending, startTransition] = useTransition();

  const valeur = (d: DuelReglable) => reglages[d.cle] ?? enPct(d.pBase);
  const modifies = duels.filter((d) => reglages[d.cle] !== undefined && reglages[d.cle] !== enPct(d.pBase));

  const fixerReels = () =>
    setReglages((r) => {
      const suite = { ...r };
      for (const d of duels) {
        if (d.vainqueurReel) suite[d.cle] = d.vainqueurReel === 'premier' ? 100 : 0;
      }
      return suite;
    });

  const simuler = () =>
    startTransition(async () => {
      const surcharges: [string, number][] = modifies.map((d) => [d.cle, reglages[d.cle] / 100]);
      setResultat(await simulerScenario(tournamentId, round, surcharges));
    });

  const totaux =
    resultat?.ok === true
      ? resultat.membres.reduce(
          (t, m) => ({ base: t.base + m.base.total, scenario: t.scenario + m.scenario.total }),
          { base: 0, scenario: 0 },
        )
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={boutonPrimaire} onClick={simuler} disabled={pending}>
          {pending && <Spinner />}
          Simuler {modifies.length > 0 ? `(${modifies.length} réglage${modifies.length > 1 ? 's' : ''})` : ''}
        </button>
        {duels.some((d) => d.vainqueurReel) && (
          <button type="button" className={boutonSecondaire} onClick={fixerReels} disabled={pending}>
            Fixer les résultats réels
          </button>
        )}
        {modifies.length > 0 && (
          <button type="button" className={boutonSecondaire} onClick={() => setReglages({})} disabled={pending}>
            Revenir au modèle
          </button>
        )}
      </div>

      {resultat?.ok === false && <p className="text-sm text-red-600">{resultat.error}</p>}

      {resultat?.ok === true && totaux && (
        <div className={`space-y-2 p-3 ${carte}`}>
          <h2 className="text-sm font-semibold">
            Score final projeté de l&apos;équipe :{' '}
            <span className="tabular-nums">{totaux.base.toFixed(1)}</span> →{' '}
            <span className="tabular-nums">{totaux.scenario.toFixed(1)}</span>{' '}
            <span className={totaux.scenario - totaux.base >= 0 ? 'text-emerald-600' : 'text-red-600'}>
              ({signe(totaux.scenario - totaux.base)})
            </span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <th className="py-1 pr-3 font-medium">Palier</th>
                  <th className="py-1 pr-3 font-medium">Joueur</th>
                  <th className="py-1 pr-3 text-right font-medium">Acquis avant {round}</th>
                  <th className="py-1 pr-3 text-right font-medium">Modèle</th>
                  <th className="py-1 pr-3 text-right font-medium">Scénario</th>
                  <th className="py-1 text-right font-medium">Écart</th>
                </tr>
              </thead>
              <tbody>
                {resultat.membres.map((m) => {
                  const ecart = m.scenario.total - m.base.total;
                  return (
                    <tr key={m.palier} className="border-t border-zinc-100">
                      <td className="py-1 pr-3 text-xs text-zinc-500">{m.libellePalier}</td>
                      <td className="py-1 pr-3">{m.nom ?? <span className="text-zinc-400">non pourvu</span>}</td>
                      <td className="py-1 pr-3 text-right tabular-nums text-zinc-500">{m.base.acquis.toFixed(1)}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{m.base.total.toFixed(1)}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{m.scenario.total.toFixed(1)}</td>
                      <td
                        className={`py-1 text-right tabular-nums ${
                          Math.abs(ecart) < 0.05 ? 'text-zinc-400' : ecart > 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {signe(ecart)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-zinc-400">
            Points réels déjà marqués avant {round} + espérance simulée à partir de {round} (
            {resultat.simulations} tirages, même graine pour les deux colonnes : l&apos;écart
            vient des réglages, pas du hasard). La simulation rejoue tout depuis {round} :
            les résultats réels de ce tour ne comptent que si tu les fixes. À 0 % ou 100 %, l’issue est certaine (victoire en sets secs, score tiré au sort).
          </p>
        </div>
      )}

      <ul className="grid gap-2 sm:grid-cols-2">
        {duels.map((d) => {
          const v = valeur(d);
          const change = v !== enPct(d.pBase);
          return (
            <li key={d.cle} className={`space-y-1 p-2.5 ${carte} ${d.equipe ? 'ring-1 ring-lime-500' : ''}`}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className={`min-w-0 truncate ${d.vainqueurReel === 'premier' ? 'font-semibold' : ''}`}>
                  {d.nomPremier}
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {v} % – {100 - v} %
                </span>
                <span
                  className={`min-w-0 truncate text-right ${d.vainqueurReel === 'second' ? 'font-semibold' : ''}`}
                >
                  {d.nomSecond}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={v}
                onChange={(e) => setReglages((r) => ({ ...r, [d.cle]: Number(e.target.value) }))}
                className="w-full accent-lime-600"
                aria-label={`Probabilité que ${d.nomPremier} batte ${d.nomSecond}`}
              />
              <p className="text-[11px] text-zinc-400">
                Modèle : {enPct(d.pBase)} %{change && ' · modifié'}
                {d.equipe && ' · joueur de mon équipe'}
                {d.vainqueurReel &&
                  ` · vainqueur réel : ${d.vainqueurReel === 'premier' ? d.nomPremier : d.nomSecond}`}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
