'use client';

import { boutonPrimaire, carte } from '@/app/ui';
import type { DonneesPlan, ParticipantDonnees } from '@/lib/planDonnees';
import type { Bilan, Proposition, ResultatRecherche } from '@/lib/planRivaux';
import { slotsLibresDe } from '@/lib/planEcran';

const f1 = (x: number) => x.toFixed(1);
const pct = (x: number) => `${Math.round(x * 100)} %`;

function pointsValides(d: DonneesPlan, p: ParticipantDonnees): number {
  return p.picks.reduce((s, k) => s + (d.rounds.indexOf(k.round) < d.r0 ? (k.points ?? 0) : 0), 0);
}

/** « R16 Haut : Sinner · R16 Bas : Alcaraz » pour les slots du prochain tour. */
function resume(d: DonneesPlan, moi: ParticipantDonnees, prop: Proposition): string {
  const libres = slotsLibresDe(d, moi);
  const tour = libres[0]?.round;
  return libres
    .map((s, i) => ({ s, j: prop.cibles[i] }))
    .filter(({ s, j }) => s.round === tour && j !== null && j !== undefined)
    .map(({ s, j }) => `${s.half === 'top' ? 'Haut' : s.half === 'bottom' ? 'Bas' : 'Unique'} : ${d.joueurs[j as number].nom}`)
    .join(' · ');
}

export default function PanneauRivaux({
  d,
  moi,
  rivaux,
  recherche,
  pret,
  cibles,
  choixActifs,
  statsEquilibre,
}: {
  d: DonneesPlan;
  moi: ParticipantDonnees;
  rivaux: ParticipantDonnees[];
  recherche: ResultatRecherche | null;
  pret: boolean;
  cibles: (cibles: (number | null)[]) => void;
  choixActifs: number;
  statsEquilibre: Bilan | null;
}) {
  const tour = slotsLibresDe(d, moi)[0]?.round ?? null;
  const gain = recherche ? recherche.recommandee.bilan.pPremier! - (recherche.reference.bilan.pPremier ?? 0) : 0;
  const refEstReco = recherche ? recherche.recommandee === recherche.reference : true;

  return (
    <section className={`${carte} space-y-4 p-4`} aria-label="Contre Laki et Thomas">
      <div>
        <h2 className="text-sm font-semibold">Battre {rivaux.map((r) => r.nom).join(' et ')}</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          On regarde leurs picks déjà posés et on cherche les tiens qui maximisent ta chance de finir 1er.
        </p>
      </div>

      {/* Classement actuel */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <th className="py-1 pr-3 font-medium">Joueur</th>
              <th className="py-1 pr-3 text-right font-medium">Points validés</th>
              <th className="py-1 pr-3 text-right font-medium">Picks posés</th>
              <th className="py-1 text-right font-medium">Final attendu</th>
            </tr>
          </thead>
          <tbody>
            {[moi, ...rivaux].map((p) => {
              const sr = recherche?.rivaux.find((r) => r.nom === p.nom);
              const final = p === moi ? (recherche ? recherche.recommandee.bilan.moyenne : (statsEquilibre?.moyenne ?? null)) : (sr?.moyenne ?? null);
              return (
                <tr key={p.id ?? 'moi'} className="border-t border-zinc-100">
                  <td className="py-1.5 pr-3 font-medium">{p.nom}</td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{pointsValides(d, p)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                    {p.picks.length}/{d.slots.length}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{final !== null ? f1(final) : '…'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!pret || !recherche ? (
        <p className="text-xs text-zinc-500">Calcul des scénarios en cours…</p>
      ) : (
        <>
          <div className="rounded-xl bg-blue-50 p-3">
            <p className="text-xs font-medium text-blue-900">
              Recommandé pour le tour {tour}
              {choixActifs > 0 && ' (tes choix déjà faits sont gardés)'}
            </p>
            <p className="mt-1 text-sm font-semibold text-blue-950">{resume(d, moi, recherche.recommandee) || 'aucun pick utile'}</p>
            <p className="mt-1 text-xs text-blue-900">
              {pct(recherche.recommandee.bilan.pPremier ?? 0)} de finir 1er
              {!refEstReco && ` (+${Math.round(gain * 100)} points de chance face au plan « points attendus »)`}
              {refEstReco && ' — identique au plan qui maximise les points : rien de mieux à tenter'}
              {recherche.recommandee.bilan.devant.length > 1 &&
                ` · devant ${rivaux.map((r, i) => `${r.nom} ${pct(recherche.recommandee.bilan.devant[i])}`).join(', ')}`}
            </p>
            <button type="button" onClick={() => cibles(recherche.recommandee.cibles)} className={`${boutonPrimaire} mt-2`}>
              Appliquer cette recommandation
            </button>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-zinc-700">Autres combinaisons intéressantes</h3>
            <ul className="mt-1 divide-y divide-zinc-100">
              {recherche.propositions.slice(0, 5).map((prop, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{resume(d, moi, prop)}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-600">
                    {pct(prop.bilan.pPremier ?? 0)} · {f1(prop.bilan.moyenne)} pts
                  </span>
                  <button
                    type="button"
                    onClick={() => cibles(prop.cibles)}
                    className="shrink-0 text-xs font-medium text-blue-600 underline underline-offset-2"
                  >
                    Appliquer
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-zinc-500">
            <li>Les picks déjà posés par {rivaux.map((r) => r.nom).join(' et ')} sont pris tels quels.</li>
            <li>Pour leurs picks pas encore posés, on suppose qu’ils prennent le meilleur joueur encore en lice (et pas déjà utilisé).</li>
            <li>Les tours suivants sont complétés au mieux en points attendus ; ils se recalculent à chaque résultat.</li>
            <li>
              La chance de finir 1er vient de milliers de tournois simulés : un écart de moins de 1 point est du bruit, c’est pourquoi on garde le
              plan « points attendus » tant qu’un autre ne fait pas nettement mieux.
            </li>
          </ul>
        </>
      )}
    </section>
  );
}
