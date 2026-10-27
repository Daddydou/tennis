'use client';

import { useState } from 'react';
import { majParametreUrl } from './urlEtat';
import type { MatchReel } from '@/lib/bracketSim';
import type { MatchRow } from '@/db/queries';
import type { Player } from '@/lib/types';
import SimulateurBracket from './SimulateurBracket';
import SimulateurPicks from './SimulateurPicks';
import type { Joueur, Participant } from './types';
import { pilleSelecteur } from '@/app/ui';

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
  sectionInitiale = 'bracket',
  vueInitiale,
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
  /** Lus dans l'URL (?section=…&vue=…) : retour arrière et lien partagé retrouvent la même vue. */
  sectionInitiale?: Section;
  vueInitiale?: string;
}) {
  const [section, setSectionEtat] = useState<Section>(sectionInitiale);
  const setSection = (s: Section) => {
    setSectionEtat(s);
    majParametreUrl('section', s === 'bracket' ? null : s);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={section === 'bracket'} onClick={() => setSection('bracket')} className={pilleSelecteur(section === 'bracket')}>
          Jeu Bracket
        </button>
        <button type="button" aria-pressed={section === 'picks'} onClick={() => setSection('picks')} className={pilleSelecteur(section === 'picks')}>
          Simulateur de picks
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
          ongletInitial={vueInitiale}
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
