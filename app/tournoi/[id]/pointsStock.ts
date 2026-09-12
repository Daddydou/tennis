/**
 * Points combinés (Bracket + Picks) de chaque stock (moi + participants du
 * groupe) — calcul PARTAGÉ entre le Dashboard (nouvel onglet d'atterrissage)
 * et le résumé en tête de l'onglet Picks : un seul endroit qui somme les
 * points déjà validés, jamais deux implémentations qui pourraient diverger.
 *
 * `participant_id === null` désigne toujours « moi » (même convention que
 * tn_picks et tn_bracket_round_picks, cf. supabase/queries.ts).
 */
import { resoudreArbre, scoreDuStock, cleDuel, type MatchReel } from '@/lib/bracketSim';
import { STATUTS_DECIDES } from '@/lib/types';
import type { BracketRoundPickRow, MatchRow, ParticipantRow, PickRow } from '@/supabase/queries';

export interface Stock {
  id: string | null;
  nom: string;
}

/** Moi (id null), puis les participants configurés (tn_participants), par ordre alphabétique. */
export function stocksDuGroupe(participants: ParticipantRow[]): Stock[] {
  return [{ id: null, nom: 'Moi' }, ...participants.map((p) => ({ id: p.id, nom: p.name }))];
}

/**
 * Points Picks de chaque stock : la même somme que l'onglet Résultats/Picks
 * (`picks.reduce((s, p) => s + (p.points ?? 0), 0)`), par stock plutôt que
 * pour un seul — les points sont déjà calculés et stockés sur chaque ligne
 * de tn_picks (cf. supabase/points.ts), on ne fait ici que les regrouper.
 */
export function pointsPicksParStock(tousLesPicks: PickRow[]): Map<string | null, number> {
  const out = new Map<string | null, number>();
  for (const p of tousLesPicks) {
    out.set(p.participant_id, (out.get(p.participant_id) ?? 0) + (p.points ?? 0));
  }
  return out;
}

/**
 * Points Bracket de chaque stock : ses pronostics de bracket
 * (tn_bracket_round_picks — importés via l'extracteur ou saisis à la main,
 * même table) comparés aux résultats réels déjà décidés, barème 2^(tour−1)
 * (lib/bracketSim.ts `scoreDuStock`, le même moteur pur que le Simulateur).
 * Aucun résultat hypothétique n'entre ici : la référence est l'arbre résolu
 * SANS aucun choix (`resoudreArbre(matches, rounds, () => null)`), qui ne
 * verrouille que les matchs déjà joués.
 *
 * Un stock absent de la carte retournée n'a RIEN pronostiqué (import ou
 * saisie) — à distinguer d'un score de 0 pour de mauvais pronostics.
 */
export function pointsBracketParStock(
  matchRows: MatchRow[],
  rounds: string[],
  bracketRoundPicks: BracketRoundPickRow[],
): Map<string | null, number> {
  const matches: MatchReel[] = matchRows
    .filter((m) => m.position !== null)
    .map((m) => ({
      round: m.round,
      position: m.position as number,
      player1Id: m.player1_id,
      player2Id: m.player2_id,
      winnerId: STATUTS_DECIDES.includes(m.status) ? m.winner_id : null,
    }));
  const arbreReel = resoudreArbre(matches, rounds, () => null);

  const predictionsParStock = new Map<string | null, Map<string, string>>();
  for (const r of bracketRoundPicks) {
    const carte = predictionsParStock.get(r.participant_id) ?? new Map<string, string>();
    carte.set(cleDuel(r.round, r.position), r.player_id);
    predictionsParStock.set(r.participant_id, carte);
  }

  const out = new Map<string | null, number>();
  for (const [stockId, predictions] of predictionsParStock) {
    out.set(stockId, scoreDuStock(predictions, arbreReel, rounds));
  }
  return out;
}
