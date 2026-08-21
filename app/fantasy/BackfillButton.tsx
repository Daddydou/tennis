'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Resume {
  traites: number;
  ignores: number;
  restants: number;
  definitifs: number;
  /** Tournois évalués aussi sur l'Elo antérieur au tirage. */
  propres: number;
  /** Tournois antérieurs à toute l'archive Elo : pas d'évaluation propre. */
  sansEloAnterieur: number;
}

/**
 * Reprise de l'historique sur les tournois déjà en base.
 *
 * Bouton explicite, comme le rafraîchissement des Elo : l'opération peut
 * déclencher une simulation Monte Carlo par tournoi sans projection en cache.
 * La route est bornée dans le temps et renvoie ce qu'il reste à faire — d'où
 * l'invitation à recliquer tant que `restants > 0`.
 */
export default function BackfillButton() {
  const [resume, setResume] = useState<Resume | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function lancer() {
    setErreur(null);
    setResume(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/fantasy/backfill', { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
          setResume(data as Resume);
          router.refresh();
        } else {
          setErreur(data.error ?? 'Erreur');
        }
      } catch (e) {
        setErreur((e as Error).message);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={lancer}
        disabled={pending}
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:border-zinc-500 disabled:opacity-50 dark:border-zinc-700"
        title="Calcule le couple prédit/réalisé des tournois déjà importés. Les tournois terminés déjà enregistrés ne sont pas recalculés."
      >
        {pending ? 'Calcul…' : 'Reprendre les tournois déjà en base'}
      </button>

      {resume && (
        <span className="text-xs text-zinc-500">
          {resume.traites} enregistré(s)
          {resume.propres > 0 && `, dont ${resume.propres} sans look-ahead`}
          {resume.ignores > 0 && `, ${resume.ignores} sans équipe possible`}
          {resume.sansEloAnterieur > 0 && (
            <span
              className="ml-1 text-violet-600 dark:text-violet-400"
              title="Aucun relevé Elo n'est antérieur à ces tournois : l'archive ne remonte pas le temps, seuls les tournois joués après sa mise en place peuvent être évalués sans look-ahead."
            >
              , {resume.sansEloAnterieur} sans Elo antérieur
            </span>
          )}
          {resume.definitifs > 0 && `, ${resume.definitifs} déjà définitif(s)`}
          {resume.restants > 0 && (
            <span className="ml-1 font-medium text-amber-600 dark:text-amber-400">
              — {resume.restants} restant(s), recliquer pour continuer
            </span>
          )}
        </span>
      )}

      {erreur && (
        <span className="text-xs text-red-600 dark:text-red-400">{erreur}</span>
      )}
    </div>
  );
}
