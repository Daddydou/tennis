'use client';

import { useMemo, useState, useTransition } from 'react';
import { cleDuel, resoudreArbre, type MatchReel } from '@/lib/bracketSim';
import { sauvegarderPronosticsBracket } from './actions';
import BracketRoundPanel from './BracketRoundPanel';
import ClassementBracketPanel from './ClassementBracketPanel';
import ImportBracketPanel from './ImportBracketPanel';
import ParticipantsBracketPanel from './ParticipantsBracketPanel';
import { MOI, type Joueur, type Participant } from './types';
import type { Player } from '@/lib/types';

type Onglet = 'reel' | 'participants' | 'classement' | 'import';

const ONGLETS: { key: Onglet; label: string }[] = [
  { key: 'classement', label: 'Classement & probabilités' },
  { key: 'reel', label: 'Bracket réel' },
  { key: 'participants', label: 'Bracket des participants' },
  { key: 'import', label: 'Importer' },
];

/**
 * Section Bracket du simulateur — bloc 1 (choix du tour, pilote tout le
 * reste), puis les onglets qui en sont les blocs 2/3/4 : Bracket réel
 * (cliquable, tour choisi seulement), Bracket des participants (un
 * pronostic de vainqueur par match, persisté tour par tour,
 * tn_bracket_round_picks) et Classement & probabilités. Un 4e onglet
 * (Importer) pré-remplit le bloc 3 depuis l'extracteur externe (Game
 * Tracker) — même table, toujours corrigeable à la main ensuite.
 *
 * `picksBracket` (committé, TOUS tours confondus, par stock) vit ici : le
 * bloc 4 en a besoin pour les tours au-delà du tour choisi (probabilité
 * d'avancement), pas seulement celui affiché au bloc 3.
 */
export default function SimulateurBracket({
  tournamentId,
  rounds,
  matches,
  joueurs,
  players,
  surface,
  participants,
  picksBracketInitiaux,
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
  /** stock -> { cleDuel -> playerId }, pronostics déjà enregistrés, tous tours confondus. */
  picksBracketInitiaux: Record<string, Record<string, string>>;
  roundParDefaut: string;
}) {
  const stocks = useMemo(() => [MOI, ...participants.map((p) => p.id)], [participants]);

  const [roundChoisi, setRoundChoisi] = useState(roundParDefaut);
  const [onglet, setOnglet] = useState<Onglet>('reel');
  // Bloc 2 : vainqueurs cliqués dans le bracket réel — remis à zéro à chaque
  // changement de tour (bloc 1), puisque seul le tour affiché est simulé.
  const [scenario, setScenario] = useState<Map<string, string>>(new Map());
  const [picksBracket, setPicksBracket] = useState<Record<string, Map<string, string>>>(() => {
    const out: Record<string, Map<string, string>> = {};
    for (const s of stocks) out[s] = new Map(Object.entries(picksBracketInitiaux[s] ?? {}));
    return out;
  });
  const [pending, startTransition] = useTransition();

  const arbreScenario = useMemo(
    () => resoudreArbre(matches, rounds, (r, p) => scenario.get(cleDuel(r, p)) ?? null),
    [matches, rounds, scenario],
  );

  function onChangerRound(round: string) {
    setRoundChoisi(round);
    setScenario(new Map()); // seul le tour choisi est simulé — pas de scénario reporté d'un tour à l'autre.
  }

  function onChoisirScenario(position: number, playerId: string) {
    setScenario((prev) => {
      const copie = new Map(prev);
      copie.set(cleDuel(roundChoisi, position), playerId);
      return copie;
    });
  }

  function onEffacerScenario(position: number) {
    setScenario((prev) => {
      const copie = new Map(prev);
      copie.delete(cleDuel(roundChoisi, position));
      return copie;
    });
  }

  // Pronostics déjà enregistrés pour LE TOUR AFFICHÉ, position -> playerId —
  // sert de valeur initiale au brouillon du bloc 3 (remonté à chaque
  // changement de tour via sa `key`).
  const committeThisRound = useMemo(() => {
    const out: Record<string, Map<number, string>> = {};
    for (const s of stocks) {
      const out2 = new Map<number, string>();
      for (const [cle, playerId] of picksBracket[s] ?? []) {
        const [r, pos] = cle.split('|');
        if (r === roundChoisi) out2.set(Number(pos), playerId);
      }
      out[s] = out2;
    }
    return out;
  }, [stocks, picksBracket, roundChoisi]);

  async function onValiderPronostics(
    stockId: string,
    picks: { position: number; playerId: string | null }[],
  ): Promise<{ ok: boolean; error?: string }> {
    const r = await sauvegarderPronosticsBracket(
      tournamentId,
      stockId === MOI ? null : stockId,
      roundChoisi,
      picks,
    );
    if (r.ok) {
      setPicksBracket((prev) => {
        const copie = new Map(prev[stockId] ?? []);
        for (const [cle] of copie) if (cle.split('|')[0] === roundChoisi) copie.delete(cle);
        for (const p of picks) if (p.playerId) copie.set(cleDuel(roundChoisi, p.position), p.playerId);
        return { ...prev, [stockId]: copie };
      });
    }
    return r;
  }

  function onValiderEtTransition(
    stockId: string,
    picks: { position: number; playerId: string | null }[],
  ): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      startTransition(async () => {
        resolve(await onValiderPronostics(stockId, picks));
      });
    });
  }

  // Import (Game Tracker) : fusionne dans `picksBracket`, quel que soit le
  // tour affiché — un import peut couvrir plusieurs tours à la fois, déjà
  // écrits en base par la Server Action ; ceci ne fait que refléter côté
  // écran, sans recharger la page.
  function onImporte(stockId: string, picks: { round: string; position: number; playerId: string }[]) {
    setPicksBracket((prev) => {
      const copie = new Map(prev[stockId] ?? []);
      for (const p of picks) copie.set(cleDuel(p.round, p.position), p.playerId);
      return { ...prev, [stockId]: copie };
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-zinc-500" htmlFor="round-choisi">
          Tour de simulation
        </label>
        <select
          id="round-choisi"
          value={roundChoisi}
          onChange={(e) => onChangerRound(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          {rounds.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-zinc-400">
          Seul ce tour est simulé (bloc 2 et bloc 3) — pas les tours suivants.
        </p>
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

      {onglet === 'reel' && (
        <BracketRoundPanel
          key={roundChoisi}
          roundChoisi={roundChoisi}
          joueurs={joueurs}
          arbre={arbreScenario}
          onChoisir={onChoisirScenario}
          onEffacer={onEffacerScenario}
        />
      )}

      {onglet === 'participants' && (
        <ParticipantsBracketPanel
          key={roundChoisi}
          roundChoisi={roundChoisi}
          matches={matches}
          rounds={rounds}
          joueurs={joueurs}
          participants={participants}
          committe={committeThisRound}
          pending={pending}
          onValider={onValiderEtTransition}
        />
      )}

      {onglet === 'classement' && (
        <ClassementBracketPanel
          rounds={rounds}
          roundChoisi={roundChoisi}
          matches={matches}
          scenario={scenario}
          arbreScenario={arbreScenario}
          players={players}
          surface={surface}
          joueurs={joueurs}
          participants={participants}
          picksBracket={picksBracket}
        />
      )}

      {onglet === 'import' && (
        <ImportBracketPanel tournamentId={tournamentId} participants={participants} onImporte={onImporte} />
      )}
    </div>
  );
}
