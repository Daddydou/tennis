'use client';

import { useState } from 'react';
import BadgeSourceElo, { classeElo } from '../BadgeSourceElo';
import type { SourceElo } from '@/supabase/elo';

/** Contribution d'un tour à l'espérance d'un joueur. */
export interface LigneTourVue {
  round: string;
  multiplicateur: number;
  /** P(dispute ce tour), depuis le tirage. */
  pReach: number;
  points: number;
  pondere: number;
}

export interface MembreVue {
  /** Numéro du palier, tel qu'affiché. */
  numero: number;
  libellePalier: string;
  /** null quand aucun joueur éligible n'est disponible pour ce palier. */
  playerId: string | null;
  nom: string | null;
  rang: number | null;
  pays: string | null;
  elo: number | null;
  sourceElo: SourceElo;
  taName: string | null;
  candidats: string[];
  eTotal: number;
  detail: LigneTourVue[];
  /** Joueurs du tableau éligibles à ce palier. */
  eligibles: number;
}

function pourcent(p: number): string {
  if (p <= 0) return '0 %';
  if (p >= 0.995) return '100 %';
  return `${(p * 100).toFixed(p < 0.1 ? 1 : 0)} %`;
}

/** Ventilation tour par tour de l'espérance d'un joueur. */
function DetailJoueur({ detail }: { detail: LigneTourVue[] }) {
  if (detail.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-zinc-500">
        Aucune ventilation disponible.
      </p>
    );
  }

  const total = detail.reduce((s, l) => s + l.pondere, 0);

  return (
    <div className="overflow-x-auto px-3 py-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left uppercase tracking-wide text-zinc-500">
            <th className="py-1 pr-3 font-medium">Tour</th>
            <th className="py-1 pr-3 text-right font-medium">Présence</th>
            <th className="py-1 pr-3 text-right font-medium">Points</th>
            <th className="py-1 pr-3 text-right font-medium">Multiplicateur</th>
            <th className="py-1 pr-3 text-right font-medium">Pondéré</th>
          </tr>
        </thead>
        <tbody>
          {detail.map((l) => (
            <tr
              key={l.round}
              className="border-t border-zinc-100 dark:border-zinc-900"
            >
              <td className="py-1 pr-3">{l.round}</td>
              <td className="py-1 pr-3 text-right tabular-nums text-zinc-500">
                {pourcent(l.pReach)}
              </td>
              <td className="py-1 pr-3 text-right font-mono tabular-nums">
                {l.points.toFixed(2)}
              </td>
              <td className="py-1 pr-3 text-right font-mono tabular-nums text-zinc-500">
                ×{l.multiplicateur}
              </td>
              <td className="py-1 pr-3 text-right font-mono font-medium tabular-nums">
                {l.pondere.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-300 dark:border-zinc-700">
            <td colSpan={4} className="py-1 pr-3 text-right text-zinc-500">
              Espérance totale
            </td>
            <td className="py-1 pr-3 text-right font-mono font-semibold tabular-nums">
              {total.toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function LignePalier({ m }: { m: MembreVue }) {
  const [ouvert, setOuvert] = useState(false);
  const cliquable = m.playerId !== null;

  return (
    <>
      <tr
        onClick={cliquable ? () => setOuvert((o) => !o) : undefined}
        className={`border-b border-zinc-100 dark:border-zinc-900 ${
          cliquable
            ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900'
            : ''
        }`}
      >
        <td className="py-2 pr-3 whitespace-nowrap">
          <span className="text-zinc-400">{m.numero}.</span>{' '}
          <span className="text-xs text-zinc-500">{m.libellePalier}</span>
        </td>
        <td className="py-2 pr-3">
          {m.playerId === null ? (
            <span className="text-amber-600 dark:text-amber-400">
              Aucun joueur éligible
            </span>
          ) : (
            <span className="font-medium">
              <span className="mr-1 inline-block w-3 text-zinc-400">
                {ouvert ? '▾' : '▸'}
              </span>
              {m.nom}
              {m.pays && (
                <span className="ml-1.5 text-xs text-zinc-400">{m.pays}</span>
              )}
            </span>
          )}
        </td>
        <td className="py-2 pr-3 text-right tabular-nums text-zinc-500">
          {m.rang ?? '—'}
        </td>
        <td
          className={`py-2 pr-3 text-right font-mono tabular-nums ${classeElo(
            m.sourceElo,
          )}`}
          title="Elo effectif utilisé par la simulation (pondéré surface)"
        >
          {m.elo ?? '—'}
        </td>
        <td className="py-2 pr-3">
          {m.playerId && (
            <span className="flex justify-end">
              <BadgeSourceElo
                source={m.sourceElo}
                taName={m.taName}
                candidats={m.candidats}
              />
            </span>
          )}
        </td>
        <td className="py-2 pr-3 text-right font-mono font-medium tabular-nums">
          {m.playerId ? m.eTotal.toFixed(1) : '—'}
        </td>
      </tr>

      {ouvert && m.playerId && (
        <tr className="border-b border-zinc-100 bg-zinc-50/60 dark:border-zinc-900 dark:bg-zinc-900/40">
          <td colSpan={6} className="p-0">
            <DetailJoueur detail={m.detail} />
          </td>
        </tr>
      )}
    </>
  );
}

export default function EquipeFantasy({ equipe }: { equipe: MembreVue[] }) {
  const total = equipe.reduce((s, m) => s + (m.playerId ? m.eTotal : 0), 0);
  const manquants = equipe.filter((m) => m.playerId === null);

  return (
    <div className="space-y-3">
      {manquants.length > 0 && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {manquants.length} palier(s) n&apos;ont pas pu être pourvus :{' '}
          {manquants.map((m) => `« ${m.libellePalier} »`).join(', ')}. Le tableau
          ne contient pas assez de joueurs classés dans cette fourchette — sur un
          petit tableau, ou quand des classements manquent, l&apos;équipe est
          forcément incomplète.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
              <th className="py-2 pr-3 font-medium">Palier</th>
              <th className="py-2 pr-3 font-medium">Joueur</th>
              <th className="py-2 pr-3 text-right font-medium">Rang</th>
              <th className="py-2 pr-3 text-right font-medium">Elo</th>
              <th className="py-2 pr-3 text-right font-medium">Source</th>
              <th className="py-2 pr-3 text-right font-medium">E[pts]</th>
            </tr>
          </thead>
          <tbody>
            {equipe.map((m) => (
              <LignePalier key={m.numero} m={m} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-300 dark:border-zinc-700">
              <td colSpan={5} className="py-2 pr-3 text-right text-zinc-500">
                Total de l&apos;équipe
              </td>
              <td className="py-2 pr-3 text-right font-mono text-base font-semibold tabular-nums">
                {total.toFixed(1)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-zinc-500">
        Clique sur un joueur pour voir la ventilation de son espérance tour par
        tour (présence × points × multiplicateur).
      </p>
    </div>
  );
}
