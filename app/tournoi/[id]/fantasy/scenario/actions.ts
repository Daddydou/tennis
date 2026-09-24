'use server';

import { sessionValide } from '@/auth/garde';
import { loadEngineData, surfacePourElo } from '@/db/queries';
import { equipeEvaluee, fantasyEnCache } from '@/db/fantasy';
import { chargerBlendProduction } from '@/db/cotesBlend';
import { POIDS_SURFACE } from '@/db/elo';
import { simulerDepuis } from '@/lib/montecarlo';
import { toursAvecBye } from '@/lib/fantasy';
import {
  cleDuelJoueurs,
  probabiliteAvecSurcharges,
  projeterJoueur,
  type ProjectionJoueur,
} from '@/lib/fantasyScenario';

/**
 * SIMULATION « ET SI » — LECTURE SEULE. Aucune écriture : ni l'équipe, ni le
 * cache tn_fantasy / tn_projections ne bougent. La session est tout de même
 * exigée : une Server Action est un POST public, et chaque appel coûte deux
 * simulations Monte Carlo.
 */

/** Deux passes de ce nombre de tirages : quelques secondes au pire sur un tableau de 128. */
const N_SIMULATIONS = 3000;
/** Même graine pour les deux passes : l'écart vient des réglages, pas du hasard. */
const SEED = 42;

export interface MembreScenario {
  palier: number;
  libellePalier: string;
  nom: string | null;
  base: ProjectionJoueur;
  scenario: ProjectionJoueur;
}

export type ResultatScenario =
  | { ok: true; membres: MembreScenario[]; simulations: number }
  | { ok: false; error: string };

export async function simulerScenario(
  tournamentId: string,
  round: string,
  surcharges: [string, number][],
): Promise<ResultatScenario> {
  if (!(await sessionValide())) return { ok: false, error: 'Non authentifié.' };

  const engine = await loadEngineData(tournamentId);
  if (!engine) return { ok: false, error: 'Tournoi introuvable.' };
  const { tournament, matches, players } = engine;
  const rounds = tournament.rounds ?? [];
  const idxDepart = rounds.indexOf(round);
  if (idxDepart === -1) return { ok: false, error: `Tour inconnu : ${round}.` };

  // Seuls les duels de CE tour, entre deux joueurs connus, peuvent être
  // surchargés ; une probabilité hors [0, 1] est refusée, pas bornée.
  const duelsDuTour = new Set(
    matches
      .filter((m) => m.round === round && m.players[0].id && m.players[1].id)
      .map((m) => cleDuelJoueurs(m.players[0].id!, m.players[1].id!)),
  );
  const carte = new Map<string, number>();
  for (const [cle, p] of surcharges) {
    if (!duelsDuTour.has(cle)) return { ok: false, error: `Duel inconnu à ce tour : ${cle}.` };
    if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) {
      return { ok: false, error: `Probabilité invalide pour ${cle}.` };
    }
    carte.set(cle, p);
  }

  const fantasy = await fantasyEnCache(engine);
  if (!fantasy) {
    return {
      ok: false,
      error: "L'équipe Fantasy n'est pas encore calculée : ouvre l'onglet Fantasy puis réessaie.",
    };
  }
  const evaluation = equipeEvaluee(engine, fantasy);

  const bestOf = (tournament.best_of ?? 3) as 3 | 5;
  const surface = surfacePourElo(tournament.surface);
  const { probabiliteMatch } = await chargerBlendProduction(tournamentId);
  const simuler = (proba: typeof probabiliteMatch) =>
    simulerDepuis(matches, players, rounds, round, N_SIMULATIONS, bestOf, surface, POIDS_SURFACE, SEED, undefined, proba);

  const base = simuler(probabiliteMatch);
  const scenario = simuler(probabiliteAvecSurcharges(probabiliteMatch, carte));

  const membres: MembreScenario[] = evaluation.membres.map((m) => {
    const pid = m.playerId;
    const vide = { acquis: 0, espere: 0, total: 0 };
    if (!pid) {
      return { palier: m.palier.numero, libellePalier: m.palier.libelle, nom: null, base: vide, scenario: vide };
    }
    const reel = rounds.map((r) => m.detailReel.find((l) => l.round === r)?.pondere ?? 0);
    const byes = toursAvecBye(matches, pid);
    const projeter = (mc: typeof base) =>
      projeterJoueur(rounds, fantasy.bareme, idxDepart, reel, mc.esperances[pid], mc.presence[pid], byes);
    return {
      palier: m.palier.numero,
      libellePalier: m.palier.libelle,
      nom: players[pid]?.name ?? pid,
      base: projeter(base),
      scenario: projeter(scenario),
    };
  });

  return { ok: true, membres, simulations: N_SIMULATIONS };
}
