'use client';

import { useMemo, useState } from 'react';
import { boutonSecondaire, carte, noteInfo } from '@/app/ui';
import { demisFinales, MAX_PRONOSTIC, type PronosticMasters, type ReelMasters } from '@/lib/masters';
import type { VerdictMasters } from '@/lib/mastersPronosticVue';
import {
  corrigerPronostic,
  placerDansClassement,
  pointsSousScenario,
  type FigeScenario,
  type LigneComparaison,
  type ParticipantScenario,
} from '@/lib/mastersScenario';

/**
 * UN SEUL ÉCRAN : le pronostic de chaque participant côte à côte (couleur = juste / bien qualifiée / raté d'après ce
 * qui est déjà joué) et une colonne « Simulé », un bracket que l'on modifie à volonté. Les points de chacun se
 * recalculent tout de suite comme si ce scénario était la réalité (les picks comptent pour leurs points actuels).
 * Les parties déjà jouées en vrai (poule terminée, demie, finale) sont figées dans le scénario.
 */

const FOND: Record<VerdictMasters, string> = {
  juste: 'bg-emerald-100 text-emerald-950',
  partiel: 'bg-amber-100 text-amber-950',
  rate: 'bg-red-100 text-red-950',
  attente: 'bg-white text-zinc-900',
};
const SIGNE: Record<VerdictMasters, string> = { juste: '✓', partiel: '≈', rate: '✗', attente: '' };

const champSelect = 'min-h-11 w-full rounded-xl bg-white px-2 text-sm shadow-sm disabled:bg-zinc-100 disabled:text-zinc-700';

