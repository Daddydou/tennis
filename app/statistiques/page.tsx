import Link from 'next/link';
import { sessionValide } from '@/auth/garde';
import { filtreSecondaire, pilleSelecteur } from '@/app/ui';
import { chargerStatistiques, lireFiltres, VUES, type FiltreCircuit } from './donnees';
import VueApp from './VueApp';
import VueBracket from './VueBracket';
import VueCircuit from './VueCircuit';
import VueDuel from './VueDuel';
import VueFantasy from './VueFantasy';
import VueMarche from './VueMarche';
import VuePicks from './VuePicks';

export const dynamic = 'force-dynamic';
// La vue « Modèle & marché » lit plusieurs milliers de matchs et deux index Elo.
export const maxDuration = 60;

/**
 * STATISTIQUES — un seul onglet, sept vues choisies avec des boutons. Tout est calculé à
 * l'affichage à partir de ce qui est en base : rien n'est stocké, rien n'est écrit, aucun
 * appel à une API externe. Une vue ne lit que ce dont elle a besoin.
 */

const CIRCUITS: { cle: FiltreCircuit; libelle: string }[] = [
  { cle: 'tous', libelle: 'ATP + WTA' },
  { cle: 'ATP', libelle: 'ATP' },
  { cle: 'WTA', libelle: 'WTA' },
];

export default async function StatistiquesPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; annee?: string; circuit?: string; stock?: string }>;
}) {
  const filtres = lireFiltres(await searchParams);
  const { contexte, donnees } = await chargerStatistiques(filtres, await sessionValide());
  const f = contexte.filtres;

  const href = (changements: Partial<{ vue: string; annee: number; circuit: string; stock: string }>) => {
    const p = new URLSearchParams();
    const vue = changements.vue ?? f.vue;
    p.set('vue', vue);
    p.set('annee', String(changements.annee ?? f.annee));
    const circuit = changements.circuit ?? f.circuit;
    if (circuit !== 'tous') p.set('circuit', circuit);
    const stock = changements.stock ?? f.stock;
    if (stock !== 'moi') p.set('stock', stock);
    return `/statistiques?${p.toString()}`;
  };

  const vueCourante = VUES.find((v) => v.cle === f.vue)!;

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Statistiques de la saison {f.annee}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Calculées à chaque affichage à partir de la base : {contexte.tournois.length} tournoi(s) sur la période.
        </p>
      </div>

      <nav aria-label="Vues" className="flex flex-wrap gap-1.5">
        {VUES.map((v) => (
          <Link key={v.cle} href={href({ vue: v.cle })} className={pilleSelecteur(v.cle === f.vue)} aria-current={v.cle === f.vue ? 'page' : undefined}>
            {v.libelle}
          </Link>
        ))}
      </nav>

      {f.vue !== 'app' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {contexte.annees.length > 1 && (
            <div className="flex flex-wrap gap-1" aria-label="Année">
              {contexte.annees.map((a) => (
                <Link key={a} href={href({ annee: a })} className={filtreSecondaire(a === f.annee)}>
                  {a}
                </Link>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1" aria-label="Circuit">
            {CIRCUITS.map((c) => (
              <Link key={c.cle} href={href({ circuit: c.cle })} className={filtreSecondaire(c.cle === f.circuit)}>
                {c.libelle}
              </Link>
            ))}
          </div>
          {f.vue === 'picks' && (
            <div className="flex flex-wrap gap-1" aria-label="Joueur du groupe">
              {contexte.stocks.map((s) => {
                const cle = s.id === null ? 'moi' : s.id;
                return (
                  <Link key={cle} href={href({ stock: cle })} className={filtreSecondaire(cle === f.stock || (f.stock === 'moi' && s.id === null))}>
                    {s.nom}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      <p className="text-sm font-medium text-soustitre">{vueCourante.aide}</p>

      {donnees.vue === 'duel' && <VueDuel d={donnees} stocks={contexte.stocks} />}
      {donnees.vue === 'picks' && <VuePicks d={donnees} />}
      {donnees.vue === 'bracket' && <VueBracket d={donnees} stocks={contexte.stocks} />}
      {donnees.vue === 'fantasy' && <VueFantasy d={donnees} />}
      {donnees.vue === 'circuit' && <VueCircuit d={donnees} />}
      {donnees.vue === 'marche' && <VueMarche d={donnees} />}
      {donnees.vue === 'app' && <VueApp d={donnees} />}
    </div>
  );
}
