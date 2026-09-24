import { ecartRelatif, type ScoreMethode } from '@/lib/cotes';
import { pct } from './constantes';

/** Cellule d'écart relatif : vert si meilleur que la référence, rouge sinon. */
function CelluleEcart({ valeur }: { valeur: number | null }) {
  return (
    <td
      className={`py-1.5 pr-3 text-right font-mono tabular-nums ${
        valeur === null || Math.abs(valeur) < 0.05
          ? 'text-zinc-400'
          : valeur < 0
            ? 'text-emerald-600'
            : 'text-red-600'
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
export default function TableScores({
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
          <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
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
                className={`border-b border-zinc-100 ${
                  gagnant ? 'bg-emerald-50' : ''
                }`}
              >
                <td className="py-1.5 pr-3 font-medium">
                  {s.methode}
                  {gagnant && (
                    <span className="ml-1.5 text-[10px] uppercase text-emerald-700">
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
