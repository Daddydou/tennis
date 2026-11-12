import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Cote,
  MatchDavis,
  OrdreMatch,
  PickPays,
  PronoBracket,
  PronoMatch,
  RencontreDavis,
  ScoreSets,
  SetJeux,
  SlotPick,
  StatutMatchDavis,
  TourDavis,
} from '@/lib/davis';

/**
 * Coupe Davis (tables tn_davis_*, migration 0034). Lectures tolérantes : tant que la migration n'est pas
 * appliquée, `tablesAbsentes` vaut vrai et tout est vide (l'écran le dit). Les écritures prennent un client
 * `supabaseAdmin()` fourni par l'appelant, après `sessionValide()`.
 */

/** Édition suivie (la phase finale se joue en novembre 2026). */
export const ANNEE_DAVIS = 2026;

export type PickStocke = PickPays & { participantId: string | null };
export type BracketStocke = PronoBracket & { participantId: string | null };
export type PronoStocke = PronoMatch & { participantId: string | null };

export interface DonneesDavis {
  rencontres: RencontreDavis[];
  picks: PickStocke[];
  bracket: BracketStocke[];
  pronos: PronoStocke[];
  /** Vrai si la migration 0034 n'est pas encore appliquée. */
  tablesAbsentes: boolean;
}

const TABLE_ABSENTE = (code: string | undefined) => code === '42P01' || code === 'PGRST205';

interface LigneRencontre {
  id: string;
  tour: TourDavis;
  position: number;
  nation1: string | null;
  nation2: string | null;
  debut: string | null;
}
interface LigneMatch {
  rencontre_id: string;
  ordre: number;
  joueur1: string | null;
  joueur2: string | null;
  statut: StatutMatchDavis;
  gagnant: number | null;
  sets: SetJeux[] | null;
}

const ORDRE_TOUR: Record<TourDavis, number> = { QF: 0, SF: 1, F: 2 };

