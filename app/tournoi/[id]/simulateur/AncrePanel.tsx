'use client';

import { useState } from 'react';
import type { MatchReel } from '@/lib/bracketSim';
import { MOI, nomStock, type Joueur, type Participant } from './types';

/**
 * Choix de l'ANCRE de chaque participant — verrouillé sur le tour de
 * départ de la simulation (plus de sélecteur de tour libre : l'ancre se
 * choisit UNE FOIS, parmi les vrais joueurs du tour courant, et vaut pour
 * tout le reste du tournoi — cf. lib/bracketSim.ts `predictionsDepuisAncre`).
 *
 * Une liste déroulante par match du tour de départ : les deux vrais joueurs
 * qui s'y affrontent, ou « - » si le pronostic initial du participant dans
 * cette branche est déjà éliminé (rien à proposer d'autre que les deux
 * vrais joueurs du match, l'ancre ne porte que sur CE tour).
 */
export default function AncrePanel({
  roundDepart,
  matches,
  joueurs,
  participants,
  ancres,
  pending,
  onChoisir,
  onEffacer,
}: {
  roundDepart: string;
  matches: MatchReel[];
  joueurs: Record<string, Joueur>;
  participants: Participant[];
  ancres: Record<string, string | null>;
  pending: boolean;
  onChoisir: (stockId: string, playerId: string) => void;
  onEffacer: (stockId: string) => void;
}) {
  const stocks = [MOI, ...participants.map((p) => p.id)];
  const [stockActif, setStockActif] = useState<string>(MOI);

  const nom = (id: string) => joueurs[id]?.nom ?? id;
  const rang = (id: string) => joueurs[id]?.rang ?? null;

  const matchsDuTour = matches
    .filter((m) => m.round === roundDepart)
    .sort((a, b) => a.position - b.position);

  const ancreActuelle = ancres[stockActif] ?? null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Une seule ancre par participant, choisie au tour de départ ({roundDepart}) :
        le joueur qui engrangera 2^(tour−1) points à chaque tour où il l&apos;emporte,
        sans autre pronostic à saisir pour les tours suivants.
      </p>

      <div className="flex flex-wrap gap-1">
        {stocks.map((s) => (
          <button
            key={s}
            onClick={() => setStockActif(s)}
            className={`rounded border px-2.5 py-1 text-xs ${
              s === stockActif
                ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
            }`}
          >
            {nomStock(s, participants)}
            {ancres[s] && <span className="ml-1 opacity-60">· {nom(ancres[s]!)}</span>}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {matchsDuTour.length === 0 && (
          <p className="text-sm text-zinc-500">Le tour de départ n&apos;est pas encore constitué.</p>
        )}
        {matchsDuTour.map((m) => {
          const options = [m.player1Id, m.player2Id].filter((id): id is string => id !== null);
          const ancreIci = ancreActuelle && options.includes(ancreActuelle) ? ancreActuelle : '';

          return (
            <div
              key={`${m.round}-${m.position}`}
              className="flex items-center gap-2 rounded border border-zinc-200 px-2.5 py-2 text-sm dark:border-zinc-800"
            >
              <select
                disabled={pending || options.length === 0}
                value={ancreIci}
                onChange={(e) => {
                  if (e.target.value) onChoisir(stockActif, e.target.value);
                  else if (ancreIci) onEffacer(stockActif);
                }}
                className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">-</option>
                {options.map((id) => (
                  <option key={id} value={id}>
                    {nom(id)}
                    {rang(id) ? ` #${rang(id)}` : ''}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {ancreActuelle && (
        <p className="text-xs text-zinc-500">
          Ancre actuelle de {nomStock(stockActif, participants)} :{' '}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{nom(ancreActuelle)}</span>
          {(() => {
            const dansCeTour = matchsDuTour.some(
              (m) => m.player1Id === ancreActuelle || m.player2Id === ancreActuelle,
            );
            return !dansCeTour ? (
              <span className="ml-1 text-red-500">
                — éliminé avant {roundDepart}, choisis une nouvelle ancre ci-dessus
              </span>
            ) : null;
          })()}
        </p>
      )}
    </div>
  );
}
