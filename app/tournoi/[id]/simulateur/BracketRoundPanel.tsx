'use client';

import type { ArbreResolu, EmplacementDuel } from '@/lib/bracketSim';
import type { Joueur } from './types';

/**
 * Bloc 2 — Bracket réel, restreint au SEUL tour choisi au bloc 1 (pas de
 * navigation interne : contrairement à BracketReelPanel, réutilisé par la
 * section Picks, ce panneau n'affiche jamais qu'un tour à la fois — « seul
 * ce tour est simulé, pas les tours suivants »).
 *
 * Un tour déjà joué est pré-rempli sur son vrai résultat (verrouillé,
 * non cliquable) ; un tour à venir se clique pour désigner un vainqueur —
 * c'est CETTE ligne de jeu (réelle jusqu'à un point, cliquée au-delà) qui
 * sert de référence pour noter les pronostics du bloc 3 (bloc 4).
 */
export default function BracketRoundPanel({
  roundChoisi,
  joueurs,
  arbre,
  onChoisir,
  onEffacer,
}: {
  roundChoisi: string;
  joueurs: Record<string, Joueur>;
  arbre: ArbreResolu;
  onChoisir: (position: number, playerId: string) => void;
  onEffacer: (position: number) => void;
}) {
  const nom = (id: string | null) => (id ? (joueurs[id]?.nom ?? id) : null);
  const rang = (id: string | null) => (id ? (joueurs[id]?.rang ?? null) : null);

  const duels = arbre.duels.filter((d) => d.round === roundChoisi).sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500" data-testid="bracket-reel-round">
        Bracket réel du tour <span className="font-medium text-zinc-700">{roundChoisi}</span> —
        les matchs déjà joués sont figés sur leur vrai résultat ; clique un joueur pour désigner le vainqueur des
        autres.
      </p>

      <div className="space-y-1.5">
        {duels.length === 0 && (
          <p className="text-sm text-zinc-500">Le tour {roundChoisi} n&apos;est pas encore constitué.</p>
        )}
        {duels.map((d) => (
          <Duel
            key={`${d.round}-${d.position}`}
            duel={d}
            nom={nom}
            rang={rang}
            onChoisir={d.verrouille || !d.a || !d.b ? null : (playerId) => onChoisir(d.position, playerId)}
            onEffacer={!d.verrouille && d.vainqueur ? () => onEffacer(d.position) : null}
          />
        ))}
      </div>
    </div>
  );
}

function Duel({
  duel,
  nom,
  rang,
  onChoisir,
  onEffacer,
}: {
  duel: EmplacementDuel;
  nom: (id: string | null) => string | null;
  rang: (id: string | null) => number | null;
  onChoisir: ((playerId: string) => void) | null;
  onEffacer: (() => void) | null;
}) {
  const ligne = (id: string | null) => {
    const n = nom(id);
    const actif = duel.vainqueur !== null && duel.vainqueur === id;
    if (!n) {
      return (
        <div className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-300 px-2.5 text-center text-xs text-zinc-400">
          en attente
        </div>
      );
    }
    const style = duel.verrouille
      ? actif
        ? 'border-emerald-400 bg-emerald-50 font-medium'
        : 'border-zinc-200 text-zinc-400'
      : actif
        ? 'border-blue-600 bg-blue-600 font-medium text-white'
        : 'border-zinc-300 hover:border-zinc-500';
    const cliquable = onChoisir !== null && id !== null;
    return (
      <button
        type="button"
        disabled={!cliquable}
        onClick={cliquable ? () => onChoisir!(id as string) : undefined}
        className={`min-h-11 flex-1 rounded-lg border px-2.5 py-2 text-left text-sm transition ${
          cliquable ? 'cursor-pointer active:scale-[0.97]' : 'cursor-default'
        } ${style}`}
      >
        <span className="truncate">
          {n}
          {rang(id) ? <span className="ml-1 text-xs opacity-60">#{rang(id)}</span> : null}
        </span>
        {duel.verrouille && actif && <span className="ml-1 text-xs">✓ joué</span>}
      </button>
    );
  };

  return (
    <div className="space-y-1 rounded-2xl bg-white p-2 shadow-card">
      <div className="flex gap-1.5">
        {ligne(duel.a)}
        {ligne(duel.b)}
      </div>
      {onEffacer && (
        <button
          onClick={onEffacer}
          className="min-h-11 px-0.5 text-[11px] text-zinc-400 transition active:scale-[0.97] hover:text-red-600"
        >
          Retirer ce résultat
        </button>
      )}
    </div>
  );
}
