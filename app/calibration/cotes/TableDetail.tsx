import { POIDS_ELO, POIDS_ELO_MARCHE, libelleBlend, pct } from './constantes';
import type { LigneVue } from './evaluation';

/** Détail match par match, orienté sur le favori de l'Elo. */
export default function TableDetail({
  vues,
  nonApparies,
}: {
  vues: LigneVue[];
  nonApparies: LigneVue[];
}) {
  return (
    <div className="overflow-x-auto">
      <h2 className="mb-2 text-sm font-semibold">Détail par match</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
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
              className="border-b border-zinc-100"
            >
              <td className="py-1.5 pr-3">
                <span className={v.apparie ? '' : 'text-amber-700'}>
                  {v.nomA} <span className="text-zinc-400">vs</span> {v.nomB}
                </span>
                {!v.apparie && (
                  <span
                    className="ml-1.5 rounded-md border border-amber-300 px-1 text-[10px] text-amber-700"
                    title="Au moins un des deux joueurs n’a pas été apparié au tableau : ce match est exclu du score."
                  >
                    non apparié
                  </span>
                )}
                {v.sansAnterieur !== null && (
                  <span
                    className="ml-1.5 rounded-md border border-violet-300 px-1 text-[10px] text-violet-700"
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
                        ? 'text-emerald-600'
                        : 'text-red-600'
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
        <p className="mt-2 text-xs text-amber-700">
          {nonApparies.length} rencontre(s) non appariée(s) au tableau, conservées
          et affichées mais exclues du score : soit le joueur n&apos;est pas dans ce
          tournoi (clé de sport trop large), soit son nom ne se rapproche pas
          (cf. <code>lib/matching.ts</code>).
        </p>
      )}
    </div>
  );
}
