'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { supabaseAdmin } from '@/supabase/server';
import { getParticipants, loadEngineData } from '@/supabase/queries';
import {
  parseExtraitBracket,
  resoudreExtraitBracket,
  resoudreParticipant,
  type NonApparie,
  type PronosticResolu,
} from '@/lib/bracketImport';
import { MOI } from './types';

export interface ImportBracketResult {
  ok: boolean;
  error?: string;
  /** 'moi' ou l'id du participant résolu — pour que l'écran fusionne dans son propre état. */
  stockId?: string;
  /** Pronostics effectivement écrits (déjà présents ou nouveaux). */
  picks?: PronosticResolu[];
  toursIgnores: { tour: string; raison: string }[];
  nonApparies: NonApparie[];
  incoherences: { contexte: string; pronostique: string; joueurs: [string, string] }[];
}

const VIDE: Omit<ImportBracketResult, 'ok' | 'error'> = { toursIgnores: [], nonApparies: [], incoherences: [] };

/**
 * Importe un extrait de bracket (Game Tracker) pour UN participant : rattache
 * ses noms aux joueurs du tableau et ses tours au tableau réel du tournoi
 * (lib/bracketImport.ts), puis écrit chaque pronostic résolu dans
 * tn_bracket_round_picks — la même table que le bloc 3 (Bracket des
 * participants) du Simulateur, qu'il pré-remplit ainsi.
 *
 * Écriture PAR EMPLACEMENT (jamais un remplacement de tout un tour) : un
 * import est par nature partiel — le jeu ne révèle les pronostics que tour
 * par tour — et ne doit donc RIEN effacer d'un pronostic déjà enregistré
 * (importé ou corrigé à la main) hors de ce que fournit CET import.
 */
export async function importerBracketParticipant(
  tournamentId: string,
  jsonText: string,
): Promise<ImportBracketResult> {
  if (!(await sessionValide())) {
    return { ok: false, error: 'Non authentifié.', ...VIDE };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: 'JSON invalide : impossible à parser.', ...VIDE };
  }

  let extrait;
  try {
    extrait = parseExtraitBracket(raw);
  } catch (e) {
    return { ok: false, error: `Extraction illisible : ${(e as Error).message}`, ...VIDE };
  }

  const engine = await loadEngineData(tournamentId);
  if (!engine) return { ok: false, error: 'Tournoi introuvable.', ...VIDE };
  const rounds = engine.tournament.rounds ?? [];

  const participants = await getParticipants();
  const resolutionParticipant = resoudreParticipant(
    extrait.participant,
    participants.map((p) => ({ id: p.id, name: p.name })),
  );
  if (!resolutionParticipant.ok) {
    return { ok: false, error: resolutionParticipant.error, ...VIDE };
  }
  const stockId = resolutionParticipant.stockId; // string | null (null = moi)

  const joueursDuTableau = Object.values(engine.players).map((p) => ({ id: p.id, name: p.name }));
  const { picks, toursIgnores, nonApparies, incoherences } = resoudreExtraitBracket(
    extrait,
    rounds,
    joueursDuTableau,
  );

  if (picks.length === 0) {
    return {
      ok: false,
      error: 'Aucun pronostic exploitable dans cet import — voir les avertissements.',
      toursIgnores,
      nonApparies,
      incoherences,
    };
  }

  const sb = supabaseAdmin();

  // Emplacements déjà enregistrés pour ce stock, sur les seuls tours de cet
  // import — pour décider match par match update vs insert, sans jamais
  // toucher un emplacement absent de `picks`.
  const toursConcernes = [...new Set(picks.map((p) => p.round))];
  let sel = sb
    .from('tn_bracket_round_picks')
    .select('id, round, position')
    .eq('tournament_id', tournamentId)
    .in('round', toursConcernes);
  sel = stockId === null ? sel.is('participant_id', null) : sel.eq('participant_id', stockId);
  const { data: existantes, error: eSel } = await sel;
  if (eSel) return { ok: false, error: eSel.message, toursIgnores, nonApparies, incoherences };

  const idExistant = new Map<string, string>();
  for (const r of existantes ?? []) idExistant.set(`${r.round}|${r.position}`, r.id as string);

  const aInserer: { tournament_id: string; participant_id: string | null; round: string; position: number; player_id: string }[] =
    [];
  const aModifier: { id: string; player_id: string }[] = [];
  for (const p of picks) {
    const id = idExistant.get(`${p.round}|${p.position}`);
    if (id) aModifier.push({ id, player_id: p.playerId });
    else {
      aInserer.push({
        tournament_id: tournamentId,
        participant_id: stockId,
        round: p.round,
        position: p.position,
        player_id: p.playerId,
      });
    }
  }

  if (aInserer.length > 0) {
    const { error } = await sb.from('tn_bracket_round_picks').insert(aInserer);
    if (error) return { ok: false, error: error.message, toursIgnores, nonApparies, incoherences };
  }
  for (const m of aModifier) {
    const { error } = await sb.from('tn_bracket_round_picks').update({ player_id: m.player_id }).eq('id', m.id);
    if (error) return { ok: false, error: error.message, toursIgnores, nonApparies, incoherences };
  }

  revalidatePath(`/tournoi/${tournamentId}`);
  revalidatePath(`/tournoi/${tournamentId}/simulateur`);

  return {
    ok: true,
    stockId: stockId ?? MOI,
    picks,
    toursIgnores,
    nonApparies,
    incoherences,
  };
}
