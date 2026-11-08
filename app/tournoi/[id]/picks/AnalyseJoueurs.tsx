import { carte } from '@/app/ui';
import type { AfficheAnalyse, LigneAnalyse } from '@/lib/analyseJoueurs';

const ETAT: Record<LigneAnalyse['etat'], string | null> = {
  attente: null,
  gagne: 'Gagné',
  perdu: 'Éliminé',
};

function Ligne({ l }: { l: LigneAnalyse }) {
  const etat = ETAT[l.etat];
  return (
    <div className={`space-y-0.5 py-1.5 ${l.etat === 'perdu' ? 'text-zinc-500' : ''}`}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{l.nom}</span>
        {l.rang !== null && <span className="text-xs text-zinc-500">n°{l.rang}</span>}
        {l.elo > 0 && <span className="text-xs tabular-nums text-zinc-600">Elo {l.elo}</span>}
        {l.proba !== null && l.etat === 'attente' && (
          <span className="text-xs tabular-nums text-zinc-600">{Math.round(l.proba * 100)} % de gagner</span>
        )}
        {etat && <span className="text-xs font-medium">{etat}</span>}
      </div>
      <p className="text-xs text-zinc-600">
        {l.picks.length === 0 ? (
          'Pické par personne'
        ) : (
          <>
            Pické par {l.picks.map((p) => `${p.participant} (${p.round})`).join(', ')}
          </>
        )}
      </p>
    </div>
  );
}

/**
 * Joueurs du tour en cours, affiche par affiche : rang, Elo, adversaire,
 * chance de gagner et qui les a pickés. Reste affiché même quand tous les
 * picks sont posés (le plan n'a alors plus rien à proposer).
 */
export default function AnalyseJoueurs({ affiches }: { affiches: AfficheAnalyse[] }) {
  if (affiches.length === 0) return null;
  const round = affiches[0].round;
  return (
    <section aria-label="Joueurs du tour" className="space-y-2">
      <h2 className="text-sm font-semibold">
        Joueurs du tour ({round}) <span className="font-normal text-zinc-500">· adversaire, Elo, qui a pické qui</span>
      </h2>
      <div className="grid gap-2 md:grid-cols-2">
        {affiches.map((a, i) => (
          <div key={i} className={`${carte} px-3 py-1`} data-testid="affiche-analyse">
            <Ligne l={a.lignes[0]} />
            <div className="border-t border-zinc-100" />
            <Ligne l={a.lignes[1]} />
          </div>
        ))}
      </div>
    </section>
  );
}
