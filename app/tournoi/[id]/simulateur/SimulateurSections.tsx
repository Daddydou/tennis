'use client';

import { useState } from 'react';
import type { MatchReel } from '@/lib/bracketSim';
import type { MatchRow } from '@/supabase/queries';
import type { Player } from '@/lib/types';
import SimulateurBracket from './SimulateurBracket';
import SimulateurPicks from './SimulateurPicks';
import type { Joueur, Participant } from './types';

type Section = 'bracket' | 'picks';

/**
 * Les deux sandbox du Simulateur, bien distincts : Bracket (une ancre par
 * participant, barème 2^tour) et Picks (le jeu de picks détaillé, sur un
 * tableau testé indépendant). Rien n'est partagé entre les deux — chacun a
 * son propre bracket cliquable.
 */
export default function SimulateurSections({
  tournamentId,
  rounds,
  matches,
  matchRows,
  joueurs,
  players,
  surface,
  participants,
  picksBracketInitiaux,
  esperances,
  dejaInscrits,
  picksSimulesInitiaux,
  roundParDefaut,
}: {
  tournamentId: string;
  rounds: string[];
  matches: MatchReel[];
  matchRows: MatchRow[];
  joueurs: Record<string, Joueur>;
  players: Record<string, Player>;
  surface: 'hard' | 'clay' | 'grass';
  participants: Participant[];
  /** stock -> { cleDuel -> playerId } — pronostics de bracket déjà enregistrés, tous tours confondus. */
  picksBracketInitiaux: Record<string, Record<string, string>>;
  esperances: Record<string, Record<string, number>>;
  dejaInscrits: Record<string, number>;
  picksSimulesInitiaux: Record<string, Record<string, string>>;
  roundParDefaut: string;
}) {
  const [section, setSection] = useState<Section>('bracket');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setSection('bracket')}
          className={`rounded border px-3 py-1.5 text-sm font-medium ${
            section === 'bracket'
              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
              : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
          }`}
        >
          Bracket
        </button>
        <button
          onClick={() => setSection('picks')}
          className={`rounded border px-3 py-1.5 text-sm font-medium ${
            section === 'picks'
              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
              : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
          }`}
        >
          Picks
        </button>
      </div>

      {section === 'bracket' ? (
        <SimulateurBracket
          tournamentId={tournamentId}
          rounds={rounds}
          matches={matches}
          joueurs={joueurs}
          players={players}
          surface={surface}
          participants={participants}
          picksBracketInitiaux={picksBracketInitiaux}
          roundParDefaut={roundParDefaut}
        />
      ) : (
        <SimulateurPicks
          tournamentId={tournamentId}
          rounds={rounds}
          matchRows={matchRows}
          matches={matches}
          joueurs={joueurs}
          esperances={esperances}
          participants={participants}
          dejaInscrits={dejaInscrits}
          picksSimulesInitiaux={picksSimulesInitiaux}
          roundParDefaut={roundParDefaut}
        />
      )}
    </div>
  );
}
