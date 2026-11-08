'use client';

import { useState } from 'react';
import { carte, noteInfo } from '@/app/ui';
import type { PlanMasters as Plan, StrategieMasters, StrategiesMasters } from '@/lib/mastersStrategies';
import { GrillePicks } from './ConseilsMasters';
import PanneauGTMasters from './PanneauGTMasters';

/**
 * Plan de picks d'un Masters : quatre stratégies pour TOUT le tournoi (tours à venir compris),
 * calculées sur les mêmes tournois simulés (lib/mastersStrategies.ts) et recalculées à chaque
 * chargement, donc après chaque résultat importé. La stratégie choisie ici est celle que le panneau
 * Game Tracker propose d'envoyer (tour ouvert seulement, jamais sans clic).
 */

const pts = (x: number) => x.toFixed(1).replace('.', ',');
const pct = (x: number) => `${Math.round(x * 100)} %`;

const DESCRIPTIONS: Record<Exclude<StrategieMasters, 'rivaux'>, string> = {
  prudent: 'Des points réguliers : on évite les paris, le mauvais cas est le moins mauvais.',
  equilibre: 'Le plus de points attendus sur tout le tournoi.',
  audacieux: 'Mise sur les joueurs à fort potentiel : plus de chances de gros score, au prix d’un mauvais cas plus bas.',
};

const signature = (p: Plan) =>
  p.picks
    .map((k) => `${k.round}|${k.half ?? ''}|${k.playerId}`)
    .sort()
    .join(';');

export default function PlanMasters({
  tournamentId,
  strategies,
  noms,
  avancement,
  afficherGT,
}: {
  tournamentId: string;
  strategies: StrategiesMasters;
  noms: Record<string, string>;
  avancement: { joues: number; total: number };
  /** Le panneau Game Tracker n'a plus de sens quand le tournoi est terminé. */
  afficherGT: boolean;
}) {
  const [choix, setChoix] = useState<StrategieMasters>('equilibre');
  const contre = strategies.rivauxNoms.length ? `Contre ${strategies.rivauxNoms.join(' et ')}` : 'Contre les rivaux';
  const liste: { cle: StrategieMasters; titre: string; plan: Plan }[] = [
    { cle: 'prudent', titre: 'Prudent', plan: strategies.prudent },
    { cle: 'equilibre', titre: 'Équilibré', plan: strategies.equilibre },
    { cle: 'audacieux', titre: 'Audacieux', plan: strategies.audacieux },
    ...(strategies.rivaux ? [{ cle: 'rivaux' as const, titre: contre, plan: strategies.rivaux }] : []),
  ];
  const actif = liste.find((s) => s.cle === choix) ?? liste[1];
  const identique = actif.cle !== 'equilibre' && actif.cle !== 'rivaux' && signature(actif.plan) === signature(strategies.equilibre);
  const mapNoms = new Map(Object.entries(noms));
  const { stats } = actif.plan;

  return (
    <div className="space-y-4" data-testid="plan-masters">
      <section className={`${carte} space-y-3 p-4`}>
        <header className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="text-base font-semibold">Picks proposés</h2>
          <span className="text-xs text-zinc-600" data-testid="avancement-masters">
            {avancement.joues} matchs joués sur {avancement.total} · recalculé après chaque résultat
          </span>
        </header>

        <div role="radiogroup" aria-label="Stratégie de picks" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {liste.map((s) => {
            const sel = s.cle === actif.cle;
            return (
              <button
                key={s.cle}
                type="button"
                role="radio"
                aria-checked={sel}
                onClick={() => setChoix(s.cle)}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${sel ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 bg-white hover:bg-zinc-50'}`}
              >
                <span className="block font-semibold">{s.titre}</span>
                <span className="block text-xs tabular-nums text-zinc-600">{pts(s.plan.stats.moyenne)} pts attendus</span>
                {s.plan.stats.devant !== null && <span className="block text-xs tabular-nums text-zinc-600">{pct(s.plan.stats.devant)} de finir devant</span>}
              </button>
            );
          })}
        </div>

        <p className="text-sm text-zinc-700">
          {actif.cle === 'rivaux'
            ? `Les picks qui maximisent ta chance de finir devant ${strategies.rivauxNoms.join(' et ')}, d’après leurs picks déjà posés.`
            : DESCRIPTIONS[actif.cle]}
        </p>
        <p className="text-xs tabular-nums text-zinc-600" data-testid="bilan-plan-masters">
          Total des picks sur le tournoi : {pts(stats.moyenne)} pts en moyenne · mauvais cas {pts(stats.mauvais)} · bon cas {pts(stats.bon)}
          {stats.devant !== null && ` · ${pct(stats.devant)} de chances de finir devant ${strategies.rivauxNoms.join(' et ')}`}
        </p>
        {identique && <p className={noteInfo}>Mêmes picks qu’Équilibré : à ce stade, un risque plus ou moins grand ne change aucun choix.</p>}

        <GrillePicks picks={actif.plan.picks} noms={mapNoms} />

        <p className="text-xs leading-relaxed text-zinc-600">
          Un joueur ne se pique qu’une fois par phase : trois joueurs différents par poule sur les trois journées, puis, en phase finale, deux
          différents (demie et finale). Chaque plan optimise tous les tours ENSEMBLE et se recalcule après chaque résultat importé ; pour les
          journées 2 et 3, les adversaires se déduisent de la journée 1. Les bilans comptent les points des picks seulement (le pronostic est à
          part) ; mauvais cas et bon cas : 1 tournoi simulé sur 10 fait moins, ou plus. « Contre » suppose que chaque rival joue, pour ses picks
          restants, son meilleur plan en points espérés.
        </p>
      </section>

      {afficherGT && <PanneauGTMasters key={actif.cle} tournamentId={tournamentId} picks={actif.plan.picks} noms={noms} />}
    </div>
  );
}
