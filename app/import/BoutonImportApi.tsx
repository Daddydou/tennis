'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { actualiserTournoiApi, importerTournoiApi } from './actionsApi';
import type { ImportResult } from '@/db/importCoeur';
import { boutonPrimaire, boutonSecondaire, Spinner, zoneTactile } from '@/app/ui';

type Cible = { seasonId: number; type: 'atp' | 'wta' } | { tournamentId: string };

/**
 * Bouton « Importer » / « Mettre à jour » d'un tournoi de l'API tennis, avec
 * le compte rendu de l'import. Pensé pour le téléphone : un seul geste, gros
 * bouton, résultat replié sous le bouton.
 */
export default function BoutonImportApi({ cible, libelle, principal = true }: { cible: Cible; libelle: string; principal?: boolean }) {
  const [resultat, setResultat] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function lancer() {
    setResultat(null);
    startTransition(async () => {
      const r = 'tournamentId' in cible ? await actualiserTournoiApi(cible.tournamentId) : await importerTournoiApi(cible.seasonId, cible.type);
      setResultat(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={lancer} disabled={pending} className={`w-full sm:w-auto ${principal ? boutonPrimaire : boutonSecondaire}`}>
        {pending && <Spinner />}
        {pending ? 'Import en cours…' : libelle}
      </button>
      {resultat && (
        <div className={`rounded-xl p-3 text-sm ${resultat.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>
          {resultat.ok ? (
            <>
              <p className="font-medium">Importé — {resultat.resume?.tournoi}</p>
              <p>
                {resultat.resume?.joueurs} joueurs · {resultat.resume?.matchs} matchs
                {resultat.matchsChanges != null && ` · ${resultat.matchsChanges} nouveaux ou modifiés`}
              </p>
              <div className="-ml-2 flex flex-wrap">
                <Link href={`/tournoi/${resultat.tournamentId}/tableau`} className={`${zoneTactile} px-2 underline`}>
                  Tableau
                </Link>
                <Link href={`/tournoi/${resultat.tournamentId}/picks`} className={`${zoneTactile} px-2 underline`}>
                  Mes picks
                </Link>
              </div>
            </>
          ) : (
            <p>
              <span className="font-medium">Échec : </span>
              {resultat.error}
            </p>
          )}
          {resultat.avertissements.length > 0 && (
            <details className="mt-1">
              <summary className="flex min-h-11 cursor-pointer items-center text-amber-800">{resultat.avertissements.length} remarque(s)</summary>
              <ul className="ml-4 mt-1 list-disc text-amber-800">
                {resultat.avertissements.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
