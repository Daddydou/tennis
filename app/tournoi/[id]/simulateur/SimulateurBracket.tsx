'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  cleDuel,
  ensemblesAtteignables,
  maxAtteignable,
  pointsDuTour,
  resoudreArbre,
  scoreDuStock,
  type EmplacementDuel,
  type MatchReel,
} from '@/lib/bracketSim';
import { enregistrerPronostic, effacerPronostic } from './actions';

const MOI = 'moi' as const;

interface Joueur {
  nom: string;
  rang: number | null;
}

interface Participant {
  id: string;
  nom: string;
}

interface Props {
  tournamentId: string;
  rounds: string[];
  matches: MatchReel[];
  joueurs: Record<string, Joueur>;
  participants: Participant[];
  /** stock ('moi' ou id participant) -> `${round}|${position}` -> playerId. */
  predictionsInitiales: Record<string, Record<string, string>>;
  tourParDefaut: string | null;
}

/** Efface, dans une map de pronostics, tout ce qui dépendait de (round, position). */
function effacerCascade(map: Map<string, string>, rounds: string[], round: string, position: number) {
  const idx = rounds.indexOf(round);
  let pos = position;
  for (let i = idx + 1; i < rounds.length; i++) {
    pos = Math.floor(pos / 2);
    map.delete(cleDuel(rounds[i], pos));
  }
}

function definir(
  map: Map<string, string>,
  rounds: string[],
  round: string,
  position: number,
  playerId: string,
): Map<string, string> {
  const copie = new Map(map);
  copie.set(cleDuel(round, position), playerId);
  effacerCascade(copie, rounds, round, position);
  return copie;
}

function effacer(map: Map<string, string>, rounds: string[], round: string, position: number): Map<string, string> {
  const copie = new Map(map);
  copie.delete(cleDuel(round, position));
  effacerCascade(copie, rounds, round, position);
  return copie;
}

function versMap(obj: Record<string, string> | undefined): Map<string, string> {
  return new Map(Object.entries(obj ?? {}));
}