export default function ComparaisonPronostics({
  poules,
  noms,
  participants,
  grille,
  reel,
  initial,
  fige,
}: {
  poules: { A: string[]; B: string[] };
  noms: Record<string, string>;
  participants: ParticipantScenario[];
  grille: LigneComparaison[];
  reel: ReelMasters;
  initial: PronosticMasters;
  fige: FigeScenario;
}) {
  const [scenario, setScenario] = useState<PronosticMasters>(initial);
  const nom = (id: string) => noms[id] ?? id;
  const lignes = useMemo(() => pointsSousScenario(participants, reel, scenario), [participants, reel, scenario]);
  const [d1, d2] = demisFinales([scenario.classementA[0], scenario.classementA[1]], [scenario.classementB[0], scenario.classementB[1]]);
  const modifie = JSON.stringify(scenario) !== JSON.stringify(initial);

  const place = (poule: 'A' | 'B', i: number, id: string) =>
    setScenario((cur) => {
      const cle = poule === 'A' ? 'classementA' : 'classementB';
      return corrigerPronostic({ ...cur, [cle]: placerDansClassement(cur[cle], i, id) });
    });

  /** La case « Simulé » d'une ligne de la grille : un menu, ou le résultat réel quand c'est déjà joué. */
  const caseSimulee = (cle: string) => {
    const poule = cle[0] === 'A' || cle[0] === 'B' ? (cle[0] as 'A' | 'B') : null;
    if (poule) {
      const i = Number(cle[1]) - 1;
      const classement = poule === 'A' ? scenario.classementA : scenario.classementB;
      return (
        <select
          value={classement[i]}
          disabled={fige[poule]}
          onChange={(e) => place(poule, i, e.target.value)}
          className={champSelect}
          aria-label={`Scénario, poule ${poule}, place ${i + 1}`}
        >
          {poules[poule].map((id) => (
            <option key={id} value={id}>
              {nom(id)}
            </option>
          ))}
        </select>
      );
    }
    if (cle === 'D1' || cle === 'D2') {
      const i = cle === 'D1' ? 0 : 1;
      const choix = i === 0 ? d1 : d2;
      return (
        <select
          value={scenario.vainqueursDemis[i]}
          disabled={fige.demis[i]}
          onChange={(e) => setScenario((cur) => corrigerPronostic({ ...cur, vainqueursDemis: i === 0 ? [e.target.value, cur.vainqueursDemis[1]] : [cur.vainqueursDemis[0], e.target.value] }))}
          className={champSelect}
          aria-label={`Scénario, vainqueur de la demie ${i + 1}`}
        >
          {choix.map((id) => (
            <option key={id} value={id}>
              {nom(id)}
            </option>
          ))}
        </select>
      );
    }
    return (
      <select
        value={scenario.champion}
        disabled={fige.champion}
        onChange={(e) => setScenario((cur) => corrigerPronostic({ ...cur, champion: e.target.value }))}
        className={champSelect}
        aria-label="Scénario, championne"
      >
        {scenario.vainqueursDemis.map((id) => (
          <option key={id} value={id}>
            {nom(id)}
          </option>
        ))}
      </select>
    );
  };

  const parCle = (cle: string) => lignes.find((l) => l.cle === cle);

  return (
    <section className={`${carte} space-y-3 p-4`} data-testid="comparaison-pronostics" aria-label="Tous les pronostics et bracket simulé">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold">Tous les pronostics et bracket simulé</h2>
        <button type="button" className={boutonSecondaire} onClick={() => setScenario(initial)} disabled={!modifie}>
          Revenir à l&apos;état réel
        </button>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-separate border-spacing-y-1 text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="w-28 py-1 pr-2 font-normal" />
              {participants.map((p) => (
                <th key={p.cle} className="px-1 py-1 font-medium text-zinc-900">
                  {p.nom}
                </th>
              ))}
              <th className="px-1 py-1 font-medium text-blue-900">Simulé</th>
            </tr>
          </thead>
          <tbody>
            {grille.map((l) => (
              <tr key={l.cle}>
                <th scope="row" className="py-1 pr-2 text-left text-xs font-normal text-zinc-600">
                  {l.libelle}
                </th>
                {l.cases.map((c, i) => (
                  <td key={participants[i].cle} className="px-1 py-0.5">
                    {c ? (
                      <span className={`flex min-h-11 items-center justify-between gap-1 rounded-xl px-2 py-1 ${FOND[c.verdict]}`} data-verdict={c.verdict}>
                        <span className="min-w-0 truncate">{nom(c.joueurId)}</span>
                        <span aria-hidden="true" className="shrink-0 text-xs">
                          {SIGNE[c.verdict]}
                        </span>
                      </span>
                    ) : (
                      <span className="flex min-h-11 items-center rounded-xl bg-zinc-50 px-2 text-xs text-zinc-500">—</span>
                    )}
                  </td>
                ))}
                <td className="px-1 py-0.5">{caseSimulee(l.cle)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-xs text-zinc-600">
              <th scope="row" className="pt-2 pr-2 text-left font-normal">
                Points du pronostic aujourd&apos;hui
              </th>
              {participants.map((p) => {
                const a = parCle(p.cle)?.actuel;
                return (
                  <td key={p.cle} className="px-1 pt-2 font-mono">
                    {a ? `${a.total} / ${MAX_PRONOSTIC}` : '—'}
                  </td>
                );
              })}
              <td />
            </tr>
            <tr className="text-xs text-zinc-600">
              <th scope="row" className="pr-2 text-left font-normal">
                Points si ce scénario
              </th>
              {participants.map((p) => {
                const l = parCle(p.cle);
                const diff = l?.simule && l.actuel ? l.simule.total - l.actuel.total : null;
                return (
                  <td key={p.cle} className="px-1 font-mono" data-testid={`points-simules-${p.cle}`}>
                    {l?.simule ? (
                      <>
                        <span className="font-semibold text-zinc-900">{l.simule.total}</span>
                        {diff !== null && diff !== 0 && <span className="ml-1 text-[11px]">({diff > 0 ? '+' : ''}{diff})</span>}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                );
              })}
              <td />
            </tr>
            <tr className="text-xs text-zinc-600">
              <th scope="row" className="pr-2 text-left font-normal">
                Total avec les picks
              </th>
              {participants.map((p) => {
                const l = parCle(p.cle);
                return (
                  <td key={p.cle} className="px-1 font-mono text-sm font-semibold text-zinc-900" data-testid={`total-simule-${p.cle}`}>
                    {l ? l.totalSimule : '—'}
                    {l && <span className="ml-1 text-[11px] font-normal text-zinc-600">#{l.rangSimule}</span>}
                  </td>
                );
              })}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className={noteInfo}>
        Couleurs : vert = place ou choix juste, ambre = bien qualifiée mais pas à cette place, rouge = raté, blanc = pas encore joué (ou égalité non départagée).
        Dans la colonne « Simulé », choisis le classement des poules, les vainqueurs des demies et la championne : les points de chacun se recalculent comme si
        c&apos;était la réalité. Ce qui est déjà joué (poule terminée, demie, finale) est figé. Les picks comptent pour leurs points actuels, ils ne sont pas simulés.
      </p>
    </section>
  );
}
