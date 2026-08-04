import 'server-only';
import { cache } from 'react';
import { loadEngineData } from './queries';
import { getProjections } from './projections';
import {
  construireReference,
  toursJoues,
  type Reference,
} from '@/lib/reference';
import type { Esperances } from '@/lib/optimizer';

/**
 * Score de référence d'un tournoi : ce qu'auraient rapporté les picks si l'on
 * avait suivi les recommandations de l'app à chaque tour (cf. lib/reference.ts).
 *
 * Les espérances viennent du MÊME cache que l'écran Picks (`tn_projections`,
 * indexé par from_round) : la référence ne recalcule rien de son côté et ne
 * peut donc pas diverger de ce que l'app affichait.
 *
 * `cache` (React) mémoïse l'appel pour la durée du rendu : l'écran Résultats
 * l'utilise à deux endroits (le total en tête, le détail tour par tour) sans
 * payer deux fois.
 */
export const chargerReference = cache(
  async (tournamentId: string): Promise<Reference | null> => {
    const engine = await loadEngineData(tournamentId);
    if (!engine) return null;

    const rounds = engine.tournament.rounds ?? [];
    const joues = toursJoues(engine.matches, rounds);

    // Séquentiel à dessein : un cache manquant déclenche une simulation Monte
    // Carlo (20 000 tirages). Les lancer en parallèle ferait tourner plusieurs
    // simulations de front sur le même processus — et écrire dans
    // tn_projections en même temps — sans rien gagner.
    const esperancesParTour: Record<string, Esperances> = {};
    for (const round of joues) {
      const { esperances } = await getProjections(engine, round);
      esperancesParTour[round] = esperances;
    }

    return construireReference(
      engine.matches,
      engine.players,
      rounds,
      esperancesParTour,
      (engine.tournament.best_of ?? 3) as 3 | 5,
    );
  },
);
