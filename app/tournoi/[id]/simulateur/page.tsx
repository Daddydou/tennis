import { notFound } from 'next/navigation';
import TournoiNav from '../TournoiNav';
import SimulateurSections from './SimulateurSections';
import { cleSlot } from './picksSim';
import {
  getBracketAnchors,
  getParticipants,
  getSimulatedPicks,
  getTousLesPicks,
  loadEngineData,
  surfacePourElo,
  tourCourantMatches,
} from '@/supabase/queries';
import { getProjections } from '@/supabase/projections';
import { type MatchReel } from '@/lib/bracketSim';
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

  const [participants, anchorRows, simulatedPickRows, tousLesPicks] = await Promise.all([
    getParticipants(),
    getBracketAnchors(id),
    getSimulatedPicks(id),
    getTousLesPicks(id),
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
  const ancres: Record<string, string | null> = { moi: null };
  for (const p of participants) ancres[p.id] = null;
  for (const a of anchorRows) ancres[a.participant_id ?? 'moi'] = a.player_id;

  const roundParDefaut = tourCourantMatches(matchRows, rounds);

  // Picks hypothétiques déjà persistés (tn_simulated_picks), au format
  // { stock -> { cleSlot -> playerId } } consommé par SimulateurPicks.
  const picksSimulesInitiaux: Record<string, Record<string, string>> = { moi: {} };
  for (const p of participants) picksSimulesInitiaux[p.id] = {};
  for (const s of simulatedPickRows) {
    const stock = s.participant_id ?? 'moi';
    (picksSimulesInitiaux[stock] ??= {})[cleSlot(s.round, s.half)] = s.player_id;
  }

  // Points déjà inscrits pour de vrai (tn_picks) : la même somme que
  // l'onglet Résultats/Picks (picks.reduce((s, p) => s + (p.points ?? 0), 0)),
  // par stock plutôt que pour un seul.
  const dejaInscrits: Record<string, number> = { moi: 0 };
  for (const p of participants) dejaInscrits[p.id] = 0;
  for (const pk of tousLesPicks) {
    const stock = pk.participant_id ?? 'moi';
    dejaInscrits[stock] = (dejaInscrits[stock] ?? 0) + (pk.points ?? 0);
  }

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

  const roundDepart = roundParDefaut ?? rounds[0];
  const { esperances } = await getProjections(engine, roundDepart);

  return (
    <div className="space-y-5">
      <TournoiNav id={id} nom={tournament.name} active="simulateur" />

      <SimulateurSections
        tournamentId={id}
        rounds={rounds}
        matches={matches}
        matchRows={matchRows}
        joueurs={joueurs}
        players={players}
        surface={surfacePourElo(tournament.surface)}
        participants={participants.map((p) => ({ id: p.id, nom: p.name }))}
        ancresInitiales={ancres}
        esperances={esperances}
        dejaInscrits={dejaInscrits}
        picksSimulesInitiaux={picksSimulesInitiaux}
        roundParDefaut={roundDepart}
      />
    </div>
  );
}
