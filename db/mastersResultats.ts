import type { SupabaseClient } from '@supabase/supabase-js';
import type { MatchApi, TableauApi } from '@/lib/extract/matchstat';
import { trouverJoueur } from '@/lib/mastersImport';
import { nomsDeApi } from '@/lib/mastersRemplacement';
import { appliquerRemplacementsMasters } from './mastersRemplacement';
import { planResultatsMasters, type ObservationApi, type PlanResultats } from '@/lib/mastersResultats';
import type { LigneMatchMasters } from '@/lib/mastersVue';

/**
 * RÉSULTATS D'UN MASTERS : applique à la base ce que dit l'API tennis (plan : lib/mastersResultats.ts).
 *
 * Un seul appel à l'API par rafraîchissement (le tableau des singles), aucune écriture si rien n'a changé,
 * aucune suppression. L'API est la source : ses résultats remplacent les nôtres. Si une joueuse de l'API
 * ne se retrouve pas parmi les huit du tournoi, on n'écrit RIEN (mieux vaut ne pas mettre à jour qu'écrire
 * de travers).
 */

export interface ResumeResultatsMasters {
  ecrit: boolean;
  maj: number;
  creees: number;
  placees: number;
  avertissements: string[];
  erreurs: string[];
  /** Remplaçantes détectées (« Kostyuk remplace Rybakina ») ; appliquées à la base seulement si `ecrit`. */
  remplacements: string[];
  tournoiStatut: PlanResultats['tournoiStatut'] | null;
}

const ORDRE_TOUR: Record<string, number> = { J1: 1, J2: 2, J3: 3, SF: 4, F: 5 };

async function lire<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>, quoi: string): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(`${quoi} : ${error.message}`);
  return data as T;
}

/** Les matchs de l'API (singles) avec NOS identifiants de joueuses ; erreurs si une joueuse n'est pas retrouvée. */
export function observationsDepuisApi(singles: MatchApi[], joueurs: { id: string; name: string }[]): { observations: ObservationApi[]; erreurs: string[] } {
  const erreurs: string[] = [];
  const observations: ObservationApi[] = [];
  const idDe = (nom: string): string | null => {
    const mots = nom.trim().split(/\s+/);
    const r = trouverJoueur(mots[0] ?? null, mots.slice(1).join(' '), joueurs);
    if (!r.ok) {
      if (!erreurs.includes(r.erreur)) erreurs.push(r.erreur);
      return null;
    }
    return r.id;
  };
  for (const m of singles) {
    const [a, b] = [m.player1, m.player2];
    if (!a?.name || !b?.name || a.tbd || b.tbd || a.bye || b.bye) continue;
    const p1 = idDe(a.name);
    const p2 = idDe(b.name);
    if (!p1 || !p2) continue;
    const winnerId = m.winnerId == null ? null : m.winnerId === a.id ? p1 : m.winnerId === b.id ? p2 : null;
    observations.push({ roundId: m.roundId, date: m.date ?? null, p1, p2, winnerId, live: !!m.live, result: m.result ?? '' });
  }
  return { observations, erreurs };
}

/**
 * @param ecrire faux : calcule et renvoie ce qui serait écrit, sans rien écrire.
 */
