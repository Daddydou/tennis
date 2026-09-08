'use client';

import { useMemo } from 'react';
import { filtrerDepuisTour, scoreDuStock, type ArbreResolu } from '@/lib/bracketSim';
import { MOI, nomStock, type Participant } from './types';

/**
 * Classement en direct : pour chaque stock, points déjà gagnés (saisis à la
 * main, jamais calculés — ce sont les tours d'AVANT le tour choisi) + points
 * sur les tours simulés (son pronostic comparé au bracket réel/scénario de
 * l'onglet Bracket réel, au barème 2^tour). Recalculé à chaque clic là-bas.
 */
export default function ClassementPanel({
  rounds,
  roundDepart,
  participants,
  predictions,
  arbreScenario,
  dejaGagne,
  onChangerDejaGagne,
}: {
  rounds: string[];
  roundDepart: string;
  participants: Participant[];
  predictions: Record<string, Map<string, string>>;
  arbreScenario: ArbreResolu;
  dejaGagne: Record<string, number>;
  onChangerDejaGagne: (stockId: string, valeur: number) => void;
}) {
  const stocks = [MOI, ...participants.map((p) => p.id)];

  const classement = useMemo(() => {
    return stocks
      .map((s) => {
        const preds = filtrerDepuisTour(predictions[s] ?? new Map(), rounds, roundDepart);
        const pointsSimules = scoreDuStock(preds, arbreScenario, rounds);
        const deja = dejaGagne[s] ?? 0;
        return { id: s, nom: nomStock(s, participants), deja, pointsSimules, total: deja + pointsSimules };
      })
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks, predictions, arbreScenario, rounds, roundDepart, dejaGagne]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Points déjà gagnés (avant {roundDepart}, à saisir à la main) + points
        sur le bracket simulé dans l&apos;onglet « Bracket réel », au barème
        2^(tour−1) depuis le premier tour.
      </p>

      <div className="space-y-2">
        {classement.map((c, i) => (
          <div
            key={c.id}
            className="flex items-center gap-3 rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800"
          >
            <span className="w-5 shrink-0 text-xs text-zinc-400">{i + 1}.</span>
            <span className="flex-1 truncate text-sm font-medium">
              {i === 0 && c.total > 0 && '🏆 '}
              {c.nom}
            </span>

            <label className="flex items-center gap-1 text-xs text-zinc-500">
              déjà gagné
              <input
                type="number"
                min={0}
                value={c.deja}
                onChange={(e) => onChangerDejaGagne(c.id, Math.max(0, Number(e.target.value) || 0))}
                className="w-16 rounded border border-zinc-300 px-1.5 py-1 text-right text-xs tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>

            <span className="shrink-0 text-xs text-zinc-500">
              + <span className="tabular-nums">{c.pointsSimules}</span> simulés =
            </span>
            <span className="w-14 shrink-0 text-right text-base font-semibold tabular-nums">
              {c.total}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
