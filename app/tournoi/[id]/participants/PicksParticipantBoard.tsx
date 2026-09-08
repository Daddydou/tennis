'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { validerPick, supprimerPick } from '../picks/actions';
import type { Half } from '@/lib/types';

export interface CandidatSimple {
  playerId: string;
  nom: string;
  rang: number | null;
  adversaire: string | null;
}

export interface ColonneSimple {
  half: Half | null;
  label: string;
  pickActuel: string | null;
  impossible: boolean;
  candidats: CandidatSimple[];
}

/**
 * Saisie des picks d'UN participant, pour un tour donné.
 *
 * Volontairement plus sobre que PickBoard (écran Picks, celui de
 * l'utilisateur) : ni Elo, ni espérance, ni recommandation triée — juste la
 * liste des survivants encore disponibles pour ce participant. La consigne
 * était explicite : ne pas toucher au calcul ni aux recommandations de
 * l'utilisateur, donc ce module ne les réutilise pas.
 */
function ColonneParticipant({
  tournamentId,
  round,
  participantId,
  colonne,
}: {
  tournamentId: string;
  round: string;
  participantId: string;
  colonne: ColonneSimple;
}) {
  const [choix, setChoix] = useState<string | null>(colonne.pickActuel);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const modifie = choix !== colonne.pickActuel;

  function valider() {
    if (!choix) return;
    setErreur(null);
    startTransition(async () => {
      const r = await validerPick(tournamentId, round, colonne.half, choix, null, participantId);
      if (r.ok) router.refresh();
      else setErreur(r.error ?? 'Erreur');
    });
  }

  function retirer() {
    setErreur(null);
    startTransition(async () => {
      const r = await supprimerPick(tournamentId, round, colonne.half, participantId);
      if (r.ok) {
        setChoix(null);
        router.refresh();
      } else setErreur(r.error ?? 'Erreur');
    });
  }

  return (
    <div className="flex-1 space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{colonne.label}</h3>
        {colonne.pickActuel ? (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">pické</span>
        ) : colonne.impossible ? (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            sans pick possible
          </span>
        ) : null}
      </div>

      {colonne.impossible && (
        <p className="rounded border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Tous les survivants de cette moitié sont déjà pickés par ce participant à
          un autre tour.
        </p>
      )}

      <div className="divide-y divide-zinc-100 rounded border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800">
        {colonne.candidats.map((c) => {
          const selected = choix === c.playerId;
          return (
            <label
              key={c.playerId}
              className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm ${
                selected
                  ? 'bg-zinc-100 dark:bg-zinc-800'
                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
              }`}
            >
              <input
                type="radio"
                name={`participant-${participantId}-${round}-${colonne.half ?? 'x'}`}
                value={c.playerId}
                checked={selected}
                onChange={() => setChoix(c.playerId)}
                className="accent-zinc-900 dark:accent-zinc-100"
              />
              <span className="flex-1 truncate">
                {c.nom}
                {c.rang ? <span className="ml-1 text-xs text-zinc-400">#{c.rang}</span> : null}
              </span>
              <span className="w-28 truncate text-right text-xs text-zinc-500">
                {c.adversaire ? `vs ${c.adversaire}` : '—'}
              </span>
            </label>
          );
        })}
        {colonne.candidats.length === 0 && (
          <p className="px-2.5 py-2 text-xs text-zinc-500">Aucun candidat.</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={valider}
          disabled={pending || !choix || !modifie || colonne.impossible}
          className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {pending ? '…' : colonne.pickActuel ? 'Modifier' : 'Valider'}
        </button>
        {colonne.pickActuel && (
          <button
            onClick={retirer}
            disabled={pending}
            className="text-xs text-zinc-500 hover:text-red-600 disabled:opacity-40"
          >
            Retirer
          </button>
        )}
        {erreur && <span className="text-xs text-red-600 dark:text-red-400">{erreur}</span>}
      </div>
    </div>
  );
}

export default function PicksParticipantBoard({
  tournamentId,
  round,
  participantId,
  colonnes,
}: {
  tournamentId: string;
  round: string;
  participantId: string;
  colonnes: ColonneSimple[];
}) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      {colonnes.map((c, i) => (
        <ColonneParticipant
          key={c.half ?? `slot-${i}`}
          tournamentId={tournamentId}
          round={round}
          participantId={participantId}
          colonne={c}
        />
      ))}
    </div>
  );
}
