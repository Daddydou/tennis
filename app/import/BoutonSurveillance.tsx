'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { basculerSurveillance } from './actionsAuto';
import { boutonDanger, boutonSecondaire, Spinner } from '@/app/ui';

/** « Arrêter la surveillance » / « Reprendre » pour un tournoi. */
export default function BoutonSurveillance({ tournamentId, actif }: { tournamentId: string; actif: boolean }) {
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={actif ? boutonDanger : boutonSecondaire}
        onClick={() =>
          startTransition(async () => {
            const r = await basculerSurveillance(tournamentId, actif ? 'arreter' : 'reprendre');
            setErreur(r.ok ? null : (r.error ?? 'Échec.'));
            if (r.ok) router.refresh();
          })
        }
      >
        {pending && <Spinner />}
        {actif ? 'Arrêter la surveillance' : 'Reprendre'}
      </button>
      {erreur && <span className="text-xs text-red-600">{erreur}</span>}
    </div>
  );
}