export async function appliquerResultatsMasters(sb: SupabaseClient, tournamentId: string, tableau: TableauApi, ecrire = true): Promise<ResumeResultatsMasters> {
  const vide = (erreurs: string[]): ResumeResultatsMasters => ({ ecrit: false, maj: 0, creees: 0, placees: 0, avertissements: [], erreurs, remplacements: [], tournoiStatut: null });

  // Une remplaçante (forfait avant le tournoi) ? On l'installe AVANT de lire les matchs : le reste du geste voit alors les huit bonnes joueuses.
  const remp = await appliquerRemplacementsMasters(sb, tournamentId, nomsDeApi(tableau.singles ?? []), ecrire);
  if (remp.erreurs.length) return vide([...remp.erreurs, 'Rien n\'a été écrit.']);

  const rows = await lire<
    { round: string; position: number | null; half: 'top' | 'bottom' | null; player1_id: string | null; player2_id: string | null; winner_id: string | null; status: string; sets: { g1: number | null; g2: number | null; tb1?: number | null; tb2?: number | null }[] | null; scheduled_at: string | null }[]
  >(
    sb.from('tn_matches').select('round, position, half, player1_id, player2_id, winner_id, status, sets, scheduled_at').eq('tournament_id', tournamentId),
    'tn_matches',
  );
  // Simulation : la base n'a pas bougé, on applique les échanges aux lignes lues.
  if (!ecrire && remp.echanges.length) {
    const nouveau = new Map(remp.echanges.map((e) => [e.ancienId, e.nouveauId]));
    for (const r of rows) {
      if (r.player1_id && nouveau.has(r.player1_id)) r.player1_id = nouveau.get(r.player1_id)!;
      if (r.player2_id && nouveau.has(r.player2_id)) r.player2_id = nouveau.get(r.player2_id)!;
    }
  }
  const ids = [...new Set(rows.flatMap((r) => [r.player1_id, r.player2_id]).filter((x): x is string => x !== null))];
  const joueurs = ids.length ? await lire<{ id: string; name: string }[]>(sb.from('tn_players').select('id, name').in('id', ids), 'tn_players') : [];

  const { observations, erreurs } = observationsDepuisApi(tableau.singles ?? [], joueurs);
  if (erreurs.length) return vide([...erreurs, 'Rien n\'a été écrit.']);

  const lignes: LigneMatchMasters[] = rows.map((r) => ({
    round: r.round,
    position: r.position,
    half: r.half,
    player1Id: r.player1_id,
    player2Id: r.player2_id,
    winnerId: r.winner_id,
    status: r.status,
    sets: (r.sets ?? []).map((s) => ({ g1: s.g1, g2: s.g2, tb1: s.tb1 ?? null, tb2: s.tb2 ?? null })) as LigneMatchMasters['sets'],
    scheduledAt: r.scheduled_at,
  }));
  const plan = planResultatsMasters(lignes, observations);
  const resume: ResumeResultatsMasters = {
    ecrit: ecrire,
    maj: plan.maj.length,
    creees: plan.creations.length,
    placees: plan.placements.length,
    avertissements: plan.avertissements,
    erreurs: [],
    remplacements: remp.messages,
    tournoiStatut: plan.tournoiStatut,
  };
  if (!ecrire) return resume;

  for (const c of plan.creations) {
    const { error } = await sb.from('tn_matches').insert({
      tournament_id: tournamentId,
      external_id: `api:${tournamentId}:${c.round}:${c.position}`,
      round: c.round,
      round_order: ORDRE_TOUR[c.round],
      position: c.position,
      half: c.half,
      player1_id: c.player1Id,
      player2_id: c.player2Id,
      status: 'scheduled',
      sets: [],
    });
    if (error) throw new Error(`tn_matches (création ${c.round}|${c.position}) : ${error.message}`);
  }
  for (const m of plan.maj) {
    const { error } = await sb
      .from('tn_matches')
      .update({ winner_id: m.winnerId, status: m.status, sets: m.sets, scheduled_at: m.scheduledAt, updated_at: new Date().toISOString() })
      .eq('tournament_id', tournamentId)
      .eq('round', m.round)
      .eq('position', m.position);
    if (error) throw new Error(`tn_matches (mise à jour ${m.round}|${m.position}) : ${error.message}`);
  }
  for (const p of plan.placements) {
    const { error } = await sb
      .from('tn_matches')
      .update({ player1_id: p.player1Id, player2_id: p.player2Id })
      .eq('tournament_id', tournamentId)
      .eq('round', p.round)
      .eq('position', p.position)
      .is('winner_id', null);
    if (error) throw new Error(`tn_matches (placement ${p.round}|${p.position}) : ${error.message}`);
  }

  // Statut du tournoi : on avance (upcoming -> running -> completed), on ne recule jamais.
  const t = await lire<{ status: string } | null>(sb.from('tn_tournaments').select('status').eq('id', tournamentId).maybeSingle(), 'tn_tournaments');
  const rang = { upcoming: 0, running: 1, completed: 2 } as Record<string, number>;
  if (t && (rang[plan.tournoiStatut] ?? 0) > (rang[t.status] ?? 0)) {
    const { error } = await sb.from('tn_tournaments').update({ status: plan.tournoiStatut }).eq('id', tournamentId);
    if (error) throw new Error(`tn_tournaments (statut) : ${error.message}`);
  }

  // Les points des picks sont enregistrés : recalcul quand des résultats ont changé.
  if (plan.maj.length > 0) {
    const { error } = await sb.rpc('tn_recompute_picks', { p_tournament_id: tournamentId });
    if (error) throw new Error(`Recalcul des points des picks : ${error.message}`);
  }
  return resume;
}
