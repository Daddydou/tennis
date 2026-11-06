'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { boutonSecondaire } from '@/app/ui';
import { actualiserResultatsMasters } from './mastersActions';

/** « Actualiser les résultats » : 1 requête à l'API tennis (quota de 50 par jour), refusée si trop rapprochée. */
export default function BoutonResultatsMasters({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);

  const actualiser = () =>
    demarrer(async () => {
      setMessage(null);
      const r = await actualiserResultatsMasters(tournamentId);
      if (!r.ok) {
        setMessage({ texte: r.erreur, erreur: true });
        return;
      }
      const { maj, creees, placees, avertissements } = r.resume;
      const n = maj + creees + placees;
      const texte = n === 0 ? 'Rien de nouveau.' : `${maj} match${maj > 1 ? 's' : ''} mis à jour${creees ? `, ${creees} ajouté${creees > 1 ? 's' : ''}` : ''}${placees ? `, ${placees} placé${placees > 1 ? 's' : ''}` : ''}.`;
      setMessage({ texte: avertissements.length ? `${texte} Attention : ${avertissements.join(' ')}` : texte, erreur: false });
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={actualiser} disabled={enCours} className={boutonSecondaire}>
        {enCours ? 'Actualisation…' : 'Actualiser les résultats'}
      </button>
      {message && (
        <p role="status" className={message.erreur ? 'text-sm text-red-700' : 'text-sm text-zinc-700'}>
          {message.texte}
        </p>
      )}
    </div>
  );
}
