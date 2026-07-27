'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface ResumeTour {
  tour: 'atp' | 'wta';
  lues: number;
  importees: number;
  collisions: { cle: string; noms: string[] }[];
  misAJourLe: string | null;
}

/**
 * Rafraîchissement manuel des Elo Tennis Abstract.
 *
 * Les rapports sont republiés une fois par semaine : inutile de le faire à
 * chaque tournoi. Le bouton reste explicite parce que l'opération vide le
 * cache de projections Monte Carlo — les tours consultés ensuite sont
 * resimulés, ce qui prend quelques secondes chacun.
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

  const collisions = (resume ?? []).flatMap((t) => t.collisions);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <button
          onClick={rafraichir}
          disabled={pending}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:border-zinc-500 disabled:opacity-50 dark:border-zinc-700"
          title="Récupère les rapports Elo hebdomadaires de Tennis Abstract"
        >
          {pending ? 'Récupération…' : 'Rafraîchir les Elo Tennis Abstract'}
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

      {collisions.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {collisions.length} homonyme(s) réduits à la même clé, un seul Elo
          conservé :{' '}
          {collisions.map((c) => c.noms.join(' / ')).join(' · ')}
        </p>
      )}
    </div>
  );
}
