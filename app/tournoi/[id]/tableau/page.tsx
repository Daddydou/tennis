import { notFound } from 'next/navigation';
import { estMasters } from '@/lib/masters';
import { MastersTableau } from '../MastersEcrans';
import {
  getTournament,
  getMatchRows,
  getPlayerRows,
  getParticipants,
  getBracketRoundPicks,
  getTousLesPicks,
} from '@/db/queries';
import { construireTableau } from '@/lib/tableauVue';
import { pointsBracketParStock, stocksDuGroupe } from '../pointsStock';
import { TableauClient } from './TableauClient';

export const dynamic = 'force-dynamic';

export default async function TableauPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Un tournoi au format Masters (poules) a son propre Tableau : poules, classements, demies, finale.
  const tournoiMasters = await getTournament(id);
  if (tournoiMasters && estMasters(tournoiMasters.rounds)) return <MastersTableau id={id} />;

  // Lectures indépendantes : en parallèle (jamais en cascade, cf. CLAUDE.md).
  const [tournoi, matchRows, participants, picks, picksJeu] = await Promise.all([
    Promise.resolve(tournoiMasters),
    getMatchRows(id),
    getParticipants(),
    getBracketRoundPicks(id),
    getTousLesPicks(id),
  ]);
  if (!tournoi) notFound();

  const ids = new Set<string>();
  for (const m of matchRows) {
    if (m.player1_id) ids.add(m.player1_id);
    if (m.player2_id) ids.add(m.player2_id);
  }
  for (const p of picks) ids.add(p.player_id);
  const players = await getPlayerRows([...ids]);
  const nomParId = new Map(players.map((p) => [p.id, p.name]));

  const stocks = stocksDuGroupe(participants);
  const tours = construireTableau({
    rounds: tournoi.rounds ?? [],
    matchs: matchRows,
    picks,
    picksJeu,
    stocks,
    nomJoueur: (pid) => nomParId.get(pid) ?? pid,
  });

  // Points du bracket : le MÊME calcul que le Dashboard (pointsBracketParStock). Un participant absent de la
  // carte n'a aucun pronostic de bracket : null (à distinguer d'un vrai 0).
  const pointsParStock = pointsBracketParStock(matchRows, tournoi.rounds ?? [], picks);
  const pointsBracket: Record<string, number | null> = Object.fromEntries(
    stocks.map((s) => [s.id ?? 'moi', pointsParStock.has(s.id) ? (pointsParStock.get(s.id) as number) : null]),
  );

  return (
    <div className="space-y-5">
      {tours.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucun match importé.</p>
      ) : (
        <TableauClient tours={tours} stocks={stocks} pointsBracket={pointsBracket} />
      )}
    </div>
  );
}
