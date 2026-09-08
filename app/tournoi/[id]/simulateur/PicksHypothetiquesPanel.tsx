'use client';

import { useState } from 'react';
import { genererSlots } from '@/lib/optimizer';
import { etatsSlots, type MatchRow } from '@/supabase/queries';
import type { Half } from '@/lib/types';
import { cleSlot, versPickRowsSimules } from './picksSim';
import { MOI, nomStock, type Joueur, type Participant } from './types';

const HALF_LABEL: Record<string, string> = { top: 'Moitié haute', bottom: 'Moitié basse' };

/**
 * Picks hypothétiques de chaque participant sur le TABLEAU TESTÉ — même
 * logique d'éligibilité que l'écran Picks réel (`etatsSlots`, réutilisée
 * telle quelle) : joueurs encore en lice dans CE scénario, non encore
 * pickés par ce participant. Persistés (tn_simulated_picks), indépendants
 * des vrais picks (tn_picks).
 */
export default function PicksHypothetiquesPanel({
  rounds,
  roundDepart,
  matchRowsTestes,
  joueurs,
  esperances,
  participants,
  picksSimules,
  pending,
  onChanger,
  onEffacer,
}: {
  rounds: string[];
  roundDepart: string;
  matchRowsTestes: MatchRow[];
  joueurs: Record<string, Joueur>;
  esperances: Record<string, Record<string, number>>;
  participants: Participant[];
  picksSimules: Record<string, Map<string, string>>;
  pending: boolean;
  onChanger: (stockId: string, round: string, half: Half | null, playerId: string) => void;
  onEffacer: (stockId: string, round: string, half: Half | null) => void;
}) {
  const stocks = [MOI, ...participants.map((p) => p.id)];
  const roundsRestants = rounds.slice(rounds.indexOf(roundDepart));

  const [stockActif, setStockActif] = useState<string>(MOI);
  const [roundAffiche, setRoundAffiche] = useState(roundDepart);

  const nom = (id: string) => joueurs[id]?.nom ?? id;
  const rang = (id: string) => joueurs[id]?.rang ?? null;
  const ePoints = (id: string, round: string) => esperances[id]?.[round] ?? 0;

  const slots = genererSlots(rounds).filter((s) => s.round === roundAffiche);
  const picksDuStock = picksSimules[stockActif] ?? new Map<string, string>();
  const etats = etatsSlots(slots, matchRowsTestes, versPickRowsSimules(picksDuStock));

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Un pick hypothétique par tour restant, pour chaque participant — parmi
        les joueurs encore disponibles dans le tableau testé (mêmes règles que
        l&apos;écran Picks réel). Persisté séparément des vrais picks.
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
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {roundsRestants.map((r) => (
          <button
            key={r}
            onClick={() => setRoundAffiche(r)}
            className={`rounded border px-2.5 py-1 text-xs ${
              r === roundAffiche
                ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        {etats.map((etat) => {
          const cle = cleSlot(etat.round, etat.half);
          const options = [...etat.disponibles].sort(
            (a, b) => (rang(a) ?? 9999) - (rang(b) ?? 9999) || nom(a).localeCompare(nom(b)),
          );
          const predit = picksDuStock.get(cle) ?? null;

          return (
            <div key={cle} className="flex-1 space-y-1.5">
              <h3 className="text-sm font-semibold">
                {etat.half ? HALF_LABEL[etat.half] : 'Un seul pick'}
              </h3>

              {etat.joueurs.length === 0 ? (
                <p className="rounded border border-dashed border-zinc-200 px-2.5 py-2 text-xs text-zinc-400 dark:border-zinc-800">
                  Pas encore constitué dans le tableau testé — avance le tour
                  précédent dans l&apos;onglet « Tableau testé ».
                </p>
              ) : (
                <select
                  disabled={pending || options.length === 0}
                  value={predit && options.includes(predit) ? predit : ''}
                  onChange={(e) => {
                    if (e.target.value) onChanger(stockActif, etat.round, etat.half, e.target.value);
                    else onEffacer(stockActif, etat.round, etat.half);
                  }}
                  className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="">—</option>
                  {options.map((id) => (
                    <option key={id} value={id}>
                      {nom(id)}
                      {rang(id) ? ` #${rang(id)}` : ''} — E[pts] {ePoints(id, etat.round).toFixed(1)}
                    </option>
                  ))}
                </select>
              )}
              {predit && !options.includes(predit) && (
                <p className="text-xs text-red-500">
                  {nom(predit)} n&apos;est plus disponible ici (déjà pické ailleurs ou éliminé) — repick ci-dessus.
                </p>
              )}
            </div>
          );
        })}
        {etats.length === 0 && <p className="text-sm text-zinc-500">Aucun match à ce tour.</p>}
      </div>
    </div>
  );
}
