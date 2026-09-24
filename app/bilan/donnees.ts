import 'server-only';
import { getParticipants, getPlayerRows, listTournaments, type TournamentRow } from '@/db/queries';
import { listerHistorique } from '@/db/fantasy';
import {
  bracketPicksDesTournois,
  matchsDesTournois,
  picksDesTournois,
  relevesEloDeLAnnee,
  slugsDeNosJoueurs,
} from '@/db/bilan-saison';
import { pointsBracketParStock, pointsPicksParStock, stocksDuGroupe, type Stock } from '@/app/tournoi/[id]/pointsStock';
import {
  bilanFantasy,
  cumulSaison,
  joueursLesPlusRentables,
  joueursLesPlusVictorieux,
  progressionsElo,
  type BilanElo,
  type BilanFantasy,
  type BilanStock,
  type PointsTournoi,
} from '@/lib/bilanSaison';

/**
 * Assemble le bilan d'une saison. Les points de chaque tournoi passent par
 * pointsStock.ts, exactement comme le Dashboard : le bilan ne peut pas
 * afficher d'autres chiffres que ceux des écrans de tournoi.
 */

export interface Bilan {
  annee: number;
  annees: number[];
  tournois: TournamentRow[];
  stocks: Stock[];
  classement: BilanStock[];
  rentables: { nom: string; points: number; fois: number }[];
  victorieux: { nom: string; victoires: number }[];
  fantasy: BilanFantasy;
  elo: { ATP: BilanElo; WTA: BilanElo };
}

export async function chargerBilan(anneeDemandee: number | null): Promise<Bilan> {
  const [tousTournois, participants, historique] = await Promise.all([
    listTournaments(),
    getParticipants(),
    listerHistorique(),
  ]);

  const annees = [...new Set(tousTournois.map((t) => t.year))].sort((a, b) => b - a);
  const annee =
    anneeDemandee !== null && annees.includes(anneeDemandee)
      ? anneeDemandee
      : (annees[0] ?? new Date().getFullYear());
  const tournois = tousTournois.filter((t) => t.year === annee);
  const ids = tournois.map((t) => t.id);

  const [matchs, picks, bracketPicks, relevesAtp, relevesWta, slugsAtp, slugsWta] = await Promise.all([
    matchsDesTournois(ids),
    picksDesTournois(ids),
    bracketPicksDesTournois(ids),
    relevesEloDeLAnnee('ATP', annee),
    relevesEloDeLAnnee('WTA', annee),
    slugsDeNosJoueurs('ATP'),
    slugsDeNosJoueurs('WTA'),
  ]);

  const stocks = stocksDuGroupe(participants);
  const lignes: PointsTournoi[] = [];
  for (const t of tournois) {
    const pointsPicks = pointsPicksParStock(picks.filter((p) => p.tournament_id === t.id));
    const pointsBracket = pointsBracketParStock(
      matchs.filter((m) => m.tournament_id === t.id),
      t.rounds ?? [],
      bracketPicks.filter((b) => b.tournament_id === t.id),
    );
    for (const s of stocks) {
      if (!pointsPicks.has(s.id) && !pointsBracket.has(s.id)) continue;
      lignes.push({
        tournoiId: t.id,
        stockId: s.id,
        picks: pointsPicks.get(s.id) ?? 0,
        bracket: pointsBracket.has(s.id) ? pointsBracket.get(s.id)! : null,
      });
    }
  }

  const rentablesIds = joueursLesPlusRentables(picks.filter((p) => p.participant_id === null));
  const victorieuxIds = joueursLesPlusVictorieux(matchs);
  const noms = new Map(
    (await getPlayerRows([...new Set([...rentablesIds, ...victorieuxIds].map((j) => j.playerId))])).map(
      (p) => [p.id, p.name],
    ),
  );

  const idsSaison = new Set(ids);
  return {
    annee,
    annees,
    tournois,
    stocks,
    classement: cumulSaison(
      stocks.map((s) => s.id),
      lignes,
    ),
    rentables: rentablesIds.map((j) => ({ nom: noms.get(j.playerId) ?? j.playerId, points: j.points, fois: j.fois })),
    victorieux: victorieuxIds.map((j) => ({ nom: noms.get(j.playerId) ?? j.playerId, victoires: j.victoires })),
    fantasy: bilanFantasy(
      historique
        .filter((h) => idsSaison.has(h.tournament_id))
        .map((h) => ({
          tournoiId: h.tournament_id,
          predit: Number(h.e_predit ?? 0),
          reel: Number(h.score_reel ?? 0),
          termine: h.termine,
        })),
    ),
    // Restreint aux joueurs de nos tournois : l'archive couvre tout le circuit.
    elo: {
      ATP: progressionsElo(relevesAtp.filter((r) => slugsAtp.has(r.slug))),
      WTA: progressionsElo(relevesWta.filter((r) => slugsWta.has(r.slug))),
    },
  };
}