export async function lireDonneesDavis(sb: SupabaseClient, annee: number = ANNEE_DAVIS): Promise<DonneesDavis> {
  const vide: DonneesDavis = { rencontres: [], picks: [], bracket: [], pronos: [], tablesAbsentes: false };

  const { data: rens, error: e1 } = await sb
    .from('tn_davis_rencontres')
    .select('id, tour, position, nation1, nation2, debut')
    .eq('annee', annee);
  if (e1) {
    if (TABLE_ABSENTE(e1.code)) return { ...vide, tablesAbsentes: true };
    throw new Error(`tn_davis_rencontres : ${e1.message}`);
  }
  const lignes = (rens ?? []) as LigneRencontre[];
  const ids = lignes.map((r) => r.id);

  const [matchsRes, picksRes, bracketRes, pronosRes] = await Promise.all([
    ids.length
      ? sb.from('tn_davis_matchs').select('rencontre_id, ordre, joueur1, joueur2, statut, gagnant, sets').in('rencontre_id', ids)
      : Promise.resolve({ data: [], error: null }),
    sb.from('tn_davis_picks').select('participant_id, slot, nation').eq('annee', annee),
    sb.from('tn_davis_bracket').select('participant_id, tour, position, nation, score').eq('annee', annee),
    ids.length
      ? sb.from('tn_davis_pronos').select('participant_id, rencontre_id, ordre, nation, sets').in('rencontre_id', ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const [nom, res] of [
    ['tn_davis_matchs', matchsRes],
    ['tn_davis_picks', picksRes],
    ['tn_davis_bracket', bracketRes],
    ['tn_davis_pronos', pronosRes],
  ] as const) {
    if (res.error) throw new Error(`${nom} : ${res.error.message}`);
  }

  const matchsParRencontre = new Map<string, MatchDavis[]>();
  for (const m of (matchsRes.data ?? []) as LigneMatch[]) {
    const liste = matchsParRencontre.get(m.rencontre_id) ?? [];
    liste.push({
      ordre: m.ordre as OrdreMatch,
      joueur1: m.joueur1,
      joueur2: m.joueur2,
      statut: m.statut,
      gagnant: m.gagnant === 1 || m.gagnant === 2 ? (m.gagnant as Cote) : null,
      sets: m.sets ?? [],
    });
    matchsParRencontre.set(m.rencontre_id, liste);
  }

  const rencontres: RencontreDavis[] = lignes
    .map((r) => ({
      id: r.id,
      tour: r.tour,
      position: r.position,
      nation1: r.nation1,
      nation2: r.nation2,
      debut: r.debut,
      matchs: (matchsParRencontre.get(r.id) ?? []).sort((a, b) => a.ordre - b.ordre),
    }))
    .sort((a, b) => ORDRE_TOUR[a.tour] - ORDRE_TOUR[b.tour] || a.position - b.position);

  return {
    rencontres,
    picks: ((picksRes.data ?? []) as { participant_id: string | null; slot: SlotPick; nation: string }[]).map((p) => ({
      participantId: p.participant_id,
      slot: p.slot,
      nation: p.nation,
    })),
    bracket: ((bracketRes.data ?? []) as { participant_id: string | null; tour: TourDavis; position: number; nation: string; score: ScoreSets }[]).map((b) => ({
      participantId: b.participant_id,
      tour: b.tour,
      position: b.position,
      nation: b.nation,
      score: b.score,
    })),
    pronos: ((pronosRes.data ?? []) as { participant_id: string | null; rencontre_id: string; ordre: number; nation: string; sets: ScoreSets }[]).map((p) => ({
      participantId: p.participant_id,
      rencontreId: p.rencontre_id,
      ordre: p.ordre as OrdreMatch,
      nation: p.nation,
      sets: p.sets,
    })),
    tablesAbsentes: false,
  };
}

/* ------------------------------------------------------------------ */
/*  Écritures                                                          */
/* ------------------------------------------------------------------ */

const filtreParticipant = <T extends { is: (c: string, v: null) => T; eq: (c: string, v: string) => T }>(q: T, participantId: string | null): T =>
  participantId === null ? q.is('participant_id', null) : q.eq('participant_id', participantId);

/** Crée les 4 quarts, 2 demies et la finale (demies et finale sans nation), chacune avec ses 3 matchs « à venir ». */
export async function creerTableauDavis(sb: SupabaseClient, annee: number, quarts: { nation1: string; nation2: string }[]): Promise<void> {
  const rencontres = [
    ...quarts.map((q, i) => ({ annee, tour: 'QF', position: i + 1, nation1: q.nation1, nation2: q.nation2 })),
    { annee, tour: 'SF', position: 1, nation1: null, nation2: null },
    { annee, tour: 'SF', position: 2, nation1: null, nation2: null },
    { annee, tour: 'F', position: 1, nation1: null, nation2: null },
  ];
  const { data, error } = await sb.from('tn_davis_rencontres').insert(rencontres).select('id');
  if (error) throw new Error(`tn_davis_rencontres (création) : ${error.message}`);
  const matchs = (data ?? []).flatMap((r: { id: string }) => [1, 2, 3].map((ordre) => ({ rencontre_id: r.id, ordre })));
  const { error: e2 } = await sb.from('tn_davis_matchs').insert(matchs);
  if (e2) throw new Error(`tn_davis_matchs (création) : ${e2.message}`);
}

export async function majRencontre(
  sb: SupabaseClient,
  id: string,
  patch: { nation1?: string | null; nation2?: string | null; debut?: string | null },
): Promise<void> {
  const { error } = await sb.from('tn_davis_rencontres').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(`tn_davis_rencontres (mise à jour) : ${error.message}`);
}

export async function majMatch(
  sb: SupabaseClient,
  rencontreId: string,
  ordre: OrdreMatch,
  patch: { joueur1: string | null; joueur2: string | null; statut: StatutMatchDavis; gagnant: Cote | null; sets: SetJeux[] },
): Promise<void> {
  const { error } = await sb
    .from('tn_davis_matchs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('rencontre_id', rencontreId)
    .eq('ordre', ordre);
  if (error) throw new Error(`tn_davis_matchs (mise à jour) : ${error.message}`);
}

/** Pose (ou remplace) le pick d'un emplacement. */
export async function remplacerPick(sb: SupabaseClient, annee: number, participantId: string | null, slot: SlotPick, nation: string, source: 'app' | 'manuel'): Promise<void> {
  const del = filtreParticipant(sb.from('tn_davis_picks').delete().eq('annee', annee).eq('slot', slot), participantId);
  const { error: e1 } = await del;
  if (e1) throw new Error(`tn_davis_picks (remplacement) : ${e1.message}`);
  const { error: e2 } = await sb.from('tn_davis_picks').insert({ annee, participant_id: participantId, slot, nation, source });
  if (e2) throw new Error(`tn_davis_picks (ajout) : ${e2.message}`);
}

export async function retirerPick(sb: SupabaseClient, annee: number, participantId: string | null, slot: SlotPick): Promise<void> {
  const del = filtreParticipant(sb.from('tn_davis_picks').delete().eq('annee', annee).eq('slot', slot), participantId);
  const { error } = await del;
  if (error) throw new Error(`tn_davis_picks (retrait) : ${error.message}`);
}

/** Remplace tout le bracket d'un participant. */
export async function remplacerBracket(sb: SupabaseClient, annee: number, participantId: string | null, lignes: PronoBracket[], source: 'app' | 'manuel'): Promise<void> {
  const del = filtreParticipant(sb.from('tn_davis_bracket').delete().eq('annee', annee), participantId);
  const { error: e1 } = await del;
  if (e1) throw new Error(`tn_davis_bracket (remplacement) : ${e1.message}`);
  if (lignes.length === 0) return;
  const { error: e2 } = await sb.from('tn_davis_bracket').insert(
    lignes.map((l) => ({ annee, participant_id: participantId, tour: l.tour, position: l.position, nation: l.nation, score: l.score, source })),
  );
  if (e2) throw new Error(`tn_davis_bracket (ajout) : ${e2.message}`);
}

/** Remplace les pronos d'un participant sur UNE rencontre. */
export async function remplacerPronos(sb: SupabaseClient, rencontreId: string, participantId: string | null, lignes: { ordre: OrdreMatch; nation: string; sets: ScoreSets }[], source: 'app' | 'manuel'): Promise<void> {
  const del = filtreParticipant(sb.from('tn_davis_pronos').delete().eq('rencontre_id', rencontreId), participantId);
  const { error: e1 } = await del;
  if (e1) throw new Error(`tn_davis_pronos (remplacement) : ${e1.message}`);
  if (lignes.length === 0) return;
  const { error: e2 } = await sb.from('tn_davis_pronos').insert(
    lignes.map((l) => ({ rencontre_id: rencontreId, participant_id: participantId, ordre: l.ordre, nation: l.nation, sets: l.sets, source })),
  );
  if (e2) throw new Error(`tn_davis_pronos (ajout) : ${e2.message}`);
}
