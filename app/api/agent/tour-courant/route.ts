import type { NextRequest } from 'next/server';
import { sessionValide } from '@/auth/garde';
import { verifierJetonAgent } from '@/auth/session';
import { loadEngineData, tourCourantMatches, type MatchRow } from '@/db/queries';
import { projectionsEnCache } from '@/db/projections';
import { genererSlots, recommanderPourTour } from '@/lib/optimizer';
import { estIndecis } from '@/lib/types';

/** Recommandations renvoyées par slot, par défaut et au maximum. */
const LIMITE_DEFAUT = 10;
const LIMITE_MAX = 30;

/**
 * Joueurs dont le match du tour `round` reste à jouer (scheduled, live,
 * in_progress). Un match completed, retired, walkover ou bye est décidé :
 * ses deux joueurs ne sont plus pickables pour ce tour, vainqueur compris.
 */
function joueursAJouer(matchRows: MatchRow[], round: string): Set<string> {
  const ids = new Set<string>();
  for (const m of matchRows) {
    if (m.round !== round || !estIndecis(m.status)) continue;
    if (m.player1_id) ids.add(m.player1_id);
    if (m.player2_id) ids.add(m.player2_id);
  }
  return ids;
}

/**
 * GET /api/agent/tour-courant?tournoi=<uuid>[&limite=10]
 *
 * Tour en cours d'un tournoi et recommandations de picks pour ce tour, pour
 * les agents externes (mes-agents). Existe pour qu'ils N'AIENT PAS à recoder
 * cette logique : on appelle ici exactement les fonctions de l'app.
 *
 * - Tour en cours = `tourCourantMatches` (état des matchs : premier tour avec
 *   un match à jouer). Propriété du tableau, pas du stock d'un participant —
 *   la page Picks, elle, avance au rythme des picks de chacun. `null` pour
 *   un tournoi terminé (statut `completed`).
 * - Recommandations = `recommanderPourTour` sur le cache `tn_projections`,
 *   par slot (moitié haute / basse, ou tableau entier en SF/F), limitées aux
 *   joueurs dont le match du tour est encore à jouer (`joueursAJouer`). Sans
 *   exclure de joueur déjà pické : aucun participant n'est visé.
 *
 * LECTURE SEULE : ne lance jamais de simulation Monte Carlo et n'écrit rien.
 * L'import de résultats préchauffe déjà les projections de ce tour précis
 * (app/import/actions.ts) ; si le cache est malgré tout vide,
 * `projections: 'absentes'` et des listes vides — réessayer après un import
 * ou une visite de la page Picks.
 *
 * Accès : session de l'app, ou `Authorization: Bearer <AGENT_API_TOKEN>`.
 */
export async function GET(req: NextRequest) {
  const autorise =
    verifierJetonAgent(req.headers.get('authorization')) || (await sessionValide());
  if (!autorise) {
    return Response.json({ ok: false, error: 'Non authentifié.' }, { status: 401 });
  }

  const tournoiId = req.nextUrl.searchParams.get('tournoi');
  if (!tournoiId) {
    return Response.json(
      { ok: false, error: 'Paramètre « tournoi » (id du tournoi) requis.' },
      { status: 400 },
    );
  }
  const limiteBrute = Number(req.nextUrl.searchParams.get('limite') ?? LIMITE_DEFAUT);
  const limite = Number.isInteger(limiteBrute)
    ? Math.min(Math.max(limiteBrute, 1), LIMITE_MAX)
    : LIMITE_DEFAUT;

  const engine = await loadEngineData(tournoiId);
  if (!engine) {
    return Response.json({ ok: false, error: 'Tournoi introuvable.' }, { status: 404 });
  }

  const { tournament, matchRows, players } = engine;
  const rounds = tournament.rounds ?? [];
  // Tournoi terminé : pas de tour en cours. `tourCourantMatches` retombe
  // alors sur le premier tour (utile au préchauffage de l'import), ce qu'un
  // agent lirait à tort comme « on joue le 1er tour ».
  const tour =
    tournament.status === 'completed' ? null : tourCourantMatches(matchRows, rounds);
  const cache = tour ? await projectionsEnCache(tournament.id, tour) : null;

  // Filtre AVANT la limite : on ne garde que les joueurs dont le match du
  // tour est encore à jouer, sinon un slot déjà joué renverrait des perdants
  // ou des qualifiés qu'on ne peut plus picker à ce tour.
  const esperances =
    cache && tour
      ? (() => {
          const aJouer = joueursAJouer(matchRows, tour);
          return Object.fromEntries(
            Object.entries(cache.esperances).filter(([id]) => aJouer.has(id)),
          );
        })()
      : null;

  const recommandations = tour
    ? genererSlots(rounds)
        .filter((s) => s.round === tour)
        .map((slot) => ({
          moitie: slot.half,
          joueurs: esperances
            ? recommanderPourTour(
                esperances,
                players,
                tour,
                slot.half,
                new Set<string>(),
                limite,
              ).map((r) => ({
                player_id: r.playerId,
                nom: r.playerName,
                esperance_points: r.ePoints,
              }))
            : [],
        }))
    : [];

  return Response.json({
    ok: true,
    tournoi: {
      id: tournament.id,
      nom: tournament.name,
      circuit: tournament.tour,
      annee: tournament.year,
      statut: tournament.status,
    },
    tours: rounds,
    tour_en_cours: tour,
    projections: cache ? 'disponibles' : 'absentes',
    recommandations,
  });
}
