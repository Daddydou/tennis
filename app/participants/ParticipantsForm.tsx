'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ajouterParticipant, supprimerParticipant } from './actions';
import { boutonDanger, boutonPrimaire, carte, champTexte, Spinner } from '@/app/ui';

export interface ParticipantAffiche {
  id: string;
  name: string;
  picks: number;
}

export default function ParticipantsForm({
  participants,
}: {
  participants: ParticipantAffiche[];
}) {
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function ajouter() {
    if (!nom.trim()) return;
    setErreur(null);
    startTransition(async () => {
      const r = await ajouterParticipant(nom);
      if (r.ok) {
        setNom('');
        router.refresh();
      } else setErreur(r.error ?? 'Erreur');
    });
  }

  function retirer(id: string, name: string, picks: number) {
    const avertissement =
      picks > 0
        ? `Retirer ${name} effacera aussi ${picks} pick(s) déjà enregistré(s) pour lui, sur tous les tournois. Continuer ?`
        : `Retirer ${name} ?`;
    if (!window.confirm(avertissement)) return;
    setErreur(null);
    startTransition(async () => {
      const r = await supprimerParticipant(id);
      if (r.ok) router.refresh();
      else setErreur(r.error ?? 'Erreur');
    });
  }

  return (
    <div className="space-y-4">
      <div className={`divide-y divide-zinc-100 dark:divide-zinc-900 ${carte}`}>
        {participants.length === 0 && (
          <p className="px-3 py-2 text-sm text-zinc-500">
            Aucun participant pour l&apos;instant — que « Moi ».
          </p>
        )}
        {participants.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="flex-1 font-medium">{p.name}</span>
            <span className="text-xs text-zinc-500">
              {p.picks} pick{p.picks > 1 ? 's' : ''}
            </span>
            <button onClick={() => retirer(p.id, p.name, p.picks)} disabled={pending} className={boutonDanger}>
              Retirer
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ajouter()}
          placeholder="Nom du participant"
          className={champTexte}
        />
        <button onClick={ajouter} disabled={pending || !nom.trim()} className={boutonPrimaire}>
          {pending && <Spinner />}
          {pending ? '…' : 'Ajouter'}
        </button>
        {erreur && <span className="text-xs text-red-600 dark:text-red-400">{erreur}</span>}
      </div>
    </div>
  );
}
