import 'server-only';
import { after } from 'next/server';
import { cache } from 'react';
import { loadEngineData } from './queries';
import { computeAndStoreProjections, projectionsEnCache } from './projections';
import {
  construireReference,
  toursJoues,
  type Reference,
} from '@/lib/reference';
import type { Esperances } from '@/lib/optimizer';

export interface ReferenceAvecStatut extends Reference {
  /**
   * Tours déjà joués dont la simulation Monte Carlo n'était pas encore en
   * cache au moment de cette requête — absents de `picks`/`total` pour
   * l'instant (cf. `lib/reference.ts` `construireReference`, qui ignore
   * silencieusement un tour sans espérances plutôt que de planter ou de
   * fausser le score). Leur calcul est programmé en arrière-plan
   * (`after`) : ils apparaîtront à la prochaine visite, jamais à celle-ci.
   */
  roundsManquants: string[];
}

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
 *
 * NE BLOQUE JAMAIS sur un cache froid. Avant ce commit, un tour joué sans
 * projection en cache déclenchait ICI une simulation Monte Carlo (20 000
 * tirages, plusieurs secondes — cf. `computeAndStoreProjections`) ; sur un
 * Grand Chelem avec plusieurs tours jamais visités individuellement dans
 * l'écran Picks, la page Résultats a été mesurée à 49 s (contre <1 s cache
 * chaud) — un calcul lourd, synchrone, sur le seul thread Node du serveur,
 * pour un simple affichage. Un tour sans cache est maintenant simplement
 * ignoré POUR CETTE REQUÊTE (comme `construireReference` sait déjà le faire)
 * et son calcul programmé en arrière-plan via `after()` : la page répond
 * tout de suite, avec un total partiel signalé (`roundsManquants`), et se
 * complète d'elle-même à la visite suivante.
 */
export const chargerReference = cache(
  async (tournamentId: string): Promise<ReferenceAvecStatut | null> => {
    const engine = await loadEngineData(tournamentId);
    if (!engine) return null;

    const rounds = engine.tournament.rounds ?? [];
    const joues = toursJoues(engine.matches, rounds);

    const esperancesParTour: Record<string, Esperances> = {};
    const roundsManquants: string[] = [];
    for (const round of joues) {
      const depuisCache = await projectionsEnCache(engine.tournament.id, round);
      if (depuisCache) esperancesParTour[round] = depuisCache.esperances;
      else roundsManquants.push(round);
    }

    if (roundsManquants.length > 0) {
      // Après l'envoi de la réponse : ne retarde ni ne fait échouer cette
      // requête. Séquentiel, comme avant — deux simulations de front sur le
      // même processus n'accéléreraient rien (CPU mono-thread de Node) et
      // écriraient dans tn_projections en même temps pour rien.
      after(async () => {
        for (const round of roundsManquants) {
          try {
            await computeAndStoreProjections(engine, round);
          } catch (e) {
            console.error(`Projections en arrière-plan (${round}) :`, (e as Error).message);
          }
        }
      });
    }

    const reference = construireReference(
      engine.matches,
      engine.players,
      rounds,
      esperancesParTour,
      (engine.tournament.best_of ?? 3) as 3 | 5,
    );

    return { ...reference, roundsManquants };
  },
);
