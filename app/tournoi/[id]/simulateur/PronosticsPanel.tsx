'use client';

import { useState } from 'react';
import { cleDuel, type MatchReel } from '@/lib/bracketSim';
import { MOI, nomStock, type Joueur, type Participant } from './types';

/**
 * Pronostics de chaque participant, un onglet à la fois — jamais les trois en
 * même temps. Une liste déroulante PAR MATCH restant, indépendante des
 * autres (cf. lib/bracketSim.ts `scoreDuStock`) : pas de cheminement à
 * reconstruire, chaque emplacement se corrige seul.
 *
 * Le pronostic initial (tn_bracket_predictions, saisi depuis le premier
 * tour) est pré-rempli s'il tient encore ; « Éliminé » s'affiche sinon, et
 * la liste ne propose alors que les joueurs réellement encore qualifiés
 * pour cet emplacement.
 *
 * Le tour d'affichage max n'est qu'un CONFORT DE SAISIE : il limite les
 * onglets de tour montrés ici (pour ne pas empiler des demies et une
 * finale avant que l'utilisateur les ait réfléchies), rien de plus — les
 * pronostics déjà enregistrés sur des tours plus tardifs restent en base
 * et continuent de compter normalement dans le classement et le Monte
 * Carlo (onglet Classement), qu'ils soient affichés ici ou non.
 */
export default function PronosticsPanel({
  rounds,
  roundDepart,
  matches,
  joueurs,
  participants,
  predictions,
  ensembles,
  reels,
  pending,
  onChanger,
  onEffacer,
}: {
  rounds: string[];
  roundDepart: string;
  matches: MatchReel[];
  joueurs: Record<string, Joueur>;
  participants: Participant[];
  predictions: Record<string, Map<string, string>>;
  ensembles: Map<string, Set<string>>;
  reels: Map<string, string>;
  pending: boolean;
  onChanger: (stockId: string, round: string, position: number, playerId: string) => void;
  onEffacer: (stockId: string, round: string, position: number) => void;
}) {
  const stocks = [MOI, ...participants.map((p) => p.id)];
  const roundsDepuisDepart = rounds.slice(rounds.indexOf(roundDepart));

  const [stockActif, setStockActif] = useState<string>(MOI);
  // Par défaut, seul le tour de départ est proposé à l'édition — on étend
  // au besoin, sans jamais restreindre ce qui est déjà enregistré ni ce
  // qui compte dans les calculs (cf. docstring).
  const [tourMaxAffiche, setTourMaxAffiche] = useState(roundDepart);
  const roundsAffiches = roundsDepuisDepart.slice(0, roundsDepuisDepart.indexOf(tourMaxAffiche) + 1);

  const [roundAffiche, setRoundAffiche] = useState(roundDepart);
  // Si le plafond redescend sous le tour actuellement consulté, on retombe
  // sur le dernier tour encore proposé plutôt que d'afficher un onglet fantôme.
  const roundAfficheValide = roundsAffiches.includes(roundAffiche)
    ? roundAffiche
    : roundsAffiches[roundsAffiches.length - 1];

  const nom = (id: string) => joueurs[id]?.nom ?? id;
  const rang = (id: string) => joueurs[id]?.rang ?? null;

  const slotsDuRound = matches
    .filter((m) => m.round === roundAfficheValide)
    .map((m) => m.position)
    .sort((a, b) => a - b);

  const predictionsDuStock = predictions[stockActif] ?? new Map<string, string>();

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Le pronostic complet de chacun, depuis le premier tour. À partir du tour
        choisi, corrige ici ce qui est devenu impossible — le reste (avant ce
        tour) se saisit à la main dans l&apos;onglet Classement.
      </p>

      <div className="flex flex-wrap gap-1">
        {stocks.map((s) => (
          <button
            key={s}
            onClick={() => setStockActif(s)}
            className={`rounded border px-2.5 py-1 text-xs ${
              s === stockActif
                ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
            }`}
          >
            {nomStock(s, participants)}
          </button>
        ))}
      </div>

      <div>
        <p className="mb-1 text-[11px] text-zinc-400">
          Afficher les tours jusqu&apos;à — les tours plus tardifs déjà
          renseignés ne sont pas affectés, juste masqués ici
        </p>
        <div className="flex flex-wrap gap-1">
          {roundsDepuisDepart.map((r) => (
            <button
              key={r}
              onClick={() => setTourMaxAffiche(r)}
              className={`rounded border px-2.5 py-1 text-xs ${
                r === tourMaxAffiche
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {roundsAffiches.map((r) => (
          <button
            key={r}
            onClick={() => setRoundAffiche(r)}
            className={`rounded border px-2.5 py-1 text-xs ${
              r === roundAfficheValide
                ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {slotsDuRound.length === 0 && (
          <p className="text-sm text-zinc-500">Aucun match à ce tour.</p>
        )}
        {slotsDuRound.map((position) => {
          const cle = cleDuel(roundAfficheValide, position);
          const reel = reels.get(cle) ?? null;
          const options = [...(ensembles.get(cle) ?? [])].sort(
            (a, b) => (rang(a) ?? 9999) - (rang(b) ?? 9999) || nom(a).localeCompare(nom(b)),
          );
          const predit = predictionsDuStock.get(cle) ?? null;
          const enLice = predit !== null && (options.includes(predit) || predit === reel);

          return (
            <div
              key={cle}
              className="flex items-center gap-2 rounded border border-zinc-200 px-2.5 py-2 text-sm dark:border-zinc-800"
            >
              <span className="w-10 shrink-0 text-xs text-zinc-400">{roundAfficheValide}</span>

              {reel ? (
                <span className="flex-1 truncate">
                  <span className="text-zinc-400">réel :</span> {nom(reel)}
                  {predit && (
                    <span
                      className={`ml-1 text-xs ${
                        predit === reel
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-500'
                      }`}
                    >
                      {predit === reel ? '✓' : `✗ (prédit : ${nom(predit)})`}
                    </span>
                  )}
                </span>
              ) : (
                <>
                  <select
                    disabled={pending || options.length === 0}
                    value={enLice ? (predit ?? '') : ''}
                    onChange={(e) => {
                      if (e.target.value) onChanger(stockActif, roundAfficheValide, position, e.target.value);
                      else onEffacer(stockActif, roundAfficheValide, position);
                    }}
                    className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <option value="">—</option>
                    {options.map((id) => (
                      <option key={id} value={id}>
                        {nom(id)}
                        {rang(id) ? ` #${rang(id)}` : ''}
                      </option>
                    ))}
                  </select>
                  {predit && !enLice && (
                    <span className="shrink-0 text-xs text-red-500" title={`Prédit à l'origine : ${nom(predit)}`}>
                      Éliminé ({nom(predit)})
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