/** Une ligne cliquable d'un duel : nom, rang, éventuel indicateur de correction. */
function LigneChoix({
  joueur,
  actif,
  verrouille,
  onClick,
}: {
  joueur: Joueur | null;
  actif: boolean;
  verrouille: boolean;
  onClick?: () => void;
}) {
  if (!joueur) {
    return (
      <div className="flex-1 rounded border border-dashed border-zinc-200 px-2.5 py-2 text-center text-xs text-zinc-400 dark:border-zinc-800">
        en attente
      </div>
    );
  }

  const base = 'flex-1 rounded border px-2.5 py-2 text-left text-sm transition-colors';
  const style = verrouille
    ? actif
      ? 'border-emerald-400 bg-emerald-50 font-medium dark:border-emerald-700 dark:bg-emerald-950'
      : 'border-zinc-200 text-zinc-400 dark:border-zinc-800'
    : actif
      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
      : 'border-zinc-300 hover:border-zinc-500 dark:border-zinc-700';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`${base} ${style} ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <span className="truncate">
        {joueur.nom}
        {joueur.rang ? <span className="ml-1 text-xs opacity-60">#{joueur.rang}</span> : null}
      </span>
      {verrouille && actif && <span className="ml-1 text-xs">✓ joué</span>}
    </button>
  );
}

/** Un duel : deux lignes cliquables (ou verrouillées), plus les étiquettes des stocks. */
function DuelCard({
  duel,
  joueurs,
  onChoisir,
  etiquettes,
}: {
  duel: EmplacementDuel;
  joueurs: Record<string, Joueur>;
  /** null = duel non éditable ici (verrouillé, ou entrants inconnus). */
  onChoisir: ((playerId: string) => void) | null;
  /** Pronostics de chaque stock sur ce duel, pour affichage comparatif. */
  etiquettes: { nom: string; playerId: string | null }[];
}) {
  const vue = (id: string | null): Joueur | null => (id ? (joueurs[id] ?? { nom: id, rang: null }) : null);
  const cliquable = onChoisir !== null && !duel.verrouille && duel.a !== null && duel.b !== null;

  return (
    <div className="space-y-1.5 rounded border border-zinc-200 p-2 dark:border-zinc-800">
      <div className="flex gap-1.5">
        <LigneChoix
          joueur={vue(duel.a)}
          actif={duel.vainqueur !== null && duel.vainqueur === duel.a}
          verrouille={duel.verrouille}
          onClick={cliquable && duel.a ? () => onChoisir!(duel.a as string) : undefined}
        />
        <LigneChoix
          joueur={vue(duel.b)}
          actif={duel.vainqueur !== null && duel.vainqueur === duel.b}
          verrouille={duel.verrouille}
          onClick={cliquable && duel.b ? () => onChoisir!(duel.b as string) : undefined}
        />
      </div>
      {etiquettes.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
          {etiquettes.map((e) => (
            <span key={e.nom}>
              {e.nom} :{' '}
              {e.playerId ? (
                <span
                  className={
                    duel.vainqueur === null
                      ? ''
                      : e.playerId === duel.vainqueur
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-500 line-through'
                  }
                >
                  {vue(e.playerId)?.nom ?? e.playerId}
                </span>
              ) : (
                <span className="italic">—</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SimulateurBracket({
  tournamentId,
  rounds,
  matches,
  joueurs,
  participants,
  predictionsInitiales,
  tourParDefaut,
}: Props) {
  const stocks = useMemo(() => [MOI, ...participants.map((p) => p.id)], [participants]);
  const nomStock = (id: string) => (id === MOI ? 'Moi' : (participants.find((p) => p.id === id)?.nom ?? id));

  const [predictions, setPredictions] = useState<Record<string, Map<string, string>>>(() => {
    const out: Record<string, Map<string, string>> = {};
    for (const s of stocks) out[s] = versMap(predictionsInitiales[s]);
    return out;
  });
  const [scenario, setScenario] = useState<Map<string, string>>(new Map());
  const [mode, setMode] = useState<'scenario' | 'predire'>('scenario');
  const [stockEdite, setStockEdite] = useState<string>(MOI);
  const [tourAffiche, setTourAffiche] = useState<string>(tourParDefaut ?? rounds[0]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const atteignables = useMemo(() => ensemblesAtteignables(matches, rounds), [matches, rounds]);

  const arbreScenario = useMemo(
    () => resoudreArbre(matches, rounds, (r, p) => scenario.get(cleDuel(r, p)) ?? null),
    [matches, rounds, scenario],
  );

  const arbrePronostic = useMemo(
    () =>
      resoudreArbre(matches, rounds, (r, p) => predictions[stockEdite]?.get(cleDuel(r, p)) ?? null),
    [matches, rounds, predictions, stockEdite],
  );

  const classement = useMemo(() => {
    return stocks
      .map((s) => {
        const preds = predictions[s] ?? new Map();
        return {
          id: s,
          nom: nomStock(s),
          score: scoreDuStock(preds, arbreScenario, rounds),
          max: maxAtteignable(preds, matches, rounds, atteignables),
        };
      })
      .sort((a, b) => b.score - a.score || b.max - a.max);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks, predictions, arbreScenario, rounds, matches, atteignables]);

  function duelsDuTourAffiche(arbre: { duels: EmplacementDuel[] }): EmplacementDuel[] {
    return arbre.duels.filter((d) => d.round === tourAffiche);
  }

  function surScenarioChoisir(round: string, position: number, playerId: string) {
    setScenario((prev) => definir(prev, rounds, round, position, playerId));
  }

  function surScenarioEffacer(round: string, position: number) {
    setScenario((prev) => effacer(prev, rounds, round, position));
  }

  function surPronosticChoisir(round: string, position: number, playerId: string) {
    setErreur(null);
    const stockId = stockEdite;
    setPredictions((prev) => ({ ...prev, [stockId]: definir(prev[stockId] ?? new Map(), rounds, round, position, playerId) }));
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

  function surPronosticEffacer(round: string, position: number) {
    setErreur(null);
    const stockId = stockEdite;
    setPredictions((prev) => ({ ...prev, [stockId]: effacer(prev[stockId] ?? new Map(), rounds, round, position) }));
    startTransition(async () => {
      const r = await effacerPronostic(tournamentId, stockId === MOI ? null : stockId, round, position);
      if (!r.ok) setErreur(r.error ?? 'Erreur');
    });
  }

  const duelsAffiches = mode === 'scenario' ? duelsDuTourAffiche(arbreScenario) : duelsDuTourAffiche(arbrePronostic);
  const pickCourant = mode === 'predire' ? (predictions[stockEdite] ?? new Map()) : null;

  return (
    <div className="space-y-4">
      {/* ── Classement en direct ── */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {classement.map((c, i) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800"
          >
            <span className="text-sm font-medium">
              {i === 0 && c.score > 0 && '🏆 '}
              {c.nom}
            </span>
            <span className="text-right text-xs text-zinc-500">
              <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {c.score}
              </span>{' '}
              pts scénario
              <br />
              max {c.max} pts
            </span>
          </div>
        ))}
      </div>

      {/* ── Mode ── */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          onClick={() => setMode('scenario')}
          className={`rounded border px-2.5 py-1 font-medium ${
            mode === 'scenario'
              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
              : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'
          }`}
        >
          Simuler un scénario
        </button>
        <button
          onClick={() => setMode('predire')}
          className={`rounded border px-2.5 py-1 font-medium ${
            mode === 'predire'
              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
              : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'
          }`}
        >
          Saisir des prédictions
        </button>
        {mode === 'scenario' && scenario.size > 0 && (
          <button
            onClick={() => setScenario(new Map())}
            className="ml-auto text-zinc-500 underline-offset-2 hover:underline"
          >
            Réinitialiser le scénario
          </button>
        )}
      </div>

      {/* ── Sélecteur de participant, en mode prédiction ── */}
      {mode === 'predire' && (
        <div className="flex flex-wrap gap-1">
          {stocks.map((s) => (
            <button
              key={s}
              onClick={() => setStockEdite(s)}
              className={`rounded border px-2.5 py-1 text-xs ${
                s === stockEdite
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
              }`}
            >
              {nomStock(s)}
            </button>
          ))}
        </div>
      )}

      {/* ── Tour affiché ── */}
      <div className="flex flex-wrap gap-1">
        {rounds.map((r) => (
          <button
            key={r}
            onClick={() => setTourAffiche(r)}
            className={`rounded border px-2.5 py-1 text-xs ${
              r === tourAffiche
                ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
            }`}
          >
            {r} · {pointsDuTour(rounds, r)}pt{pointsDuTour(rounds, r) > 1 ? 's' : ''}
          </button>
        ))}
      </div>

      {erreur && <p className="text-xs text-red-600 dark:text-red-400">{erreur}</p>}
      {pending && <p className="text-xs text-zinc-400">Enregistrement…</p>}

      {/* ── Duels du tour affiché ── */}
      <div className="space-y-1.5">
        {duelsAffiches.length === 0 && (
          <p className="text-sm text-zinc-500">Rien à afficher pour ce tour.</p>
        )}
        {duelsAffiches.map((d) => {
          if (mode === 'scenario') {
            const etiquettes = stocks.map((s) => ({
              nom: nomStock(s),
              playerId: predictions[s]?.get(cleDuel(d.round, d.position)) ?? null,
            }));
            return (
              <div key={`${d.round}-${d.position}`} className="space-y-1">
                <DuelCard
                  duel={d}
                  joueurs={joueurs}
                  etiquettes={etiquettes}
                  onChoisir={
                    d.verrouille || !d.a || !d.b
                      ? null
                      : (playerId) => surScenarioChoisir(d.round, d.position, playerId)
                  }
                />
                {!d.verrouille && d.vainqueur && (
                  <button
                    onClick={() => surScenarioEffacer(d.round, d.position)}
                    className="text-[11px] text-zinc-400 hover:text-red-600"
                  >
                    Retirer ce résultat
                  </button>
                )}
              </div>
            );
          }

          return (
            <div key={`${d.round}-${d.position}`} className="space-y-1">
              <DuelCard
                duel={d}
                joueurs={joueurs}
                etiquettes={[]}
                onChoisir={
                  d.verrouille || !d.a || !d.b
                    ? null
                    : (playerId) => surPronosticChoisir(d.round, d.position, playerId)
                }
              />
              {!d.verrouille && d.vainqueur && pickCourant?.get(cleDuel(d.round, d.position)) && (
                <button
                  onClick={() => surPronosticEffacer(d.round, d.position)}
                  className="text-[11px] text-zinc-400 hover:text-red-600"
                >
                  Retirer la prédiction
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
