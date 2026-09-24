import SelecteurJoueurs from './SelecteurJoueurs';
import { carte } from '@/app/ui';
import { chargerFaceAFace, listerJoueursDuCircuit, type PointElo } from '@/db/face-a-face';
import { classeElo } from '@/app/tournoi/[id]/BadgeSourceElo';
import type { Surface, Tour } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * HISTORIQUE FACE-À-FACE
 *
 * Les rencontres viennent des tournois importés dans l'app, pas de la
 * carrière entière des deux joueurs ; la comparaison vient des Elo Tennis
 * Abstract déjà extraits (cf. db/face-a-face.ts). L'écran le dit en clair :
 * un « 0 – 0 » veut dire « jamais croisés dans nos tournois », pas « jamais
 * affrontés ».
 */

const LIBELLE_SURFACE: Record<Surface | 'inconnue', string> = {
  hard: 'Dur',
  clay: 'Terre battue',
  grass: 'Gazon',
  carpet: 'Moquette',
  inconnue: 'Surface inconnue',
};

/** Couleurs de surface déjà en usage dans l'app (ciel dur, ambre terre, émeraude gazon). */
const CLASSE_SURFACE: Record<Surface | 'inconnue', string> = {
  hard: 'text-sky-700',
  clay: 'text-amber-700',
  grass: 'text-emerald-700',
  carpet: 'text-slate-600',
  inconnue: 'text-zinc-500',
};

const LIBELLE_STATUT: Partial<Record<string, string>> = {
  walkover: 'w.o.',
  retired: 'ab.',
  scheduled: 'à jouer',
  live: 'en cours',
  in_progress: 'en cours',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, j] = iso.slice(0, 10).split('-');
  return `${Number(j)}/${m}/${a.slice(2)}`;
}

const pct = (p: number) => `${Math.round(p * 100)} %`;

