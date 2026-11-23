import { supabaseAnon } from './anon';
import { getMatchRows, getPlayerRows, getTousLesPicks } from './queries';
import { depuisStockage } from '@/lib/davisRencontre';
import { matchJoue } from '@/lib/davis';
import { equipeDeNation, EQUIPES_DAVIS_2026, type CodeNation } from '@/lib/davisEquipes';
import type { RencontreEtat, Score, TourDavis } from '@/lib/davisConseils';

/**
 * Lectures pour les conseils Coupe Davis — LECTURE SEULE (clé anon, RLS select) : le tableau des
 * rencontres, l'Elo maison des joueurs sélectionnés et mes picks déjà posés. Aucun calcul ici : le
 * modèle est dans lib/davisConseils.ts.
 */

/** Elo maison (dur, à défaut général) des joueurs demandés, par nom tn_elo_maison. */
export async function eloMaisonDe(noms: string[]): Promise<Map<string, number>> {
  if (noms.length === 0) return new Map();
  const { data, error } = await supabaseAnon().from('tn_elo_maison').select('ta_name, elo_hard, elo_overall').eq('tour', 'atp').in('ta_name', noms);
  if (error) throw new Error(`tn_elo_maison : ${error.message}`);
  const elo = new Map<string, number>();
  for (const r of (data ?? []) as { ta_name: string; elo_hard: number | null; elo_overall: number | null }[]) {
    const v = r.elo_hard ?? r.elo_overall;
    if (v !== null) elo.set(r.ta_name, Number(v));
  }
  return elo;
}

/** Noms Elo de tous les joueurs sélectionnés (lib/davisEquipes.ts). */
export const NOMS_ELO_DAVIS = EQUIPES_DAVIS_2026.flatMap((e) => e.joueurs.map((j) => j.nomElo).filter((n): n is string => n !== null));

export interface EtatDavis {
  rencontres: RencontreEtat[];
  /** Nations (code) que j'ai déjà pickées, par tour. */
  mesPicks: { tour: string; nation: CodeNation }[];
  /** Nations du tableau qu'on n'a pas su rapprocher d'une équipe connue (lib/davisEquipes.ts). */
  inconnues: string[];
}

export async function lireEtatDavis(tournamentId: string): Promise<EtatDavis> {
  const [rows, picks] = await Promise.all([getMatchRows(tournamentId), getTousLesPicks(tournamentId)]);
  const ids = [...new Set([...rows.flatMap((r) => [r.player1_id, r.player2_id]), ...picks.map((p) => p.player_id)].filter((x): x is string => !!x))];
  const joueurs = ids.length ? await getPlayerRows(ids) : [];
  const inconnues: string[] = [];
  const code = (id: string | null): CodeNation | null => {
    if (!id) return null;
    const nom = joueurs.find((j) => j.id === id)?.name ?? null;
    const e = equipeDeNation(nom);
    if (!e && nom && !inconnues.includes(nom)) inconnues.push(nom);
    return e?.code ?? null;
  };
  const rencontres: RencontreEtat[] = rows
    .filter((r) => r.round === 'QF' || r.round === 'SF' || r.round === 'F')
    .map((r) => {
      const joues = depuisStockage(r.sets).filter(matchJoue).length;
      const vainqueur = r.winner_id ? code(r.winner_id) : null;
      return {
        tour: r.round as TourDavis,
        position: r.position ?? 0,
        nation1: code(r.player1_id),
        nation2: code(r.player2_id),
        vainqueur,
        score: vainqueur ? ((joues >= 3 ? '2-1' : '2-0') as Score) : null,
      };
    });
  const mesPicks = picks
    .filter((p) => p.participant_id === null)
    .map((p) => ({ tour: p.round, nation: code(p.player_id) }))
    .filter((p): p is { tour: string; nation: CodeNation } => p.nation !== null);
  return { rencontres, mesPicks, inconnues };
}
