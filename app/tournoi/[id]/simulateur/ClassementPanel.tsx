'use client';

import { useMemo } from 'react';
import {
  chercherScenariosGagnants,
  filtrerDepuisTour,
  scoreDuStock,
  type ArbreResolu,
  type EvenementSimple,
  type MatchReel,
  type StockGarantie,
} from '@/lib/bracketSim';
import { simulerProbabilitesVictoire, type StockBracket } from '@/lib/montecarlo';
import { MOI, nomStock, type Joueur, type Participant } from './types';
import type { Player } from '@/lib/types';

/** N tirages Monte Carlo — assez pour un pourcentage stable, assez peu pour rester instantané. */
const SIMULATIONS = 3000;

function libelleEvenement(
  e: EvenementSimple,
  rounds: string[],
  joueurs: Record<string, Joueur>,
): string {
  const nom = joueurs[e.playerId]?.nom ?? e.playerId;
  const idx = rounds.indexOf(e.round);
  if (idx === rounds.length - 1) return `${nom} remporte le tournoi`;
  return `${nom} atteint ${rounds[idx + 1]}`;
}

/**
 * Classement en direct : pour chaque stock, points déjà gagnés (saisis à la
 * main, jamais calculés — ce sont les tours d'AVANT le tour choisi) + points
 * sur les tours simulés (son pronostic comparé au bracket réel/scénario de
 * l'onglet Bracket réel, au barème 2^tour). Recalculé à chaque clic là-bas.
 *
 * En dessous : la probabilité de victoire de chacun (simulation Monte Carlo
 * depuis l'état courant du bracket réel/scénario) et, quand la situation le
 * permet, le scénario minimal qui garantirait la victoire d'un participant.
 */
export default function ClassementPanel({
  rounds,
  roundDepart,
  matches,
  scenario,
  players,
  surface,
  joueurs,
  participants,
  predictions,
  arbreScenario,
  dejaGagne,
  onChangerDejaGagne,
}: {
  rounds: string[];
  roundDepart: string;
  matches: MatchReel[];
  scenario: ReadonlyMap<string, string>;
  players: Record<string, Player>;
  surface: 'hard' | 'clay' | 'grass';
  joueurs: Record<string, Joueur>;
  participants: Participant[];
  predictions: Record<string, Map<string, string>>;
  arbreScenario: ArbreResolu;
  dejaGagne: Record<string, number>;
  onChangerDejaGagne: (stockId: string, valeur: number) => void;
}) {
  const stocks = useMemo(() => [MOI, ...participants.map((p) => p.id)], [participants]);

  const classement = useMemo(() => {
    return stocks
      .map((s) => {
        const preds = filtrerDepuisTour(predictions[s] ?? new Map(), rounds, roundDepart);
        const pointsSimules = scoreDuStock(preds, arbreScenario, rounds);
        const deja = dejaGagne[s] ?? 0;
        return { id: s, nom: nomStock(s, participants), deja, pointsSimules, total: deja + pointsSimules };
      })
      .sort((a, b) => b.total - a.total);
  }, [stocks, predictions, arbreScenario, rounds, roundDepart, dejaGagne, participants]);

  // Simulation Monte Carlo depuis l'état courant du bracket réel/scénario :
  // aucun résultat déjà tranché n'est retiré, seul ce qui reste ouvert est
  // tiré au sort (cf. lib/montecarlo.ts `tirerFinDeTournoi`).
  const probabilites = useMemo(() => {
    const stocksMC: StockBracket[] = stocks.map((s) => ({
      id: s,
      dejaGagne: dejaGagne[s] ?? 0,
      predictions: filtrerDepuisTour(predictions[s] ?? new Map(), rounds, roundDepart),
    }));
    return simulerProbabilitesVictoire(
      matches,
      scenario,
      players,
      rounds,
      stocksMC,
      SIMULATIONS,
      surface,
    ).victoires;
  }, [stocks, predictions, dejaGagne, matches, scenario, players, rounds, roundDepart, surface]);

  // Scénarios garantis : indépendants du scénario en cours d'exploration,
  // fondés sur la réalité + les pronostics — « si tel événement se réalise,
  // quel que soit le reste ». Recherche pure, aucune probabilité.
  const scenariosGagnants = useMemo(() => {
    const stocksGarantie: StockGarantie[] = stocks.map((s) => ({
      id: s,
      dejaGagne: dejaGagne[s] ?? 0,
      predictions: predictions[s] ?? new Map(),
    }));
    return chercherScenariosGagnants(matches, rounds, roundDepart, stocksGarantie);
  }, [stocks, predictions, dejaGagne, matches, rounds, roundDepart]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Points déjà gagnés (avant {roundDepart}, à saisir à la main) + points
        sur le bracket simulé dans l&apos;onglet « Bracket réel », au barème
        2^(tour−1) depuis le premier tour.
      </p>

      <div className="space-y-2">
        {classement.map((c, i) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800"
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
            <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              {Math.round((probabilites[c.id] ?? 0) * 100)}% de victoire
            </span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-zinc-400">
        Probabilité de victoire : {SIMULATIONS.toLocaleString('fr-FR')} fins de
        tournoi tirées au sort depuis l&apos;état courant du bracket réel (Elo
        effectif, même modèle que les autres écrans). Égalité partagée à parts
        égales entre les stocks à égalité sur un même tirage.
      </p>

      {scenariosGagnants.size > 0 && (
        <div className="space-y-1.5 rounded border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Scénario qui garantirait une victoire
          </p>
          <ul className="space-y-1">
            {stocks
              .filter((s) => scenariosGagnants.has(s))
              .map((s) => (
                <li key={s}>
                  <span className="font-medium">{nomStock(s, participants)}</span> gagne à coup
                  sûr si{' '}
                  {scenariosGagnants
                    .get(s)!
                    .map((e) => libelleEvenement(e, rounds, joueurs))
                    .join(' ET ')}
                  .
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
