'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  cleDuel,
  ensemblesAtteignables,
  resoudreArbre,
  vainqueursReels,
  type MatchReel,
} from '@/lib/bracketSim';
import { enregistrerPronostic, effacerPronostic } from './actions';
import BracketReelPanel from './BracketReelPanel';
import ClassementPanel from './ClassementPanel';
import PronosticsPanel from './PronosticsPanel';
import { MOI, type Joueur, type Participant } from './types';
import type { Player } from '@/lib/types';

type Onglet = 'bracket' | 'classement' | 'pronostics';

const ONGLETS: { key: Onglet; label: string }[] = [
  { key: 'bracket', label: 'Bracket réel' },
  { key: 'classement', label: 'Classement & probabilités' },
  { key: 'pronostics', label: 'Pronostics des participants' },
];

function versMap(obj: Record<string, string> | undefined): Map<string, string> {
  return new Map(Object.entries(obj ?? {}));
}

export default function SimulateurBracket({
  tournamentId,
  rounds,
  matches,
  joueurs,
  players,
  surface,
  participants,
  predictionsInitiales,
  roundParDefaut,
}: {
  tournamentId: string;
  rounds: string[];
  matches: MatchReel[];
  joueurs: Record<string, Joueur>;
  /** Elo par joueur — uniquement pour la simulation Monte Carlo (onglet Classement). */
  players: Record<string, Player>;
  surface: 'hard' | 'clay' | 'grass';
  participants: Participant[];
  predictionsInitiales: Record<string, Record<string, string>>;
  roundParDefaut: string;
}) {
  const stocks = useMemo(() => [MOI, ...participants.map((p) => p.id)], [participants]);

  const [roundDepart, setRoundDepart] = useState(roundParDefaut);
  const [onglet, setOnglet] = useState<Onglet>('bracket');
  const [scenario, setScenario] = useState<Map<string, string>>(new Map());
  const [dejaGagne, setDejaGagne] = useState<Record<string, number>>({});
  const [predictions, setPredictions] = useState<Record<string, Map<string, string>>>(() => {
    const out: Record<string, Map<string, string>> = {};
    for (const s of stocks) out[s] = versMap(predictionsInitiales[s]);
    return out;
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const arbreScenario = useMemo(
    () => resoudreArbre(matches, rounds, (r, p) => scenario.get(cleDuel(r, p)) ?? null),
    [matches, rounds, scenario],
  );
  // Toujours fondé sur la RÉALITÉ, jamais sur le scénario en cours
  // d'exploration : les pronostics portent sur ce qui va vraiment se passer.
  const ensembles = useMemo(() => ensemblesAtteignables(matches, rounds), [matches, rounds]);
  const reels = useMemo(() => vainqueursReels(matches), [matches]);

  function onChoisirScenario(round: string, position: number, playerId: string) {
    setScenario((prev) => {
      const copie = new Map(prev);
      copie.set(cleDuel(round, position), playerId);
      return copie;
    });
  }

  function onEffacerScenario(round: string, position: number) {
    setScenario((prev) => {
      const copie = new Map(prev);
      copie.delete(cleDuel(round, position));
      return copie;
    });
  }

  function appliquerLocalement(stockId: string, round: string, position: number, playerId: string | null) {
    setPredictions((prev) => {
      const copie = new Map(prev[stockId] ?? []);
      if (playerId) copie.set(cleDuel(round, position), playerId);
      else copie.delete(cleDuel(round, position));
      return { ...prev, [stockId]: copie };
    });
  }

  function onChangerPronostic(stockId: string, round: string, position: number, playerId: string) {
    setErreur(null);
    appliquerLocalement(stockId, round, position, playerId);
    startTransition(async () => {
      const r = await enregistrerPronostic(
        tournamentId,
        stockId === MOI ? null : stockId,
        round,
        position,
        playerId,
      );
      if (!r.ok) setErreur(r.error ?? 'Erreur');
    });
  }

  function onEffacerPronostic(stockId: string, round: string, position: number) {
    setErreur(null);
    appliquerLocalement(stockId, round, position, null);
    startTransition(async () => {
      const r = await effacerPronostic(tournamentId, stockId === MOI ? null : stockId, round, position);
      if (!r.ok) setErreur(r.error ?? 'Erreur');
    });
  }

  function onChangerDejaGagne(stockId: string, valeur: number) {
    setDejaGagne((prev) => ({ ...prev, [stockId]: valeur }));
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-xs text-zinc-500">Tour de départ de la simulation</p>
        <div className="flex flex-wrap gap-1">
          {rounds.map((r) => (
            <button
              key={r}
              onClick={() => setRoundDepart(r)}
              className={`rounded border px-2.5 py-1 text-xs ${
                r === roundDepart
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        {ONGLETS.map((o) => (
          <button
            key={o.key}
            onClick={() => setOnglet(o.key)}
            className={`rounded border px-2.5 py-1.5 text-xs font-medium ${
              onglet === o.key
                ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
            }`}
          >
            {o.label}
          </button>
        ))}
      </nav>

      {erreur && <p className="text-xs text-red-600 dark:text-red-400">{erreur}</p>}

      {onglet === 'bracket' && (
        <BracketReelPanel
          key={roundDepart}
          rounds={rounds}
          roundDepart={roundDepart}
          joueurs={joueurs}
          arbre={arbreScenario}
          onChoisir={onChoisirScenario}
          onEffacer={onEffacerScenario}
        />
      )}

      {onglet === 'classement' && (
        <ClassementPanel
          rounds={rounds}
          roundDepart={roundDepart}
          matches={matches}
          scenario={scenario}
          players={players}
          surface={surface}
          joueurs={joueurs}
          participants={participants}
          predictions={predictions}
          arbreScenario={arbreScenario}
          dejaGagne={dejaGagne}
          onChangerDejaGagne={onChangerDejaGagne}
        />
      )}

      {onglet === 'pronostics' && (
        <PronosticsPanel
          key={roundDepart}
          rounds={rounds}
          roundDepart={roundDepart}
          matches={matches}
          joueurs={joueurs}
          participants={participants}
          predictions={predictions}
          ensembles={ensembles}
          reels={reels}
          pending={pending}
          onChanger={onChangerPronostic}
          onEffacer={onEffacerPronostic}
        />
      )}
    </div>
  );
}
