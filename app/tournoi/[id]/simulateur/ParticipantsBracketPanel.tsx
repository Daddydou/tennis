'use client';

import { useMemo, useState } from 'react';
import { cleDuel, ensemblesAtteignables, type MatchReel } from '@/lib/bracketSim';
import { MOI, nomStock, type Joueur, type Participant } from './types';
import { boutonPrimaire, champTexte, pilleSelecteur } from '@/app/ui';

/**
 * Bloc 3 — Bracket des participants : pour le tour choisi (bloc 1), un
 * pronostic de VAINQUEUR par match (pas les deux joueurs), un stock à la
 * fois. Les options du menu déroulant sont « les joueurs encore en lice à
 * ce tour » — `ensemblesAtteignables` (lib/bracketSim.ts), un fait du
 * tableau réel (élimination déjà survenue), jamais influencé par les clics
 * hypothétiques du bloc 2 : les deux panneaux restent indépendants, comme
 * Bracket réel/Pronostics l'ont toujours été dans cet écran.
 *
 * Brouillon local (`draft`, initialisé UNE FOIS depuis `committe` — les
 * pronostics déjà enregistrés pour CE tour) tant que « Valider » n'a pas été
 * cliqué. Monté avec `key={roundChoisi}` par le parent : changer de tour au
 * bloc 1 démonte/remonte ce panneau, abandonnant tout brouillon non validé
 * sans jamais l'accumuler sur un autre tour (cf. actions.ts
 * `sauvegarderPronosticsBracket`, qui remplace tout le tour d'un coup).
 */
export default function ParticipantsBracketPanel({
  roundChoisi,
  matches,
  rounds,
  joueurs,
  participants,
  committe,
  pending,
  onValider,
}: {
  roundChoisi: string;
  matches: MatchReel[];
  rounds: string[];
  joueurs: Record<string, Joueur>;
  participants: Participant[];
  /** stock -> position -> playerId déjà enregistré pour ce tour. */
  committe: Record<string, Map<number, string>>;
  pending: boolean;
  onValider: (
    stockId: string,
    picks: { position: number; playerId: string | null }[],
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const stocks = [MOI, ...participants.map((p) => p.id)];
  const [stockActif, setStockActif] = useState<string>(MOI);
  const [draft, setDraft] = useState<Record<string, Map<number, string>>>(() => {
    const out: Record<string, Map<number, string>> = {};
    for (const s of stocks) out[s] = new Map(committe[s] ?? []);
    return out;
  });
  const [erreurParStock, setErreurParStock] = useState<Record<string, string | undefined>>({});

  const nom = (id: string) => joueurs[id]?.nom ?? id;
  const rang = (id: string) => joueurs[id]?.rang ?? null;

  const matchsDuTour = matches.filter((m) => m.round === roundChoisi).sort((a, b) => a.position - b.position);
  const atteignables = useMemo(() => ensemblesAtteignables(matches, rounds), [matches, rounds]);

  const draftActif = draft[stockActif] ?? new Map<number, string>();
  const modifie = (s: string) => {
    const d = draft[s] ?? new Map();
    const c = committe[s] ?? new Map();
    if (d.size !== c.size) return true;
    for (const [pos, id] of d) if (c.get(pos) !== id) return true;
    return false;
  };

  function onChangerDraft(position: number, playerId: string) {
    setDraft((prev) => {
      const copie = new Map(prev[stockActif] ?? []);
      if (playerId) copie.set(position, playerId);
      else copie.delete(position);
      return { ...prev, [stockActif]: copie };
    });
  }

  async function valider() {
    setErreurParStock((prev) => ({ ...prev, [stockActif]: undefined }));
    const picks = matchsDuTour.map((m) => ({
      position: m.position,
      playerId: draftActif.get(m.position) ?? null,
    }));
    const r = await onValider(stockActif, picks);
    if (!r.ok) setErreurParStock((prev) => ({ ...prev, [stockActif]: r.error ?? 'Erreur' }));
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Pour chaque match du tour {roundChoisi}, le vainqueur pronostiqué par ce participant, parmi les joueurs
        encore en lice à ce match — ou « — » s&apos;il n&apos;en a plus aucun dans la course.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {stocks.map((s) => (
          <button
            key={s}
            data-testid={`participants-stock-tab-${s}`}
            onClick={() => setStockActif(s)}
            className={pilleSelecteur(s === stockActif)}
          >
            {nomStock(s, participants)}
            {modifie(s) && <span className="ml-1 text-amber-500">●</span>}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {matchsDuTour.length === 0 && (
          <p className="text-sm text-zinc-500">Le tour {roundChoisi} n&apos;est pas encore constitué.</p>
        )}
        {matchsDuTour.map((m) => {
          const cle = cleDuel(m.round, m.position);
          const candidats = [...(atteignables.get(cle) ?? [])].sort((a, b) => nom(a).localeCompare(nom(b)));
          const valeur = draftActif.get(m.position) ?? '';
          const caption =
            m.player1Id && m.player2Id
              ? `${nom(m.player1Id)} vs ${nom(m.player2Id)}`
              : m.player1Id || m.player2Id
                ? `${nom(m.player1Id ?? m.player2Id!)} vs à déterminer`
                : 'à déterminer';

          return (
            <div
              key={cle}
              className="flex items-center gap-2 rounded border border-zinc-200 px-2.5 py-2 text-sm dark:border-zinc-800"
            >
              <span className="w-36 shrink-0 truncate text-xs text-zinc-400" title={caption}>
                {caption}
              </span>
              <select
                disabled={pending || candidats.length === 0}
                value={valeur}
                onChange={(e) => onChangerDraft(m.position, e.target.value)}
                data-testid={`pick-${roundChoisi}-${m.position}`}
                aria-label={caption}
                className={`min-w-0 flex-1 ${champTexte}`}
              >
                <option value="">— aucun joueur en lice</option>
                {candidats.map((id) => (
                  <option key={id} value={id}>
                    {nom(id)}
                    {rang(id) ? ` #${rang(id)}` : ''}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {erreurParStock[stockActif] && (
        <p className="text-xs text-red-600 dark:text-red-400">{erreurParStock[stockActif]}</p>
      )}

      <div className="flex items-center gap-2">
        <button onClick={valider} disabled={pending || matchsDuTour.length === 0} className={boutonPrimaire}>
          Valider les pronostics de {nomStock(stockActif, participants)} pour {roundChoisi}
        </button>
        {!modifie(stockActif) && <span className="text-[11px] text-zinc-400">déjà à jour</span>}
      </div>
    </div>
  );
}
