import { chargerReference } from '@/supabase/reference';
import { estEnCours, estIndecis } from '@/lib/types';
import type { Half } from '@/lib/types';

const HALF_LABEL: Record<string, string> = { top: 'Haut', bottom: 'Bas' };

/** Un pick réel de l'utilisateur, réduit à ce que la comparaison affiche. */
export interface PickUtilisateur {
  round: string;
  half: Half | null;
  nom: string;
  points: number | null;
}

function signe(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * Total de la référence, affiché à côté du score réel.
 *
 * Composant séparé du détail pour pouvoir être placé en tête de page ; les deux
 * partagent le même calcul (`chargerReference` est mémoïsé par requête).
 */
export async function TotalReference({
  id,
  reel,
}: {
  id: string;
  reel: number;
}) {
  const ref = await chargerReference(id);
  if (!ref || ref.rounds.length === 0) return null;

  const ecart = reel - ref.total;

  return (
    <div className="text-sm">
      <span className="text-zinc-500">Si tu avais suivi l&apos;app : </span>
      <span className="text-lg font-semibold tabular-nums">{ref.total}</span>
      <span className="text-zinc-500"> pts</span>
      <span
        className={`ml-2 text-xs font-medium tabular-nums ${
          ecart > 0
            ? 'text-emerald-600 dark:text-emerald-400'
            : ecart < 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-zinc-500'
        }`}
      >
        ({ecart === 0 ? 'à égalité' : `${signe(ecart)} pour toi`})
      </span>
    </div>
  );
}

/** Détail tour par tour de la référence, confronté aux picks réels. */
export async function DetailReference({
  id,
  picks,
}: {
  id: string;
  picks: PickUtilisateur[];
}) {
  const ref = await chargerReference(id);
  if (!ref || ref.rounds.length === 0) return null;

  const mien = new Map(
    picks.map((p) => [`${p.round}|${p.half ?? ''}`, p] as const),
  );

  return (
    <details className="rounded border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800">
      <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
        Score de référence :{' '}
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          {ref.total} pts
        </span>{' '}
        — les recommandations de l&apos;app, tour par tour
        <span className="ml-1 text-zinc-400">— détail</span>
      </summary>

      <p className="mt-2 text-zinc-500">
        À chaque tour, le(s) joueur(s) d&apos;espérance de points maximale parmi
        les survivants réels — deux par tour tant que le tableau a deux moitiés,
        un seul en demies et en finale — sous la même contrainte d&apos;unicité
        que le jeu. Mesure parallèle : tes picks et ton score ne changent pas.
      </p>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-200 text-left uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
              <th className="py-1.5 pr-3 font-medium">Tour</th>
              <th className="py-1.5 pr-3 font-medium">Moitié</th>
              <th className="py-1.5 pr-3 font-medium">Référence</th>
              <th className="py-1.5 pr-3 text-right font-medium">E[pts]</th>
              <th className="py-1.5 pr-3 text-right font-medium">Pts</th>
              <th className="py-1.5 pr-3 font-medium">Ton pick</th>
              <th className="py-1.5 pr-3 text-right font-medium">Pts</th>
            </tr>
          </thead>
          <tbody>
            {ref.picks.map((p) => {
              const moi = mien.get(`${p.round}|${p.half ?? ''}`);
              const attente = p.playerId !== null && estIndecis(p.statut);
              return (
                <tr
                  key={`${p.round}|${p.half ?? ''}`}
                  className="border-b border-zinc-100 dark:border-zinc-900"
                >
                  <td className="py-1.5 pr-3 font-medium">{p.round}</td>
                  <td className="py-1.5 pr-3 text-zinc-500">
                    {p.half ? HALF_LABEL[p.half] : '—'}
                  </td>
                  <td className="py-1.5 pr-3">
                    {p.playerName ?? (
                      <span className="text-zinc-400">aucun pick possible</span>
                    )}
                    {attente && (
                      <span className="ml-1 text-zinc-400">
                        ({estEnCours(p.statut) ? 'en cours' : 'à jouer'})
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-400">
                    {p.ePoints != null ? p.ePoints.toFixed(1) : '—'}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">
                    {p.score ? p.score.total : '—'}
                  </td>
                  <td className="py-1.5 pr-3 text-zinc-600 dark:text-zinc-400">
                    {moi ? moi.nom : <span className="text-zinc-400">—</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                    {moi?.points ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-300 dark:border-zinc-700">
              <td colSpan={4} className="py-1.5 pr-3 text-right font-medium">
                Total référence
              </td>
              <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">
                {ref.total}
              </td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </details>
  );
}

/** Réservé pendant le calcul : les projections manquantes coûtent plusieurs secondes. */
export function ReferenceEnCours() {
  return (
    <div className="text-sm text-zinc-400">
      Si tu avais suivi l&apos;app : calcul en cours…
    </div>
  );
}
