import { notFound } from 'next/navigation';
import { estMasters } from '@/lib/masters';
import { estDavis, saisieDepuisStockage } from '@/lib/davisRencontre';
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
import { SaisieDavis, type RencontreASaisir } from './SaisieDavis';
import PronosDavis from './PronosDavis';
import { lireDavisPronos } from '@/db/davisPronos';
import { cleStockDavis, picksTableauDavis, vueBracketDavis, vuePronosDavis } from '@/lib/davisVues';

export const dynamic = 'force-dynamic';

export default async function TableauPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Un tournoi au format Masters (poules) a son propre Tableau : poules, classements, demies, finale.
  const tournoiMasters = await getTournament(id);
  if (tournoiMasters && estMasters(tournoiMasters.rounds)) return <MastersTableau id={id} tour={tournoiMasters.tour} />;

  // Lectures indépendantes : en parallèle (jamais en cascade, cf. CLAUDE.md).
  const davis = !!tournoiMasters && estDavis(tournoiMasters.rounds);
  const [tournoi, matchRows, participants, picksPont, picksJeu, pronosDavis] = await Promise.all([
    Promise.resolve(tournoiMasters),
    getMatchRows(id),
    getParticipants(),
    getBracketRoundPicks(id),
    getTousLesPicks(id),
    davis ? lireDavisPronos(id) : Promise.resolve([]),
  ]);
  if (!tournoi) notFound();
  // Coupe Davis : les brackets lus sur Game Tracker (nation + score) donnent les pastilles ; à défaut, ceux du
  // pont de Thomas (nations seules).
  const picks = davis ? picksTableauDavis(picksPont, pronosDavis) : picksPont;

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
    libelleVide: davis ? 'À déterminer' : undefined,
  });

  // Points du bracket : le MÊME calcul que le Dashboard (pointsBracketParStock). Un participant absent de la
  // carte n'a aucun pronostic de bracket : null (à distinguer d'un vrai 0).
  const pointsParStock = pointsBracketParStock(matchRows, tournoi.rounds ?? [], picksPont);
  const pointsBracket: Record<string, number | null> = Object.fromEntries(
    stocks.map((s) => [s.id ?? 'moi', pointsParStock.has(s.id) ? (pointsParStock.get(s.id) as number) : null]),
  );
  // Coupe Davis : points du bracket au barème de la Coupe Davis (2 / 4 / 8 + bonus de score), pas celui des tournois classiques.
  if (davis) {
    const { totaux } = vueBracketDavis(matchRows, pronosDavis, stocks);
    for (const s of stocks) {
      const t = totaux[cleStockDavis(s.id)];
      if (t && t.nb > 0) pointsBracket[cleStockDavis(s.id)] = t.points;
    }
  }
  const pronosMatchs = davis ? vuePronosDavis(matchRows, pronosDavis, stocks) : [];

  // Coupe Davis : saisie du résultat de chaque rencontre (ses trois matchs), ce qui alimente les points des picks.
  const rencontresDavis: RencontreASaisir[] = estDavis(tournoi.rounds)
    ? matchRows
        .filter((m) => m.position !== null)
        .sort((a, b) => a.round_order - b.round_order || (a.position as number) - (b.position as number))
        .map((m) => ({
          round: m.round,
          position: m.position as number,
          libelle: m.round === 'F' ? 'Finale' : `${m.round === 'SF' ? 'Demi-finale' : 'Quart de finale'} ${(m.position as number) + 1}`,
          nation1: m.player1_id ? (nomParId.get(m.player1_id) ?? m.player1_id) : null,
          nation2: m.player2_id ? (nomParId.get(m.player2_id) ?? m.player2_id) : null,
          saisie: saisieDepuisStockage(m.sets),
        }))
    : [];

  return (
    <div className="space-y-5">
      {rencontresDavis.length > 0 && <SaisieDavis tournamentId={id} rencontres={rencontresDavis} />}
      {pronosMatchs.length > 0 && <PronosDavis rencontres={pronosMatchs} stocks={stocks} />}
      {tours.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucun match importé.</p>
      ) : (
        <TableauClient tours={tours} stocks={stocks} pointsBracket={pointsBracket} />
      )}
    </div>
  );
}
