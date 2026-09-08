'use client';

import { useMemo, useState, useTransition } from 'react';
import { cleDuel, resoudreArbre, type MatchReel } from '@/lib/bracketSim';
import { definirAncre, effacerAncre } from './actions';
import AncrePanel from './AncrePanel';
import BracketReelPanel from './BracketReelPanel';
import ClassementPanel from './ClassementPanel';
import { MOI, type Joueur, type Participant } from './types';
import type { Player } from '@/lib/types';

type Onglet = 'bracket' | 'classement' | 'ancres';

const ONGLETS: { key: Onglet; label: string }[] = [
  { key: 'bracket', label: 'Bracket réel' },
  { key: 'classement', label: 'Classement & probabilités' },
  { key: 'ancres', label: 'Ancres des participants' },
];

export default function SimulateurBracket({
  tournamentId,
  rounds,
  matches,
  joueurs,
  players,
  surface,
  participants,
  ancresInitiales,
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
  /** stock ('moi' ou id participant) -> ancre actuelle, ou null si aucune. */
  ancresInitiales: Record<string, string | null>;
  roundParDefaut: string;
}) {
  const stocks = useMemo(() => [MOI, ...participants.map((p) => p.id)], [participants]);

  const [roundDepart, setRoundDepart] = useState(roundParDefaut);
  const [onglet, setOnglet] = useState<Onglet>('bracket');
  const [scenario, setScenario] = useState<Map<string, string>>(new Map());
  const [dejaGagne, setDejaGagne] = useState<Record<string, number>>({});
  const [ancres, setAncres] = useState<Record<string, string | null>>(() => {
    const out: Record<string, string | null> = {};
    for (const s of stocks) out[s] = ancresInitiales[s] ?? null;
    return out;
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const arbreScenario = useMemo(
    () => resoudreArbre(matches, rounds, (r, p) => scenario.get(cleDuel(r, p)) ?? null),
    [matches, rounds, scenario],
  );

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

  function onChoisirAncre(stockId: string, playerId: string) {
    setErreur(null);
    setAncres((prev) => ({ ...prev, [stockId]: playerId }));
    startTransition(async () => {
      const r = await definirAncre(tournamentId, stockId === MOI ? null : stockId, playerId);
      if (!r.ok) setErreur(r.error ?? 'Erreur');
    });
  }

  function onEffacerAncre(stockId: string) {
    setErreur(null);
    setAncres((prev) => ({ ...prev, [stockId]: null }));
    startTransition(async () => {
      const r = await effacerAncre(tournamentId, stockId === MOI ? null : stockId);
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
          ancres={ancres}
          arbreScenario={arbreScenario}
          dejaGagne={dejaGagne}
          onChangerDejaGagne={onChangerDejaGagne}
        />
      )}

      {onglet === 'ancres' && (
        <AncrePanel
          key={roundDepart}
          roundDepart={roundDepart}
          matches={matches}
          joueurs={joueurs}
          participants={participants}
          ancres={ancres}
          pending={pending}
          onChoisir={onChoisirAncre}
          onEffacer={onEffacerAncre}
        />
      )}
    </div>
  );
}
