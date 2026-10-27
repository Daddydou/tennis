'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { boutonSecondaire, Spinner } from '@/app/ui';

/** Intervalle entre deux relectures, et nombre de relectures avant d'abandonner (~1 min). */
const INTERVALLE_MS = 6000;
const ESSAIS_MAX = 10;

/**
 * Cache Monte Carlo froid : la page a programmé le calcul en arrière-plan
 * (after(), cf. picks/page.tsx). Au lieu de demander « recharge la page »,
 * on relit le rendu serveur toutes les 6 s jusqu'à ce que le cache soit
 * rempli — ce composant disparaît alors de lui-même avec le reste du rendu.
 *
 * Chaque relecture sur cache encore froid reprogramme le même calcul :
 * déterministe (graine fixe), il réécrit les mêmes lignes. D'où un plafond
 * d'essais, puis la main rendue à l'utilisateur.
 */
export default function AttenteCalcul({ quoi }: { quoi: string }) {
  const router = useRouter();
  const [essais, setEssais] = useState(0);
  const abandon = essais >= ESSAIS_MAX;

  useEffect(() => {
    if (abandon) return;
    const t = setTimeout(() => {
      router.refresh();
      setEssais((n) => n + 1);
    }, INTERVALLE_MS);
    return () => clearTimeout(t);
  }, [essais, abandon, router]);

  if (abandon) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm shadow-card">
        <span className="text-zinc-700">
          Le calcul {quoi} n&apos;a pas abouti en une minute (tableau très large, ou tour pas encore constitué).
        </span>
        <button type="button" onClick={() => setEssais(0)} className={boutonSecondaire}>
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <p role="status" className="flex items-center gap-2.5 rounded-2xl bg-white px-4 py-3 text-sm text-zinc-700 shadow-card">
      <Spinner className="text-blue-600" />
      Calcul {quoi} en cours… la page se complète d&apos;elle-même.
    </p>
  );
}
