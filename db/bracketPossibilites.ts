import type { SupabaseClient } from '@supabase/supabase-js';
import type { EntreePossibilites } from '@/lib/bracketPossibilites';
import { estDavis } from '@/lib/davisRencontre';

/**
 * Données du bracket de Thomas pour un tournoi de l'app (tables tn_bracket_externe_*, remplies par la
 * synchro de Thomas, lecture publique). Sert au panneau « Possibilités des participants » de
 * l'onglet Bracket (lib/bracketPossibilites.ts). Renvoie null si le tournoi n'est pas relié au
 * bracket de Thomas ou s'il n'a encore aucun pronostic visible : le panneau n'apparaît alors pas.
 */

export type DonneesPossibilites = Omit<EntreePossibilites, 'max'> & { thomasId: string; thomasNom: string };

async function lire<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>, quoi: string): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(`${quoi} : ${error.message}`);
  return (data ?? ([] as unknown)) as T;
}

/** « SHELTON » -> « Shelton », « VAN ASSCHE » -> « Van Assche », « AUGER-ALIASSIME » -> « Auger-Aliassime ». */
export function nomLisible(prenom: string | null, nom: string | null): string {
  const maj = (s: string) => s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
  return [prenom, nom ? maj(nom) : null].filter(Boolean).join(' ');
}

export async function chargerDonneesPossibilites(sb: SupabaseClient, tournamentId: string): Promise<DonneesPossibilites | null> {
  const [tournois, interne] = await Promise.all([
    lire<{ id: string; nom: string; draw_size: number }[]>(
      sb
        .from('tn_bracket_externe_tournois')
        .select('id, nom, draw_size')
        .eq('tournament_id_interne', tournamentId)
        .order('updated_at', { ascending: false })
        .limit(1),
      'tn_bracket_externe_tournois',
    ),
    lire<{ rounds: string[] | null }[]>(sb.from('tn_tournaments').select('rounds').eq('id', tournamentId).limit(1), 'tn_tournaments'),
  ]);
  const t = tournois[0];
  if (!t) return null;

  const [joueurs, matchs, participants, pronostics] = await Promise.all([
    lire<{ position: number; prenom: string | null; nom: string | null }[]>(
      sb.from('tn_bracket_externe_joueurs').select('position, prenom, nom').eq('tournoi_id', t.id),
      'tn_bracket_externe_joueurs',
    ),
    lire<{ tour: number; match_index: number; position1: number | null; position2: number | null; vainqueur: number | null }[]>(
      sb.from('tn_bracket_externe_matchs').select('tour, match_index, position1, position2, vainqueur').eq('tournoi_id', t.id),
      'tn_bracket_externe_matchs',
    ),
    lire<{ user_id: string; pseudo: string; points_totaux_thomas: number | null; points_totaux_calcule: number | null }[]>(
      sb.from('tn_bracket_externe_participants').select('user_id, pseudo, points_totaux_thomas, points_totaux_calcule').eq('tournoi_id', t.id),
      'tn_bracket_externe_participants',
    ),
    lire<{ user_id: string; tour: number; match_index: number; position: number | null }[]>(
      sb.from('tn_bracket_externe_pronostics').select('user_id, tour, match_index, position').eq('tournoi_id', t.id).not('position', 'is', null),
      'tn_bracket_externe_pronostics',
    ),
  ]);
  if (pronostics.length === 0) return null;

  return {
    thomasId: t.id,
    thomasNom: t.nom,
    drawSize: t.draw_size,
    facteurPoints: estDavis(interne[0]?.rounds) ? 2 : 1,
    noms: new Map(joueurs.map((j) => [j.position, nomLisible(j.prenom, j.nom)])),
    matchs: matchs.map((m) => ({
      tour: m.tour,
      index: m.match_index,
      position1: m.position1,
      position2: m.position2,
      vainqueur: m.vainqueur,
    })),
    participants: participants.map((p) => ({
      userId: p.user_id,
      pseudo: p.pseudo,
      points: p.points_totaux_calcule ?? p.points_totaux_thomas ?? 0,
    })),
    pronostics: pronostics.map((p) => ({ userId: p.user_id, tour: p.tour, index: p.match_index, position: p.position })),
  };
}
