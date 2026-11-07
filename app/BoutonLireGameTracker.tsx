'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { boutonSecondaire, noteInfo, Spinner } from './ui';
import { lireTousGameTracker } from './lireGameTrackerGlobal';
import { bilanLecture, type LigneLecture } from '@/lib/lectureGlobaleGT';

/**
 * Un seul bouton pour LIRE Game Tracker sur tous les tournois en cours.
 * Lecture seule : l'envoi de mes picks se fait depuis l'écran Picks de chaque
 * tournoi. Rien ne part tout seul : le bouton est le seul déclencheur.
 */
export default function BoutonLireGameTracker() {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [resultat, setResultat] = useState<{ lignes: LigneLecture[] } | { erreur: string } | null>(null);

  const lire = () =>
    demarrer(async () => {
      setResultat(null);
      const r = await lireTousGameTracker();
      setResultat(r.ok ? { lignes: r.lignes } : { erreur: r.erreur });
      if (r.ok) router.refresh();
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={lire} disabled={enCours} className={boutonSecondaire}>
          {enCours && <Spinner />}
          {enCours ? 'Lecture en cours' : 'Lire Game Tracker'}
        </button>
        <p className="text-xs text-zinc-600">
          Lit tous les tournois en cours. L’envoi de tes picks se fait depuis chaque tournoi.
        </p>
      </div>

      {resultat && 'erreur' in resultat && (
        <p role="alert" className="text-sm text-red-700">
          {resultat.erreur}
        </p>
      )}

      {resultat && 'lignes' in resultat && (
        <div role="status" className={`${noteInfo} space-y-1`}>
          <p className="font-medium text-zinc-900">{bilanLecture(resultat.lignes)}</p>
          <ul className="space-y-0.5">
            {resultat.lignes.map((l) => (
              <li key={l.tournoiId}>
                <span className="font-medium text-zinc-900">{l.nom}</span>
                {' : '}
                <span className={l.attention ? 'font-medium text-amber-700' : undefined}>{l.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
