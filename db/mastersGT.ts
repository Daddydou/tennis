import type { SupabaseClient } from '@supabase/supabase-js';
import { resoudreParticipant } from '@/lib/bracketImport';
import { phaseDeRound, type PickLuGT } from '@/lib/mastersGT';

/**
 * PICKS D'UN MASTERS : recopie de ce que Game Tracker montre dans nos picks (tn_picks).
 *
 * Game Tracker FAIT FOI : pour chaque participant et chaque tour qu'il décrit, les picks de ce tour sont
 * REMPLACÉS par les siens (les miens sur les tours encore modifiables, ceux de tous sur les tours verrouillés).
 * Les autres tours ne sont pas touchés. Chaque pick porte sa phase (poules ou finale) : un joueur peut être
 * pické en poules et de nouveau en demie (migration 0031).
 */

export interface ResumeAlignementMasters {
  /** Participants rencontrés mais inconnus de l'app (pseudo Game Tracker sans équivalent). */
  inconnus: string[];
  ecrits: number;
  supprimes: number;
}

async function lire<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>, quoi: string): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(`${quoi} : ${error.message}`);
  return data as T;
}

/** Identifiant Game Tracker du tournoi : mémorisé à l'import (`gt:<id>`), sinon via le lien du bracket de Thomas. */
export async function idGameTrackerDuTournoi(sb: SupabaseClient, tournamentId: string): Promise<string | null> {
  const t = await lire<{ external_id: string | null } | null>(sb.from('tn_tournaments').select('external_id').eq('id', tournamentId).maybeSingle(), 'tn_tournaments');
  if (t?.external_id?.startsWith('gt:')) return t.external_id.slice(3);
  const lien = await lire<{ id: string } | null>(sb.from('tn_bracket_externe_tournois').select('id').eq('tournament_id_interne', tournamentId).maybeSingle(), 'tn_bracket_externe_tournois');
  return lien?.id ?? null;
}

/**
 * @param picks    tout ce que Game Tracker a montré (picksDepuisGT)
 * @param toursMoi tours encore modifiables chez Game Tracker : MES picks y sont remplacés même s'il n'y en a plus
 */
export async function alignerPicksMasters(sb: SupabaseClient, tournamentId: string, picks: PickLuGT[], toursMoi: string[]): Promise<ResumeAlignementMasters> {
  const participants = await lire<{ id: string; name: string }[]>(sb.from('tn_participants').select('id, name'), 'tn_participants');
  const inconnus: string[] = [];
  // Cible : pour chaque stock (null = moi) et chaque tour concerné, ses picks.
  const cible = new Map<string | null, Map<string, PickLuGT[]>>();
  const cibler = (stock: string | null, round: string) => {
    if (!cible.has(stock)) cible.set(stock, new Map());
    const m = cible.get(stock)!;
    if (!m.has(round)) m.set(round, []);
    return m.get(round)!;
  };
  for (const r of toursMoi) cibler(null, r);
  for (const p of picks) {
    const alias = p.moi ? 'Daddy' : p.pseudo === 'moi' ? 'Daddy' : p.pseudo;
    const rp = resoudreParticipant(alias, participants);
    if (!rp.ok) {
      if (!inconnus.includes(p.pseudo)) inconnus.push(p.pseudo);
      continue;
    }
    cibler(rp.stockId, p.round).push(p);
  }

  let supprimes = 0;
  let ecrits = 0;
  for (const [stock, parTour] of cible) {
    const rounds = [...parTour.keys()];
    let del = sb.from('tn_picks').delete().eq('tournament_id', tournamentId).in('round', rounds);
    del = stock === null ? del.is('participant_id', null) : del.eq('participant_id', stock);
    const { data: effaces, error: e1 } = await del.select('id');
    if (e1) throw new Error(`tn_picks (suppression) : ${e1.message}`);
    supprimes += effaces?.length ?? 0;
    const lignes = [...parTour.values()].flat().map((p) => ({
      tournament_id: tournamentId,
      participant_id: stock,
      round: p.round,
      half: p.half,
      player_id: p.playerId,
      phase: phaseDeRound(p.round),
    }));
    if (lignes.length) {
      const { error: e2 } = await sb.from('tn_picks').insert(lignes);
      if (e2) throw new Error(`tn_picks (ajout) : ${e2.message}`);
      ecrits += lignes.length;
    }
  }
  // Les points des picks sont enregistrés : recalcul après tout changement.
  if (supprimes + ecrits > 0) {
    const { error } = await sb.rpc('tn_recompute_picks', { p_tournament_id: tournamentId });
    if (error) throw new Error(`Recalcul des points des picks : ${error.message}`);
  }
  return { inconnus, ecrits, supprimes };
}
