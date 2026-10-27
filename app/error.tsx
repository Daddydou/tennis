'use client'; // Les error boundaries sont des Client Components.

import { useEffect } from 'react';
import Link from 'next/link';
import { boutonPrimaire, boutonSecondaire, carte } from '@/app/ui';

/**
 * Écran d'erreur commun : remplace la page brute de Next quand un écran
 * plante (base injoignable, données incohérentes…). Le détail technique
 * reste côté serveur (journaux Vercel, retrouvables par la référence).
 */
export default function Erreur({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section role="alert" className={`${carte} space-y-3 p-5`}>
      <h2 className="text-lg font-semibold">Cet écran n&apos;a pas pu s&apos;afficher</h2>
      <p className="text-sm text-zinc-700">
        La base de données n&apos;a peut-être pas répondu à temps. Réessaie : rien de ce que tu as déjà
        enregistré n&apos;est perdu.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => retry()} className={boutonPrimaire}>
          Réessayer
        </button>
        <Link href="/" className={boutonSecondaire}>
          Retour à l&apos;accueil
        </Link>
      </div>
      {error.digest && <p className="text-xs text-zinc-500">Référence : {error.digest}</p>}
    </section>
  );
}
