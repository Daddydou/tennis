import type { SupabaseClient } from '@supabase/supabase-js';
import type { BracketThomas } from '@/lib/thomasApi';
import { resultatsDeSecours, type MatchAvecVainqueur } from '@/lib/resultatsSecours';

/**
 * RÉSULTATS DE SECOURS (lib/resultatsSecours.ts) : écrit dans tn_matches les résultats que l'app de
 * Thomas a déjà et que notre source (API tennis, import espacé) n'a pas encore.
 *
 * Prudence, en plus de celle du module pur : toutes les écritures sont CONDITIONNELLES en SQL
 * (`winner_id is null`, place du match suivant vide), donc rejouer ne change rien et un import
 * officiel arrivé entre-temps n'est jamais écrasé. Aucune suppression. Le prochain import de la
 * source réécrit le match avec sa version : la valeur de secours n'est qu'un relais.
 */

export interface ResumeSecours {
  repris: { round: string; position: number; vainqueur: string; perdant: string | null }[];
  /** Matchs que Thomas a tranchés mais qu'on n'a pas osé reprendre (joueur introuvable...). */
  ignores: string[];
  /** Vainqueurs placés dans le match suivant (place qui était vide). */
  avances: number;
  ecrit: boolean;
}

async function lire<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>, quoi: string): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(`${quoi} : ${error.message}`);
  return data as T;
}

/**
 * @param sb  lecture + écriture (service role) ; avec `ecrire: false`, la clé publique suffit (aperçu).
 */
export async function reprendreResultatsThomas(
  sb: SupabaseClient,
  tournamentId: string,
  b: BracketThomas,
  ecrire = true,
): Promise<ResumeSecours | { erreurs: string[] }> {
  const tournoi = await lire<{ rounds: string[] | null } | null>(
    sb.from('tn_tournaments').select('rounds').eq('id', tournamentId).maybeSingle(),
    'tn_tournaments',
  );
  if (!tournoi) return { erreurs: [`Tournoi interne ${tournamentId} introuvable.`] };

  const lignes = await lire<
    { round: string; position: number | null; player1_id: string | null; player2_id: string | null; status: string | null; winner_id: string | null }[]
  >(
    sb.from('tn_matches').select('round, position, player1_id, player2_id, status, winner_id').eq('tournament_id', tournamentId),
    'tn_matches',
  );
  const matchs: MatchAvecVainqueur[] = lignes
    .filter((m) => m.position !== null)
    .map((m) => ({
      round: m.round,
      position: m.position as number,
      player1Id: m.player1_id,
      player2Id: m.player2_id,
      status: m.status,
      winnerId: m.winner_id,
    }));
  const ids = [...new Set(matchs.flatMap((m) => [m.player1Id, m.player2Id]).filter((x): x is string => x !== null))];
  const joueurs = ids.length
    ? await lire<{ id: string; name: string }[]>(sb.from('tn_players').select('id, name').in('id', ids), 'tn_players')
    : [];
  const noms = new Map(joueurs.map((j) => [j.id, j.name]));

  const plan = resultatsDeSecours(b, tournoi.rounds ?? [], matchs, noms);
  if (!plan.ok) return { erreurs: plan.erreurs };

  let avances = 0;
  const repris: ResumeSecours['repris'] = [];
  for (const r of plan.resultats) {
    const interne = matchs.find((m) => m.round === r.round && m.position === r.position)!;
    if (ecrire) {
      const { data, error } = await sb
        .from('tn_matches')
        .update({ winner_id: r.winnerId, status: r.status, sets: r.sets, updated_at: new Date().toISOString() })
        .eq('tournament_id', tournamentId)
        .eq('round', r.round)
        .eq('position', r.position)
        .is('winner_id', null)
        .select('id');
      if (error) throw new Error(`tn_matches (résultat de secours) : ${error.message}`);
      if (!data?.length) continue; // un import officiel est passé entre-temps
      if (r.suivant) {
        const { data: av, error: e2 } = await sb
          .from('tn_matches')
          .update({ [r.suivant.colonne]: r.winnerId, updated_at: new Date().toISOString() })
          .eq('tournament_id', tournamentId)
          .eq('round', r.suivant.round)
          .eq('position', r.suivant.position)
          .is(r.suivant.colonne, null)
          .select('id');
        if (e2) throw new Error(`tn_matches (match suivant) : ${e2.message}`);
        avances += av?.length ?? 0;
      }
    }
    const perdantId = r.winnerId === interne.player1Id ? interne.player2Id : interne.player1Id;
    repris.push({
      round: r.round,
      position: r.position,
      vainqueur: noms.get(r.winnerId) ?? r.winnerId,
      perdant: perdantId ? (noms.get(perdantId) ?? perdantId) : null,
    });
  }
  return { repris, ignores: plan.ignores, avances, ecrit: ecrire };
}
