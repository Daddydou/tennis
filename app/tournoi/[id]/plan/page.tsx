import Link from 'next/link';
import { notFound } from 'next/navigation';
import TournoiNav from '../TournoiNav';
import NoteCotesUtilisees from '../NoteCotesUtilisees';
import ProvenanceElo from '../picks/ProvenanceElo';
import PanneauGameTracker from '../picks/PanneauGameTracker';
import { FournisseurPoolGT } from '../picks/PoolGameTracker';
import { pointsPicksParStock, stocksDuGroupe } from '../pointsStock';
import PlanPicks from './PlanPicks';
import { carte, pilleSelecteur } from '@/app/ui';
import { getParticipants, getTousLesPicks, loadEngineData, surfacePourElo } from '@/db/queries';
import { chargerBlendProduction } from '@/db/cotesBlend';
import { getInsights } from '@/db/insights';
import { POIDS_SURFACE } from '@/db/elo';
import { construireDonneesPlan, type EntreeDonnees } from '@/lib/planDonnees';
import type { PlayerInsight } from '@/lib/insights';

export const dynamic = 'force-dynamic';

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ participant?: string }>;
}) {
  const { id } = await params;
  const { participant: participantParam } = await searchParams;

  // Mêmes lectures que l'écran Picks : tout part de front, rien n'est simulé
  // côté serveur. Le navigateur reçoit un objet sérialisable et calcule seul.
  const [engine, participants, tousLesPicks, blend, insights] = await Promise.all([
    loadEngineData(id),
    getParticipants(),
    getTousLesPicks(id),
    chargerBlendProduction(id),
    getInsights(id),
  ]);
  if (!engine) notFound();
  const { tournament, matches, matchRows, players, playerRows, elos } = engine;
  const rounds = tournament.rounds ?? [];

  const stockId =
    participantParam && participants.some((p) => p.id === participantParam) ? participantParam : null;

  const infoElo: EntreeDonnees['infoElo'] = {};
  for (const [pid, e] of Object.entries(elos)) {
    infoElo[pid] = {
      source: e.source,
      taName: e.taName ?? null,
      candidats: (e.candidats ?? []).map(
        (c) => `${c.nom} (${c.slug}${c.elo != null ? `, Elo ${Math.round(c.elo)}` : ''})`,
      ),
    };
  }

  const donnees = construireDonneesPlan({
    tournoiId: id,
    nom: tournament.name,
    rounds,
    bestOf: (tournament.best_of ?? 3) as 3 | 5,
    surface: surfacePourElo(tournament.surface),
    matches,
    matchRows,
    players,
    infoElo,
    probabiliteMatch: blend.probabiliteMatch,
    poidsSurface: POIDS_SURFACE,
    participants: [{ id: null, nom: 'Moi' }, ...participants.map((p) => ({ id: p.id as string | null, nom: p.name }))],
    picks: tousLesPicks.map((p) => ({
      participant_id: p.participant_id ?? null,
      round: p.round,
      half: p.half ?? null,
      player_id: p.player_id,
      points: p.points ?? null,
    })),
  });

  // Insights : affichage seul (forfait, blessure…), jamais dans les calculs.
  const insightsParId: Record<string, PlayerInsight | null> = {};
  for (const j of donnees.joueurs) insightsParId[j.id] = insights.get(j.id) ?? null;

  const stocksResume = stocksDuGroupe(participants);
  const picksParStock = pointsPicksParStock(tousLesPicks);
  const lienParticipant = (pid: string | null) => `/tournoi/${id}/plan${pid ? `?participant=${pid}` : ''}`;

  return (
    <FournisseurPoolGT>
      <div className="space-y-5">
        <TournoiNav id={id} nom={tournament.name} active="plan" />
        <NoteCotesUtilisees n={blend.coteUtilisables} />

        <div className="flex flex-wrap gap-2">
          {stocksResume.map((s) => (
            <div key={s.id ?? 'moi'} className={`flex items-baseline gap-1.5 px-3 py-1.5 ${carte}`}>
              <span className="text-xs font-medium text-zinc-600">{s.nom}</span>
              <span className="text-base font-bold tabular-nums">{picksParStock.get(s.id) ?? 0}</span>
              <span className="text-[11px] text-zinc-400">pts</span>
            </div>
          ))}
        </div>

        {participants.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={lienParticipant(null)} className={pilleSelecteur(stockId === null)}>
              Moi
            </Link>
            {participants.map((p) => (
              <Link key={p.id} href={lienParticipant(p.id)} className={pilleSelecteur(stockId === p.id)}>
                {p.name}
              </Link>
            ))}
          </div>
        )}

        {stockId !== null && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-100 px-3 py-2 text-sm text-amber-950">
            <span>
              Tu modifies les picks de{' '}
              <strong>{participants.find((p) => p.id === stockId)?.name ?? 'ce participant'}</strong>, pas les tiens.
            </span>
            <Link href={lienParticipant(null)} className="font-medium underline underline-offset-2">
              Revenir à mes picks
            </Link>
          </div>
        )}

        <PlanPicks key={stockId ?? 'moi'} donnees={donnees} stockId={stockId} insights={insightsParId} />

        <ProvenanceElo elos={elos} playerRows={playerRows} tour={tournament.tour} />

        {/* Game Tracker : MES picks uniquement (la clé agit au nom d'un seul joueur). */}
        {stockId === null && (
          <div id="game-tracker">
            <PanneauGameTracker tournamentId={id} />
          </div>
        )}
      </div>
    </FournisseurPoolGT>
  );
}
