'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { validerPick, supprimerPick } from './actions';
import type { Half } from '@/lib/types';

export interface Candidat {
  playerId: string;
  nom: string;
  rang: number | null;
  adversaire: string | null;
  ePoints: number;
  /** Écart d'Elo effectif joueur − adversaire (indicateur de mismatch). */
  ecartElo: number | null;
  utilise: boolean;
}

export interface Colonne {
  half: Half | null;
  label: string;
  pickActuel: string | null;
  candidats: Candidat[];
}

function ColonnePick({
  tournamentId,
  round,
  colonne,
}: {
  tournamentId: string;
  round: string;
  colonne: Colonne;
}) {
  const [choix, setChoix] = useState<string | null>(colonne.pickActuel);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const modifie = choix !== colonne.pickActuel;

  function valider() {
    if (!choix) return;
    const cand = colonne.candidats.find((c) => c.playerId === choix);
    setErreur(null);
    startTransition(async () => {
      const r = await validerPick(
        tournamentId,
        round,
        colonne.half,
        choix,
        cand?.ePoints ?? null,
      );
      if (r.ok) router.refresh();
      else setErreur(r.error ?? 'Erreur');
    });
  }

  function retirer() {
    setErreur(null);
    startTransition(async () => {
      const r = await supprimerPick(tournamentId, round, colonne.half);
      if (r.ok) {
        setChoix(null);
        router.refresh();
      } else setErreur(r.error ?? 'Erreur');
    });
  }

  return (
    <div className="flex-1 space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{colonne.label}</h2>
        {colonne.pickActuel && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            pické
          </span>
        )}
      </div>

      <div className="divide-y divide-zinc-100 rounded border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800">
        {colonne.candidats.map((c) => {
          const selectionnable = !c.utilise;
          const selected = choix === c.playerId;
          return (
            <label
              key={c.playerId}
              className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm ${
                c.utilise
                  ? 'cursor-not-allowed text-zinc-400 dark:text-zinc-600'
                  : selected
                    ? 'bg-zinc-100 dark:bg-zinc-800'
                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
              }`}
            >
              <input
                type="radio"
                name={`slot-${round}-${colonne.half ?? 'x'}`}
                value={c.playerId}
                checked={selected}
                disabled={!selectionnable}
                onChange={() => setChoix(c.playerId)}
                className="accent-zinc-900 dark:accent-zinc-100"
              />
              <span className="flex-1 truncate">
                {c.nom}
                {c.rang ? (
                  <span className="ml-1 text-xs text-zinc-400">#{c.rang}</span>
                ) : null}
                {c.utilise && (
                  <span className="ml-1 text-xs italic">déjà pické</span>
                )}
              </span>
              <span className="w-24 truncate text-right text-xs text-zinc-500">
                {c.adversaire ? `vs ${c.adversaire}` : '—'}
              </span>
              <span
                className={`w-14 text-right font-mono text-xs tabular-nums ${
                  c.ecartElo == null
                    ? 'text-zinc-400'
                    : c.ecartElo > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : c.ecartElo < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-zinc-400'
                }`}
                title="Écart d'Elo effectif (joueur − adversaire)"
              >
                {c.ecartElo == null
                  ? '—'
                  : `${c.ecartElo > 0 ? '+' : ''}${c.ecartElo}`}
              </span>
              <span
                className="w-12 text-right font-mono text-xs tabular-nums"
                title="Espérance de points"
              >
                {c.ePoints.toFixed(1)}
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
          disabled={pending || !choix || !modifie}
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
        {erreur && (
          <span className="text-xs text-red-600 dark:text-red-400">{erreur}</span>
        )}
      </div>
    </div>
  );
}

export default function PickBoard({
  tournamentId,
  round,
  colonnes,
}: {
  tournamentId: string;
  round: string;
  colonnes: Colonne[];
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-zinc-500">
        Tour {round} — simulation Monte Carlo (20 000 runs) depuis les survivants
        réels de ce tour. Colonnes : adversaire · écart d&apos;Elo (joueur −
        adversaire) · E[pts]. Tri par E[pts]. Les joueurs déjà utilisés dans ce
        tournoi sont grisés.
      </p>
      <div className="flex flex-col gap-6 sm:flex-row">
        {colonnes.map((c, i) => (
          <ColonnePick
            key={c.half ?? `slot-${i}`}
            tournamentId={tournamentId}
            round={round}
            colonne={c}
          />
        ))}
      </div>
    </div>
  );
}
