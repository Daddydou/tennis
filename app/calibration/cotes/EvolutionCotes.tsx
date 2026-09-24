import type { SerieCote } from '@/lib/cotesEvolution';

/**
 * ÉVOLUTION DES COTES AVANT CHAQUE MATCH — une courbe par rencontre, tracée
 * en SVG pur (aucune bibliothèque) : la probabilité de victoire de A à
 * chaque capture, ligne pointillée à 50 %. Il y a autant de points que de
 * clics sur « rafraîchir les cotes » avant le match (cf. migration 0020).
 */

const L = 240;
const H = 56;
const MARGE = 4;

const pct = (p: number) => `${(p * 100).toFixed(0)} %`;

function formatInstant(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', {
    day: 'numeric',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

function Courbe({ serie }: { serie: SerieCote }) {
  const t = serie.points.map((p) => new Date(p.captureLe).getTime());
  const t0 = Math.min(...t);
  const t1 = Math.max(...t);
  const x = (ti: number) =>
    t1 === t0 ? L / 2 : MARGE + ((ti - t0) / (t1 - t0)) * (L - 2 * MARGE);
  const y = (p: number) => MARGE + (1 - p) * (H - 2 * MARGE);
  const coords = serie.points.map((p, i) => [x(t[i]), y(p.probaA)] as const);

  return (
    <svg
      viewBox={`0 0 ${L} ${H}`}
      className="h-14 w-full"
      role="img"
      aria-label={`Probabilité de victoire de ${serie.nomA} : ${serie.points.map((p) => pct(p.probaA)).join(', ')}`}
    >
      <line
        x1={0}
        x2={L}
        y1={y(0.5)}
        y2={y(0.5)}
        className="stroke-zinc-200"
        strokeDasharray="3 3"
      />
      {coords.length > 1 && (
        <polyline
          points={coords.map(([cx, cy]) => `${cx},${cy}`).join(' ')}
          fill="none"
          className="stroke-zinc-800"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}
      {coords.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={2.5} className="fill-zinc-800">
          <title>
            {formatInstant(serie.points[i].captureLe)} — {serie.nomA} {pct(serie.points[i].probaA)}
          </title>
        </circle>
      ))}
    </svg>
  );
}

export default function EvolutionCotes({ series }: { series: SerieCote[] }) {
  const multiples = series.filter((s) => s.points.length > 1).length;

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">Évolution des cotes avant chaque match</h2>
      {series.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Aucune capture historisée pour ce tournoi. Chaque clic sur « rafraîchir
          les cotes » avant les matchs ajoute un point aux courbes — l&apos;historique
          ne commence qu&apos;avec la première capture faite après la mise en place
          (migration 0020).
        </p>
      ) : (
        <>
          <p className="text-xs text-zinc-500">
            Probabilité de victoire du premier joueur, captures prises avant le coup
            d&apos;envoi uniquement. {multiples} rencontre(s) sur {series.length} ont
            au moins deux captures — une seule capture ne donne qu&apos;un point.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {series.map((s) => {
              const premier = s.points[0].probaA;
              const dernier = s.points[s.points.length - 1].probaA;
              const ecart = Math.round(s.variation * 100);
              return (
                <li key={s.eventId} className="rounded-xl bg-zinc-50 p-2">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{s.nomA}</span>{' '}
                      <span className="text-zinc-400">vs</span> {s.nomB}
                    </span>
                    {s.commenceTime && (
                      <span className="shrink-0 text-[11px] text-zinc-400">
                        {formatInstant(s.commenceTime)}
                      </span>
                    )}
                  </div>
                  <Courbe serie={s} />
                  <p className="text-xs tabular-nums text-zinc-600">
                    {s.points.length > 1 ? (
                      <>
                        {pct(premier)} → {pct(dernier)}{' '}
                        <span className={ecart === 0 ? 'text-zinc-400' : 'font-medium text-zinc-900'}>
                          ({ecart > 0 ? '+' : ''}
                          {ecart} pt{Math.abs(ecart) > 1 ? 's' : ''})
                        </span>{' '}
                        <span className="text-zinc-400">· {s.points.length} captures</span>
                      </>
                    ) : (
                      <>
                        {pct(dernier)} <span className="text-zinc-400">· 1 capture</span>
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
