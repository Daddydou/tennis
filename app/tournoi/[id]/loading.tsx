import { Spinner } from '@/app/ui';

/**
 * Chargement d'un onglet de tournoi : rendu SOUS le titre et les onglets du
 * layout, qui restent visibles — on sait où l'on est et l'on peut encore
 * changer d'onglet pendant l'attente.
 */
export default function ChargementTournoi() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-zinc-600">
        <Spinner />
        Chargement…
      </div>
      <div className="h-24 animate-pulse rounded-2xl bg-zinc-200/60" />
      <div className="h-48 animate-pulse rounded-2xl bg-zinc-200/50" />
    </div>
  );
}
