'use client';

import { useMemo } from 'react';
import {
  chercherScenariosGagnants,
  ensemblesAtteignables,
  maxAtteignable,
  predictionsDepuisAncre,
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
 * Classement en direct — modèle à ANCRE UNIQUE : le pronostic de chaque
 * stock (lib/bracketSim.ts `predictionsDepuisAncre`) se déduit entièrement
 * de son ancre et du tour de départ, sans rien à stocker par tour. Pour
 * chaque stock : points déjà gagnés (saisis à la main — les tours d'AVANT
 * le tour de départ) + points sur les tours simulés (l'ancre comparée au
 * bracket réel/scénario de l'onglet Bracket réel, au barème 2^tour).
 * Recalculé à chaque clic là-bas.
 *
 * En dessous : la probabilité de victoire de chacun (Monte Carlo depuis
 * l'état courant du bracket réel/scénario) et, quand la situation le
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
  ancres,
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
  ancres: Record<string, string | null>;
  arbreScenario: ArbreResolu;
  dejaGagne: Record<string, number>;
  onChangerDejaGagne: (stockId: string, valeur: number) => void;
}) {
  const stocks = useMemo(() => [MOI, ...participants.map((p) => p.id)], [participants]);

  // Carte de pronostics virtuelle de chaque stock, déduite de sa seule
  // ancre — c'est la SEULE différence avec l'ancien modèle multi-tours,
  // tout le reste (scoreDuStock, maxAtteignable, Monte Carlo, recherche de
  // scénario) est le moteur déjà existant, inchangé.
  const predictionsParStock = useMemo(() => {
    const out: Record<string, Map<string, string>> = {};
    for (const s of stocks) {
      const ancre = ancres[s];
      out[s] = ancre ? predictionsDepuisAncre(matches, rounds, roundDepart, ancre) : new Map();
    }
    return out;
  }, [stocks, ancres, matches, rounds, roundDepart]);

  const classement = useMemo(() => {
    return stocks
      .map((s) => {
        const pointsSimules = scoreDuStock(predictionsParStock[s], arbreScenario, rounds);
        const deja = dejaGagne[s] ?? 0;
        return {
          id: s,
          nom: nomStock(s, participants),
          ancre: ancres[s] ? (joueurs[ancres[s]!]?.nom ?? ancres[s]) : null,
          deja,
          pointsSimules,
          total: deja + pointsSimules,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [stocks, predictionsParStock, arbreScenario, rounds, dejaGagne, participants, ancres, joueurs]);

  const probabilites = useMemo(() => {
    const stocksMC: StockBracket[] = stocks.map((s) => ({
      id: s,
      dejaGagne: dejaGagne[s] ?? 0,
      predictions: predictionsParStock[s],
    }));
    return simulerProbabilitesVictoire(matches, scenario, players, rounds, stocksMC, SIMULATIONS, surface)
      .victoires;
  }, [stocks, predictionsParStock, dejaGagne, matches, scenario, players, rounds, surface]);

  const scenariosGagnants = useMemo(() => {
    const stocksGarantie: StockGarantie[] = stocks.map((s) => ({
      id: s,
      dejaGagne: dejaGagne[s] ?? 0,
      predictions: predictionsParStock[s],
    }));
    return chercherScenariosGagnants(matches, rounds, roundDepart, stocksGarantie);
  }, [stocks, predictionsParStock, dejaGagne, matches, rounds, roundDepart]);

  // Plafond de chaque stock — informatif : déjà gagné + tout le reste si son
  // ancre remporte le tournoi. `ensemblesAtteignables` est déjà calculée par
  // chercherScenariosGagnants en interne ; on la refait ici une fois pour
  // l'affichage, coût négligeable.
  const atteignables = useMemo(() => ensemblesAtteignables(matches, rounds), [matches, rounds]);
  const plafonds = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of stocks) {
      out[s] = (dejaGagne[s] ?? 0) + maxAtteignable(predictionsParStock[s], matches, rounds, atteignables);
    }
    return out;
  }, [stocks, dejaGagne, predictionsParStock, matches, rounds, atteignables]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Points déjà gagnés (avant {roundDepart}, à saisir à la main) + points
        de l&apos;ancre de chacun (onglet Ancres) sur le bracket simulé dans
        l&apos;onglet « Bracket réel », au barème 2^(tour−1) depuis le premier tour.
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
              {c.ancre && <span className="ml-1.5 text-xs font-normal text-zinc-400">· ancre {c.ancre}</span>}
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
            <span className="shrink-0 text-xs text-zinc-400" title="Plafond : déjà gagné + tout le reste si son ancre remporte le tournoi">
              plafond {plafonds[c.id]}
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
