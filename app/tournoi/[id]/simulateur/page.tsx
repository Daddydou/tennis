import { notFound } from 'next/navigation';
import TournoiNav from '../TournoiNav';
import SimulateurBracket from './SimulateurBracket';
import {
  getBracketPredictions,
  getParticipants,
  loadEngineData,
  tourCourantMatches,
} from '@/supabase/queries';
import { cleDuel, type MatchReel } from '@/lib/bracketSim';
import { STATUTS_DECIDES } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function SimulateurPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const engine = await loadEngineData(id);
  if (!engine) notFound();
  const { tournament, matchRows, players } = engine;
  const rounds = tournament.rounds ?? [];

  const [participants, predictionsRows] = await Promise.all([
    getParticipants(),
    getBracketPredictions(id),
  ]);

  const matches: MatchReel[] = matchRows
    .filter((m) => m.position !== null)
    .map((m) => ({
      round: m.round,
      position: m.position as number,
      player1Id: m.player1_id,
      player2Id: m.player2_id,
      winnerId: STATUTS_DECIDES.includes(m.status) ? m.winner_id : null,
    }));

  const joueurs: Record<string, { nom: string; rang: number | null }> = {};
  for (const [pid, p] of Object.entries(players)) {
    joueurs[pid] = { nom: p.name, rang: p.rank };
  }

  // 'moi' + un stock par participant configuré — même convention que
  // tn_picks (participant_id null = moi), traduite en clé de string ici
  // pour rester simple à manipuler côté client.
  const predictions: Record<string, Record<string, string>> = { moi: {} };
  for (const p of participants) predictions[p.id] = {};
  for (const pr of predictionsRows) {
    const stock = pr.participant_id ?? 'moi';
    (predictions[stock] ??= {})[cleDuel(pr.round, pr.position)] = pr.player_id;
  }

  const roundParDefaut = tourCourantMatches(matchRows, rounds);

  if (rounds.length === 0 || matches.length === 0) {
    return (
      <div className="space-y-5">
        <TournoiNav id={id} nom={tournament.name} active="simulateur" />
        <p className="text-sm text-zinc-500">
          Aucun tirage exploitable pour simuler un bracket sur ce tournoi.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <TournoiNav id={id} nom={tournament.name} active="simulateur" />

      <SimulateurBracket
        tournamentId={id}
        rounds={rounds}
        matches={matches}
        joueurs={joueurs}
        participants={participants.map((p) => ({ id: p.id, nom: p.name }))}
        predictionsInitiales={predictions}
        roundParDefaut={roundParDefaut ?? rounds[0]}
      />
    </div>
  );
}
