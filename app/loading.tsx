import { Spinner } from '@/app/ui';

/**
 * Affiché IMMÉDIATEMENT pendant qu'un écran se prépare côté serveur : sans
 * lui, un clic ne montrait rien pendant 1 à 3 s (l'app semblait figée).
 */
export default function Chargement() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Spinner />
        Chargement…
      </div>
      <div className="h-8 w-2/3 animate-pulse rounded-xl bg-zinc-200/70" />
      <div className="h-40 animate-pulse rounded-2xl bg-zinc-200/60" />
      <div className="h-40 animate-pulse rounded-2xl bg-zinc-200/50" />
    </div>
  );
}
