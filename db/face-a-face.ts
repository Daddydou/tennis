import 'server-only';
import { supabaseAnon } from './anon';
import {
  chargerIndexElo,
  eloEffectifResolu,
  resoudreElosParJoueur,
  type ElosResolus,
  type SurfaceElo,
} from './elo';
import { getPlayerRows, type PlayerRow } from './queries';
import { bilanFaceAFace, type BilanFaceAFace, type RencontreBrute } from '@/lib/faceAFace';
import { pVictoire } from '@/lib/elo';
import type { MatchStatus, Surface, Tour } from '@/lib/types';

/**
 * FACE-À-FACE — lectures (clé anon uniquement).
 *
 * Deux sources, jamais mélangées :
 *   - les RENCONTRES viennent de tn_matches, donc des seuls tournois importés ;
 *   - la COMPARAISON vient des Elo Tennis Abstract déjà extraits (ta_elo
 *     pour l'état courant, ta_elo_historique pour l'évolution) — ils ne
 *     contiennent aucun match, seulement des notes.
 */

/** Taille de page PostgREST : au-delà, une lecture non paginée est tronquée. */
const PAGE = 1000;

/** Joueurs d'un circuit, par ordre alphabétique — pour les deux sélecteurs. */
export async function listerJoueursDuCircuit(
  tour: Tour,
): Promise<{ id: string; name: string }[]> {
  const sb = supabaseAnon();
  const out: { id: string; name: string }[] = [];
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await sb
      .from('tn_players')
      .select('id, name')
      .eq('tour', tour)
      // Places réservées « Q. QUALIFIER3 » des tableaux importés avant le tirage
      // des qualifications : pas des joueurs, rien à comparer.
      .not('name', 'ilike', '%qualifier%')
      .order('name', { ascending: true })
      .range(debut, debut + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as { id: string; name: string }[]));
    if (!data || data.length < PAGE) return out;
  }
}

/** Un point de l'évolution Elo d'un joueur (un relevé Tennis Abstract). */
export interface PointElo {
  releveLe: string;
  eloOverall: number | null;
}

export interface ComparaisonSurface {
  surface: SurfaceElo;
  eloA: number;
  eloB: number;
  /** P(A bat B) selon l'Elo effectif sur cette surface, comme la simulation. */
  pA: number;
}

export interface FaceAFace {
  a: PlayerRow;
  b: PlayerRow;
  bilan: BilanFaceAFace;
  elos: { a: ElosResolus; b: ElosResolus };
  surfaces: ComparaisonSurface[];
  evolution: { a: PointElo[]; b: PointElo[] };
}

async function rencontres(idA: string, idB: string): Promise<RencontreBrute[]> {
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('tn_matches')
    .select(
      'round, player1_id, player2_id, winner_id, sets, status, tn_tournaments(name, start_date, surface)',
    )
    .or(
      `and(player1_id.eq.${idA},player2_id.eq.${idB}),and(player1_id.eq.${idB},player2_id.eq.${idA})`,
    );
  if (error) throw new Error(error.message);

  type Ligne = {
    round: string;
    player1_id: string | null;
    player2_id: string | null;
    winner_id: string | null;
    sets: RencontreBrute['sets'];
    status: MatchStatus;
    tn_tournaments: { name: string; start_date: string | null; surface: Surface | null } | null;
  };
  return ((data ?? []) as unknown as Ligne[]).map((m) => ({
    tournoi: m.tn_tournaments?.name ?? '—',
    date: m.tn_tournaments?.start_date ?? null,
    surface: m.tn_tournaments?.surface ?? null,
    round: m.round,
    player1Id: m.player1_id,
    player2Id: m.player2_id,
    winnerId: m.winner_id,
    sets: m.sets,
    status: m.status,
  }));
}

/** Relevés Elo archivés des joueurs appariés à Tennis Abstract, du plus ancien au plus récent. */
async function evolutionElo(
  tour: Tour,
  slugs: string[],
): Promise<Record<string, PointElo[]>> {
  const out: Record<string, PointElo[]> = {};
  if (slugs.length === 0) return out;
  const { data, error } = await supabaseAnon()
    .from('ta_elo_historique')
    .select('ta_slug, releve_le, elo_overall')
    .eq('tour', tour.toLowerCase())
    .in('ta_slug', slugs)
    .order('releve_le', { ascending: true });
  // 42P01 : migration 0010 pas appliquée — pas d'évolution, pas d'erreur.
  if (error) {
    if (error.code === '42P01') return out;
    throw new Error(error.message);
  }
  for (const r of data ?? []) {
    (out[r.ta_slug] ??= []).push({
      releveLe: r.releve_le,
      eloOverall: r.elo_overall === null ? null : Number(r.elo_overall),
    });
  }
  return out;
}

/**
 * Tout ce qu'affiche l'écran pour deux joueurs. null si l'un des deux est
 * inconnu, ou s'ils ne sont pas du même circuit (un face-à-face ATP/WTA n'a
 * pas de sens, et leurs Elo ne sont pas sur la même échelle).
 */
export async function chargerFaceAFace(idA: string, idB: string): Promise<FaceAFace | null> {
  // Les ids viennent de l'URL et finissent dans un filtre `.or()` PostgREST :
  // une virgule ou une parenthèse y changerait la requête. Les ids ATP/WTA
  // sont alphanumériques ; tout le reste est refusé avant la moindre lecture.
  const ID_VALIDE = /^[A-Za-z0-9_-]{1,64}$/;
  if (!ID_VALIDE.test(idA) || !ID_VALIDE.test(idB) || idA === idB) return null;

  const lignes = await getPlayerRows([idA, idB]);
  const a = lignes.find((p) => p.id === idA);
  const b = lignes.find((p) => p.id === idB);
  if (!a || !b || a.tour !== b.tour) return null;

  const [brutes, index] = await Promise.all([rencontres(idA, idB), chargerIndexElo(a.tour)]);
  const elos = resoudreElosParJoueur([a, b], index);
  const eA = elos[idA];
  const eB = elos[idB];

  const surfaces: ComparaisonSurface[] = (['hard', 'clay', 'grass'] as const).map((surface) => {
    const eloA = eloEffectifResolu(eA, surface);
    const eloB = eloEffectifResolu(eB, surface);
    return { surface, eloA, eloB, pA: pVictoire(eloA, eloB) };
  });

  const slugs = [eA.taSlug, eB.taSlug].filter((s): s is string => s !== null);
  const parSlug = await evolutionElo(a.tour, slugs);

  return {
    a,
    b,
    bilan: bilanFaceAFace(idA, idB, brutes),
    elos: { a: eA, b: eB },
    surfaces,
    evolution: {
      a: eA.taSlug ? (parSlug[eA.taSlug] ?? []) : [],
      b: eB.taSlug ? (parSlug[eB.taSlug] ?? []) : [],
    },
  };
}
