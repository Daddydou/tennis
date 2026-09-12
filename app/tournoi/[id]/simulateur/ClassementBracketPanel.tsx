'use client';

import { useMemo } from 'react';
import {
  ensemblesAtteignables,
  filtrerAvantTour,
  filtrerDepuisTour,
  maxAtteignable,
  scoreDuStock,
  type ArbreResolu,
  type MatchReel,
} from '@/lib/bracketSim';
import { classerScenariosVictoire, simulerProbabilitesVictoire, type StockBracket } from '@/lib/montecarlo';
import { MOI, nomStock, type Joueur, type Participant } from './types';
import type { Player } from '@/lib/types';
import { carte } from '@/app/ui';

/** N tirages Monte Carlo pour le % de victoire principal — stable, encore instantané. */
const SIMULATIONS = 3000;
/** N tirages par scénario candidat (bloc 4b) — plusieurs candidats par stock, on garde chacun léger. */
const SIMULATIONS_SCENARIO = 800;
/** Nombre de scénarios affichés par participant. */
const TOP_SCENARIOS = 3;

/**
 * Bloc 4 — Classement & probabilités, pour le tour choisi (bloc 1).
 *
 * a) Par stock : points déjà gagnés (calculés automatiquement, jamais saisis
 *    à la main — comparaison des pronostics importés/saisis du bloc 3 sur les
 *    tours AVANT le tour choisi, `lib/bracketSim.ts` `filtrerAvantTour`, aux
 *    résultats réels déjà décidés) + points simulés (pronostics du bloc 3
 *    comparés au bracket réel/scénario du bloc 2, UNIQUEMENT sur le tour
 *    choisi) = total ; % de
 *    victoire par Monte Carlo (lib/montecarlo.ts `simulerProbabilitesVictoire`,
 *    déjà garanti sommer à 100 % — cf. son propre commentaire), à partir des
 *    pronostics du stock sur le tour choisi ET AU-DELÀ (tous les tours déjà
 *    enregistrés, pas seulement celui affiché : `filtrerDepuisTour`) —
 *    c'est ce qui fait avancer les probabilités des joueurs encore en lice
 *    pour les tours suivants, sans modèle séparé. Max possible : déjà gagné
 *    + `maxAtteignable` sur TOUS les pronostics du stock (tous tours, y
 *    compris importés au-delà du tour choisi) — utile surtout après un
 *    import Game Tracker, qui peut couvrir plusieurs tours d'un coup.
 *
 * b) Par stock : les 3 scénarios (« si le joueur X remporte le tournoi »)
 *    qui maximisent sa probabilité de victoire, parmi les joueurs qu'il a
 *    pronostiqués (n'importe quel tour, encore en lice) — remplace la
 *    recherche d'une garantie à 100 %, impossible à calculer sans connaître
 *    les pronostics de tout le monde aux tours au-delà du tour affiché.
 */
