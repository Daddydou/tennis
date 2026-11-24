import { carte } from '@/app/ui';
import { nomNation } from '@/lib/davisPronos';
import { multiplicateurTour, type RencontrePronosVue, type StockDavis } from '@/lib/davisVues';
import { LIBELLE_VERDICT_DAVIS, PastilleDavis } from '../PastilleDavis';

/**
 * Pronos des matchs de chaque rencontre (Coupe Davis), lus sur Game Tracker : pour chaque match (simple 1,
 * simple 2, double), la nation et le score pronostiqués par chacun, avec une pastille (vert nation et score
 * justes, orange nation juste seule, rouge raté, gris en attente) et les points de la rencontre.
 */
export default function PronosDavis({ rencontres, stocks }: { rencontres: RencontrePronosVue[]; stocks: StockDavis[] }) {
  if (rencontres.length === 0) return null;
  return (
    <section className="space-y-3" aria-label="Pronos des matchs" data-testid="pronos-davis">
      <h2 className="text-sm font-semibold">Pronos des matchs</h2>
      {rencontres.map((r) => (
        <div key={r.id} className={`${carte} space-y-2 p-4`} data-testid="pronos-rencontre">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {r.libelle} <span className="font-normal text-zinc-500">· {nomNation(r.nation1)} – {nomNation(r.nation2)}</span>
            </h3>
            <span className="text-xs text-zinc-500">points ×{multiplicateurTour(r.tour)}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1 font-normal">Match</th>
                {stocks.map((s) => (
                  <th key={s.id ?? 'moi'} className="py-1 font-normal">
                    {s.nom}
                  </th>
                ))}
                <th className="py-1 text-right font-normal">Réel</th>
              </tr>
            </thead>
            <tbody>
              {r.matchs.map((m) => (
                <tr key={m.ordre} className="border-t border-white/6">
                  <td className="py-1.5">{m.libelle}</td>
                  {m.lignes.map((l) => (
                    <td key={l.cle} className="py-1.5">
                      {l.nation && l.sets ? (
                        <span className="inline-flex items-center gap-1.5">
                          <PastilleDavis nom={l.nom} verdict={l.verdict} detail={`${nomNation(l.nation)} ${l.sets}`} />
                          <span className="tabular-nums">
                            {l.nation} {l.sets}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-500">{l.verdict === 'sans' ? LIBELLE_VERDICT_DAVIS.sans : '—'}</span>
                      )}
                    </td>
                  ))}
                  <td className="py-1.5 text-right text-xs tabular-nums text-zinc-600">
                    {m.joue ? `${m.vainqueur ?? ''}${m.score ? ` ${m.score}` : ''}` : r.decidee && m.ordre === 3 ? 'non joué' : 'à jouer'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10 text-xs">
                <td className="py-1.5 text-zinc-500">Points</td>
                {stocks.map((s) => {
                  const cle = s.id ?? 'moi';
                  return (
                    <td key={cle} className="py-1.5 font-semibold tabular-nums">
                      {r.points[cle] ?? 0}
                      {r.carton[cle] ? <span className="ml-1 font-normal text-emerald-600">carton plein</span> : null}
                    </td>
                  );
                })}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
    </section>
  );
}
