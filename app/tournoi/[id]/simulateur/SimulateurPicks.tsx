'use client';

import { useMemo, useState, useTransition } from 'react';
import { cleDuel, resoudreArbre, type MatchReel } from '@/lib/bracketSim';
import type { MatchRow } from '@/supabase/queries';
import type { Half } from '@/lib/types';
import BracketReelPanel from './BracketReelPanel';
import PicksHypothetiquesPanel from './PicksHypothetiquesPanel';
import { effacerPickSimule, validerPickSimule } from './picksActions';
import { cleSlot, pointsPossiblesPick, versMatchRowsTestees } from './picksSim';
import { MOI, nomStock, type Joueur, type Participant } from './types';
import { carte, pilleSelecteur } from '@/app/ui';

type Onglet = 'tableau' | 'picks';

/**
 * Section Picks du simulateur — distincte de la section Bracket : simule le
 * jeu de picks détaillé (barème de l'onglet Picks réel), pas le simulateur
 * de bracket à ancre unique.
 *
 * Le tableau testé est un bac à sable INDÉPENDANT du Bracket réel de la
 * section Bracket (son propre scénario, jamais partagé) ; les points déjà
 * inscrits viennent des vrais picks (tn_picks, calcul déjà utilisé par
 * Résultats) et les points possibles de l'espérance du moteur existant
 * (celui qui alimente déjà l'écran Picks et Fantasy), jamais d'un nouveau
 * moteur.
 */
export default function SimulateurPicks({
  tournamentId,
  rounds,
  matchRows,
  matches,
  joueurs,
  esperances,
  participants,
  dejaInscrits,
  picksSimulesInitiaux,
  roundParDefaut,
}: {
  tournamentId: string;
  rounds: string[];
  matchRows: MatchRow[];
  matches: MatchReel[];
  joueurs: Record<string, Joueur>;
  /** E[points | joueur X au tour R] — moteur Monte Carlo existant (supabase/projections.ts). */
  esperances: Record<string, Record<string, number>>;
  participants: Participant[];
  /** stock -> somme des points de ses VRAIS picks (tn_picks), déjà calculée côté serveur. */
  dejaInscrits: Record<string, number>;
  /** stock -> `${round}|${half}` -> playerId, pour les picks hypothétiques déjà enregistrés. */
  picksSimulesInitiaux: Record<string, Record<string, string>>;
  roundParDefaut: string;
}) {
  const stocks = useMemo(() => [MOI, ...participants.map((p) => p.id)], [participants]);

  const [onglet, setOnglet] = useState<Onglet>('tableau');
  const [scenario, setScenario] = useState<Map<string, string>>(new Map());
  const [picksSimules, setPicksSimules] = useState<Record<string, Map<string, string>>>(() => {
    const out: Record<string, Map<string, string>> = {};
    for (const s of stocks) out[s] = new Map(Object.entries(picksSimulesInitiaux[s] ?? {}));
    return out;
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const arbreTeste = useMemo(
    () => resoudreArbre(matches, rounds, (r, p) => scenario.get(cleDuel(r, p)) ?? null),
    [matches, rounds, scenario],
  );
  const matchRowsTestes = useMemo(() => versMatchRowsTestees(matchRows, arbreTeste), [matchRows, arbreTeste]);

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

  function onChangerPick(stockId: string, round: string, half: Half | null, playerId: string) {
    setErreur(null);
    setPicksSimules((prev) => {
      const copie = new Map(prev[stockId] ?? []);
      copie.set(cleSlot(round, half), playerId);
      return { ...prev, [stockId]: copie };
    });
    startTransition(async () => {
      const r = await validerPickSimule(tournamentId, round, half, playerId, stockId === MOI ? null : stockId);
      if (!r.ok) setErreur(r.error ?? 'Erreur');
    });
  }

  function onEffacerPick(stockId: string, round: string, half: Half | null) {
    setErreur(null);
    setPicksSimules((prev) => {
      const copie = new Map(prev[stockId] ?? []);
      copie.delete(cleSlot(round, half));
      return { ...prev, [stockId]: copie };
    });
    startTransition(async () => {
      const r = await effacerPickSimule(tournamentId, round, half, stockId === MOI ? null : stockId);
      if (!r.ok) setErreur(r.error ?? 'Erreur');
    });
  }

  const pointsPossibles = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of stocks) {
      let total = 0;
      for (const [cle, playerId] of picksSimules[s] ?? []) {
        const round = cle.split('|')[0];
        total += pointsPossiblesPick(arbreTeste, round, playerId, esperances);
      }
      out[s] = total;
    }
    return out;
  }, [stocks, picksSimules, arbreTeste, esperances]);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {stocks.map((s) => {
          const reel = dejaInscrits[s] ?? 0;
          const simule = Math.round(pointsPossibles[s] ?? 0);
          return (
            <div key={s} className={`flex items-center justify-between px-3 py-2 ${carte}`}>
              <span className="text-sm font-medium">{nomStock(s, participants)}</span>
              <span className="flex items-center gap-3 text-xs text-zinc-500">
                <span>
                  réel <span className="font-semibold text-zinc-900">{reel}</span>
                </span>
                <span>
                  simulé <span className="font-semibold text-zinc-900">{simule}</span>
                </span>
                <span>
                  total <span className="font-semibold text-zinc-900">{reel + simule}</span>
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <nav className="flex flex-wrap gap-1.5 border-b border-zinc-200 pb-2">
        <button onClick={() => setOnglet('picks')} className={pilleSelecteur(onglet === 'picks')}>
          Picks hypothétiques
        </button>
        <button onClick={() => setOnglet('tableau')} className={pilleSelecteur(onglet === 'tableau')}>
          Tableau testé
        </button>
      </nav>

      {erreur && <p className="text-xs text-red-600">{erreur}</p>}

      {onglet === 'tableau' && (
        <BracketReelPanel
          key={roundParDefaut}
          rounds={rounds}
          roundDepart={roundParDefaut}
          joueurs={joueurs}
          arbre={arbreTeste}
          onChoisir={onChoisirScenario}
          onEffacer={onEffacerScenario}
        />
      )}

      {onglet === 'picks' && (
        <PicksHypothetiquesPanel
          rounds={rounds}
          roundDepart={roundParDefaut}
          matchRowsTestes={matchRowsTestes}
          joueurs={joueurs}
          esperances={esperances}
          participants={participants}
          picksSimules={picksSimules}
          pending={pending}
          onChanger={onChangerPick}
          onEffacer={onEffacerPick}
        />
      )}
    </div>
  );
}
