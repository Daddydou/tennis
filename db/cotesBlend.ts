import 'server-only';
import { chargerCotes } from './cotes';
import { creerBlendProduction, indexerCotes, type CoteMatch } from '@/lib/cotes';
import { PROBABILITE_ELO_SEULE, type ProbabiliteMatch } from '@/lib/elo';

/**
 * BRANCHEMENT DU BLEND ELO/COTES EN PRODUCTION — POINT D'ENTRÉE UNIQUE
 *
 * Jusqu'ici les cotes ne nourrissaient que /calibration/cotes, un écran de
 * MESURE isolé : rien n'était branché. Cette fonction est l'unique endroit
 * qui charge le cache `tn_odds` d'un tournoi et le transforme en fonction de
 * probabilité utilisable par le moteur (`ProbabiliteMatch`, cf. lib/elo.ts) —
 * les deux consommateurs de production (`db/projections.ts`, pour
 * Picks/Fantasy/Prédictions, et `app/tournoi/[id]/bracket/page.tsx`, pour le
 * pronostic déterministe) l'appellent tels quels, sans jamais recharger ni
 * réindexer les cotes chacun de son côté.
 *
 * Silencieux par construction : `creerBlendProduction` (lib/cotes.ts) renvoie
 * l'Elo seul dès qu'aucune cote utilisable n'existe pour un duel précis — un
 * tournoi sans aucune cote en cache se comporte donc EXACTEMENT comme avant
 * ce branchement.
 */
export interface BlendProduction {
  probabiliteMatch: ProbabiliteMatch;
  /** Nombre de duels du tournoi pour lesquels une cote utilisable a été trouvée — traçabilité. */
  coteUtilisables: number;
  /**
   * Une cote utilisable existe-t-elle pour CE duel précis ? Dérivée du même
   * index que `probabiliteMatch` — sert uniquement à la traçabilité par duel
   * (cf. `lib/bracket.ts` `DuelBracket.coteUtilisee`), jamais à décider du
   * vainqueur, qui ne dépend que de `probabiliteMatch`.
   */
  coteDisponiblePour: (idA: string, idB: string) => boolean;
}

export async function chargerBlendProduction(
  tournamentId: string,
): Promise<BlendProduction> {
  const cotes = await chargerCotes(tournamentId);
  const index = indexerCotes(
    cotes.map(
      (c): CoteMatch => ({
        playerAId: c.player_a_id,
        playerBId: c.player_b_id,
        probaA: c.proba_a,
        commenceTime: c.commence_time,
        recupereLe: c.recupere_le,
      }),
    ),
  );
  return {
    probabiliteMatch: creerBlendProduction(index),
    coteUtilisables: index.taille,
    coteDisponiblePour: (idA, idB) => index.probabiliteA(idA, idB) !== null,
  };
}

/** Repli explicite (aucune cote chargée) — pour les appelants qui veulent l'Elo seul sans requête. */
export const BLEND_PRODUCTION_VIDE: BlendProduction = {
  probabiliteMatch: PROBABILITE_ELO_SEULE,
  coteUtilisables: 0,
  coteDisponiblePour: () => false,
};
