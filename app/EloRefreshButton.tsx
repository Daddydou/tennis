'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface ResumeTour {
  tour: 'atp' | 'wta';
  lues: number;
  importees: number;
  homonymes: { cle: string; slugs: string[] }[];
  misAJourLe: string | null;
}

/**
 * REPLI — rafraîchissement des Elo par fetch serveur.
 *
 * Tennis Abstract répond 403 aux IP de datacenter : ce bouton échoue depuis
 * Vercel, et la méthode principale est l'import par collage (/import/elo). Il
 * est conservé parce qu'il fonctionne en local et redeviendrait le chemin le
 * plus court si le filtre tombait.
 *
 * L'opération vide le cache de projections Monte Carlo — les tours consultés
 * ensuite sont resimulés, ce qui prend quelques secondes chacun.
 */
export default function EloRefreshButton() {
  const [resume, setResume] = useState<ResumeTour[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function rafraichir() {
    setErreur(null);
    setResume(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/elo/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (data.ok) {
          setResume(data.tours as ResumeTour[]);
          router.refresh();
        } else {
          setErreur(data.error ?? 'Erreur');
        }
      } catch (e) {
        setErreur((e as Error).message);
      }
    });
  }

  const homonymes = (resume ?? []).flatMap((t) => t.homonymes);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <button
          onClick={rafraichir}
          disabled={pending}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:border-zinc-500 disabled:opacity-50 dark:border-zinc-700"
          title="Récupère les rapports Elo depuis le serveur — bloqué (403) depuis Vercel"
        >
          {pending ? 'Récupération…' : 'Tenter le fetch serveur'}
        </button>
        {resume && (
          <span className="text-xs text-zinc-500">
            {resume
              .map(
                (t) =>
                  `${t.tour.toUpperCase()} : ${t.importees} joueurs${
                    t.misAJourLe ? ` (maj ${t.misAJourLe})` : ''
                  }`,
              )
              .join(' · ')}
          </span>
        )}
        {erreur && (
          <span className="text-xs text-red-600 dark:text-red-400">{erreur}</span>
        )}
      </div>

      {homonymes.length > 0 && (
        <p className="text-xs text-violet-600 dark:text-violet-400">
          {homonymes.length} clé(s) portée(s) par plusieurs joueurs, toutes
          conservées — un tableau qui en contient un affichera « ambigu » tant
          qu&apos;aucune exception ne tranche :{' '}
          {homonymes.map((h) => h.slugs.join(' / ')).join(' · ')}
        </p>
      )}
    </div>
  );
}