export default function ClassementBracketPanel({
  rounds,
  roundChoisi,
  matches,
  scenario,
  arbreScenario,
  players,
  surface,
  joueurs,
  participants,
  picksBracket,
}: {
  rounds: string[];
  roundChoisi: string;
  matches: MatchReel[];
  /** Vainqueurs cliqués dans le bracket réel (bloc 2), pour le tour choisi. */
  scenario: ReadonlyMap<string, string>;
  /** `resoudreArbre(matches, rounds, ...)` sur ce même `scenario` — déjà calculé par le parent pour le bloc 2. */
  arbreScenario: ArbreResolu;
  players: Record<string, Player>;
  surface: 'hard' | 'clay' | 'grass';
  joueurs: Record<string, Joueur>;
  participants: Participant[];
  /** stock -> pronostics (bloc 3) déjà enregistrés, TOUS tours confondus. */
  picksBracket: Record<string, Map<string, string>>;
}) {
  const stocks = useMemo(() => [MOI, ...participants.map((p) => p.id)], [participants]);

  // Points déjà gagnés (avant le tour choisi), calculés automatiquement :
  // les pronostics du stock sur les tours déjà dépassés, comparés au bracket
  // réel/scénario (qui, pour ces tours-là, ne peut refléter QUE les vrais
  // résultats — le `scenario` du bloc 2 ne porte que sur le tour choisi).
  // `aDesDonnees` distingue un stock qui n'a rien importé/saisi d'un stock à
  // 0 point pour de mauvais pronostics — jamais le même badge « 0 ».
  const dejaGagneAuto = useMemo(() => {
    const out: Record<string, { valeur: number; aDesDonnees: boolean }> = {};
    for (const s of stocks) {
      const preds = picksBracket[s] ?? new Map<string, string>();
      const avant = filtrerAvantTour(preds, rounds, roundChoisi);
      out[s] = { valeur: scoreDuStock(avant, arbreScenario, rounds), aDesDonnees: preds.size > 0 };
    }
    return out;
  }, [stocks, picksBracket, rounds, roundChoisi, arbreScenario]);

  // Pronostics du tour choisi UNIQUEMENT (affichage « simulés ») vs. tous
  // les tours >= tour choisi (Monte Carlo, `probabilitesVictoire` ci-dessous).
  const predictionsRoundChoisi = useMemo(() => {
    const out: Record<string, Map<string, string>> = {};
    for (const s of stocks) {
      const complet = picksBracket[s] ?? new Map<string, string>();
      out[s] = new Map([...complet].filter(([cle]) => cle.split('|')[0] === roundChoisi));
    }
    return out;
  }, [stocks, picksBracket, roundChoisi]);

  const predictionsDepuisTourChoisi = useMemo(() => {
    const out: Record<string, Map<string, string>> = {};
    for (const s of stocks) {
      out[s] = filtrerDepuisTour(picksBracket[s] ?? new Map(), rounds, roundChoisi);
    }
    return out;
  }, [stocks, picksBracket, rounds, roundChoisi]);

  // Max possible : point de vue GLOBAL (tous les tours pronostiqués par le
  // stock, pas seulement celui affiché) — déjà gagné + tout ce qui reste
  // atteignable, cf. lib/bracketSim.ts `maxAtteignable`. Distinct de
  // « simulés », qui ne porte que sur le tour choisi.
  const atteignables = useMemo(() => ensemblesAtteignables(matches, rounds), [matches, rounds]);
  const maxPossible = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of stocks) {
      out[s] =
        (dejaGagneAuto[s]?.valeur ?? 0) +
        maxAtteignable(picksBracket[s] ?? new Map(), matches, rounds, atteignables);
    }
    return out;
  }, [stocks, dejaGagneAuto, picksBracket, matches, rounds, atteignables]);

  const classement = useMemo(() => {
    return stocks
      .map((s) => {
        const simules = scoreDuStock(predictionsRoundChoisi[s], arbreScenario, rounds);
        const deja = dejaGagneAuto[s]?.valeur ?? 0;
        const aDesDonnees = dejaGagneAuto[s]?.aDesDonnees ?? false;
        return {
          id: s,
          nom: nomStock(s, participants),
          deja,
          aDesDonnees,
          simules,
          total: deja + simules,
          maxPossible: maxPossible[s],
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [stocks, predictionsRoundChoisi, arbreScenario, rounds, dejaGagneAuto, participants, maxPossible]);

  const stocksMC: StockBracket[] = useMemo(
    () =>
      stocks.map((s) => ({
        id: s,
        dejaGagne: dejaGagneAuto[s]?.valeur ?? 0,
        predictions: predictionsDepuisTourChoisi[s],
      })),
    [stocks, dejaGagneAuto, predictionsDepuisTourChoisi],
  );

  const probabilites = useMemo(
    () => simulerProbabilitesVictoire(matches, scenario, players, rounds, stocksMC, SIMULATIONS, surface).victoires,
    [matches, scenario, players, rounds, stocksMC, surface],
  );

  // Scénarios (bloc 4b) : un candidat par joueur pronostiqué (n'importe quel
  // tour) par le stock, classés par probabilité conditionnelle décroissante.
  const scenariosParStock = useMemo(() => {
    const out: Record<string, ReturnType<typeof classerScenariosVictoire>> = {};
    for (const s of stocks) {
      const candidats = [...new Set((picksBracket[s] ?? new Map<string, string>()).values())];
      out[s] =
        candidats.length === 0
          ? []
          : classerScenariosVictoire(
              matches,
              scenario,
              players,
              rounds,
              stocksMC,
              s,
              candidats,
              SIMULATIONS_SCENARIO,
              surface,
            ).slice(0, TOP_SCENARIOS);
    }
    return out;
  }, [stocks, picksBracket, matches, scenario, players, rounds, stocksMC, surface]);

  const nomJoueur = (id: string) => joueurs[id]?.nom ?? id;

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Points déjà gagnés (avant {roundChoisi}, calculés automatiquement depuis les pronostics importés/saisis) +
        points simulés (pronostics du bloc 3 comparés au bracket réel du bloc 2, sur {roundChoisi} uniquement).
      </p>

      <div className="space-y-2">
        {classement.map((c, i) => (
          <div
            key={c.id}
            data-testid={`classement-${c.id}`}
            data-simules={c.simules}
            data-total={c.total}
            data-proba={probabilites[c.id] ?? 0}
            data-max-possible={c.maxPossible}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 ${carte}`}
          >
            <span className="w-5 shrink-0 text-xs text-zinc-400">{i + 1}.</span>
            <span className="flex-1 truncate text-sm font-medium">
              {i === 0 && c.total > 0 && '🏆 '}
              {c.nom}
            </span>

            <span className="flex items-center gap-1 text-xs text-zinc-500">
              déjà gagné{' '}
              {c.aDesDonnees ? (
                <span className="font-medium tabular-nums text-zinc-700 dark:text-zinc-300">{c.deja}</span>
              ) : (
                <span
                  className="font-medium text-amber-600 dark:text-amber-400"
                  title="Aucun pronostic de bracket importé ou saisi pour ce participant (onglet Importer)"
                >
                  à importer
                </span>
              )}
            </span>

            <span className="shrink-0 text-xs text-zinc-500">
              + <span className="tabular-nums">{c.simules}</span> simulés =
            </span>
            <span className="w-14 shrink-0 text-right text-xl font-bold tabular-nums">{c.total}</span>
            <span className="shrink-0 rounded-md bg-blue-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-blue-800">
              {Math.round((probabilites[c.id] ?? 0) * 100)}% de victoire
            </span>
            <span
              className="shrink-0 text-xs text-zinc-400"
              title="Déjà gagné + tout ce qui reste atteignable sur l'ensemble de ses pronostics (tous tours)"
            >
              max possible {c.maxPossible}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-zinc-400">
        Probabilité de victoire : {SIMULATIONS.toLocaleString('fr-FR')} fins de tournoi tirées au sort depuis l&apos;état
        courant du bracket réel (Elo effectif), à partir des pronostics du tour {roundChoisi} et de ceux déjà
        enregistrés au-delà. Égalité partagée à parts égales entre les stocks à égalité sur un même tirage.
      </p>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Scénarios de victoire (les {TOP_SCENARIOS} plus favorables par participant)
        </p>
        {stocks.map((s) => {
          const scenarios = scenariosParStock[s] ?? [];
          const meilleure = scenarios[0]?.probabilite ?? 0;
          return (
            <div key={s} className={`p-2.5 text-sm ${carte}`}>
              <p className="mb-1 font-medium">{nomStock(s, participants)}</p>
              {scenarios.length === 0 || meilleure <= 0 ? (
                <p className="text-xs text-zinc-500">
                  {(picksBracket[s]?.size ?? 0) === 0
                    ? 'Aucun pronostic de bracket enregistré pour l’instant.'
                    : 'Aucun chemin de victoire identifié avec les pronostics actuels.'}
                </p>
              ) : (
                <ol className="space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                  {scenarios.map((sc) => (
                    <li key={sc.playerId}>
                      si <span className="font-medium text-zinc-800 dark:text-zinc-200">{nomJoueur(sc.playerId)}</span>{' '}
                      remporte le tournoi →{' '}
                      <span className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
                        {Math.round(sc.probabilite * 100)}%
                      </span>{' '}
                      de victoire
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