/** Relevés Elo des deux joueurs, alignés par date (un relevé peut manquer à l'un). */
function TableEvolution({
  nomA,
  nomB,
  a,
  b,
}: {
  nomA: string;
  nomB: string;
  a: PointElo[];
  b: PointElo[];
}) {
  const dates = [...new Set([...a, ...b].map((p) => p.releveLe))].sort();
  const valeur = (serie: PointElo[], d: string) => {
    const v = serie.find((p) => p.releveLe === d)?.eloOverall;
    return v == null ? '—' : Math.round(v);
  };
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-zinc-500">
          <th className="py-1 pr-3 font-medium">Relevé</th>
          <th className="py-1 pr-3 text-right font-medium">{nomA}</th>
          <th className="py-1 text-right font-medium">{nomB}</th>
        </tr>
      </thead>
      <tbody>
        {dates.map((d) => (
          <tr key={d} className="border-t border-zinc-100">
            <td className="py-1 pr-3 text-zinc-500">{formatDate(d)}</td>
            <td className="py-1 pr-3 text-right tabular-nums">{valeur(a, d)}</td>
            <td className="py-1 text-right tabular-nums">{valeur(b, d)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function FaceAFacePage({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string; a?: string; b?: string }>;
}) {
  const params = await searchParams;
  const tour: Tour = params.tour === 'WTA' ? 'WTA' : 'ATP';
  const idA = params.a || null;
  const idB = params.b || null;

  const [joueurs, donnees] = await Promise.all([
    listerJoueursDuCircuit(tour),
    idA && idB ? chargerFaceAFace(idA, idB) : Promise.resolve(null),
  ]);

  const nomA = donnees?.a.name ?? '';
  const nomB = donnees?.b.name ?? '';

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Face-à-face</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Rencontres entre deux joueurs dans les tournois importés ici, et
          comparaison de leurs Elo Tennis Abstract.
        </p>
      </div>

      <SelecteurJoueurs tour={tour} joueurs={joueurs} idA={idA} idB={idB} />

      {idA && idB && !donnees && (
        <p className="text-sm text-red-600">
          Sélection invalide : choisis deux joueurs différents du même circuit.
        </p>
      )}

      {donnees && (
        <>
          {/* ── Bilan ── */}
          <div className={`p-4 ${carte}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1 truncate font-medium">{nomA}</span>
              <span className="text-2xl font-bold tabular-nums">
                {donnees.bilan.victoiresA} – {donnees.bilan.victoiresB}
              </span>
              <span className="min-w-0 flex-1 truncate text-right font-medium">{nomB}</span>
            </div>
            {Object.keys(donnees.bilan.parSurface).length > 0 && (
              <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
                {Object.entries(donnees.bilan.parSurface).map(([s, v]) => (
                  <span key={s} className={CLASSE_SURFACE[s as Surface | 'inconnue']}>
                    {LIBELLE_SURFACE[s as Surface | 'inconnue']} : {v!.a} – {v!.b}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 text-center text-[11px] text-zinc-400">
              Seulement les matchs des tournois importés dans l&apos;app — pas le
              face-à-face de carrière.
            </p>
          </div>

          {/* ── Comparaison Elo par surface ── */}
          <div className={`space-y-2 p-3 ${carte}`}>
            <h2 className="text-sm font-semibold">Elo actuel et probabilité de victoire</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <th className="py-1 pr-3 font-medium">Surface</th>
                  <th className="py-1 pr-3 text-right font-medium">{nomA}</th>
                  <th className="py-1 pr-3 text-right font-medium">{nomB}</th>
                  <th className="py-1 text-right font-medium">P({nomA} gagne)</th>
                </tr>
              </thead>
              <tbody>
                {donnees.surfaces.map((s) => (
                  <tr key={s.surface} className="border-t border-zinc-100">
                    <td className={`py-1 pr-3 ${CLASSE_SURFACE[s.surface]}`}>
                      {LIBELLE_SURFACE[s.surface]}
                    </td>
                    <td className={`py-1 pr-3 text-right tabular-nums ${classeElo(donnees.elos.a.source)}`}>
                      {Math.round(s.eloA)}
                    </td>
                    <td className={`py-1 pr-3 text-right tabular-nums ${classeElo(donnees.elos.b.source)}`}>
                      {Math.round(s.eloB)}
                    </td>
                    <td className="py-1 text-right font-medium tabular-nums">{pct(s.pA)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-zinc-400">
              Elo effectif (60 % surface, 40 % général), le même que celui de la
              simulation.
              {(donnees.elos.a.source !== 'ta' || donnees.elos.b.source !== 'ta') &&
                ' Un Elo en couleur n’est pas celui de Tennis Abstract (repli ou défaut) : la comparaison est moins fiable.'}
            </p>
          </div>

          {/* ── Évolution des Elo (archive datée) ── */}
          {(donnees.evolution.a.length > 0 || donnees.evolution.b.length > 0) && (
            <div className={`space-y-2 p-3 ${carte}`}>
              <h2 className="text-sm font-semibold">Évolution de l&apos;Elo général</h2>
              <TableEvolution nomA={nomA} nomB={nomB} a={donnees.evolution.a} b={donnees.evolution.b} />
              <p className="text-[11px] text-zinc-400">
                Relevés Tennis Abstract archivés — l&apos;archive ne remonte qu&apos;à
                sa mise en place (fin juillet 2026).
              </p>
            </div>
          )}

          {/* ── Rencontres ── */}
          <div className={`space-y-2 p-3 ${carte}`}>
            <h2 className="text-sm font-semibold">Rencontres</h2>
            {donnees.bilan.rencontres.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Jamais opposés dans les tournois importés.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100 text-sm">
                {donnees.bilan.rencontres.map((r, i) => (
                  <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
                    <span className="min-w-0">
                      <span className="font-medium">{r.tournoi}</span>{' '}
                      <span className="text-zinc-500">· {r.round}</span>{' '}
                      <span className={`text-xs ${CLASSE_SURFACE[r.surface ?? 'inconnue']}`}>
                        {LIBELLE_SURFACE[r.surface ?? 'inconnue']}
                      </span>
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-xs tabular-nums text-zinc-600">{r.score}</span>
                      {LIBELLE_STATUT[r.status] && (
                        <span className="text-xs text-zinc-400">{LIBELLE_STATUT[r.status]}</span>
                      )}
                      <span
                        className={`text-xs font-medium ${
                          r.vainqueur === null ? 'text-zinc-400' : 'text-zinc-900'
                        }`}
                      >
                        {r.vainqueur === 'A' ? nomA : r.vainqueur === 'B' ? nomB : '—'}
                      </span>
                      <span className="text-xs text-zinc-400">{formatDate(r.date)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
