'use server';

import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { supabaseAdmin } from '@/supabase/server';
import { loadEngineData, tourCourantMatches } from '@/supabase/queries';
import {
  computeAndStoreProjections,
  invaliderProjections,
} from '@/supabase/projections';
import {
  parseExtract,
  extraireJoueurs,
  verifierExtraction,
  devinerSurface,
  devinerBestOf,
} from '@/lib/parser';
import type { DrawExtract, Match } from '@/lib/types';

export interface ImportResult {
  ok: boolean;
  error?: string;
  avertissements: string[];
  tournamentId?: string;
  resume?: {
    tournoi: string;
    joueurs: number;
    matchs: number;
    rounds: string[];
  };
}

const DRAW_FROM_ROUND: Record<string, number> = {
  R128: 128,
  R64: 64,
  R32: 32,
  R16: 16,
  QF: 8,
  SF: 4,
  F: 2,
};

function prettifyName(slug: string | null): string {
  if (!slug) return 'Tournoi';
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Sets orientés joueur1 : [{g1,g2,tb1,tb2}], sets vides ignorés. */
function setsJson(m: Match) {
  const [p1, p2] = m.players;
  const n = Math.max(p1.sets.length, p2.sets.length);
  const out: { g1: number | null; g2: number | null; tb1: number | null; tb2: number | null }[] =
    [];
  for (let i = 0; i < n; i++) {
    const g1 = p1.sets[i]?.games ?? null;
    const g2 = p2.sets[i]?.games ?? null;
    if (g1 === null && g2 === null) continue;
    out.push({
      g1,
      g2,
      tb1: p1.sets[i]?.tiebreak ?? null,
      tb2: p2.sets[i]?.tiebreak ?? null,
    });
  }
  return out;
}

export async function importerExtrait(jsonText: string): Promise<ImportResult> {
  // Une Server Action est un POST vers la route qui l'héberge, pas une route
  // distincte : la couverture du proxy ne suffit pas à la protéger.
  if (!(await sessionValide())) {
    return { ok: false, error: 'Non authentifié.', avertissements: [] };
  }

  // 1. Parse JSON brut
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: 'JSON invalide : impossible à parser.', avertissements: [] };
  }

  let extract: DrawExtract;
  try {
    extract = parseExtract(raw);
  } catch (e) {
    return {
      ok: false,
      error: `Extraction illisible : ${(e as Error).message}`,
      avertissements: [],
    };
  }

  if (extract.matches.length === 0) {
    return { ok: false, error: 'Aucun match dans cette extraction.', avertissements: [] };
  }

  const { avertissements } = verifierExtraction(extract);

  // 2. Joueurs : identité seulement. Les Elo réels (calculés match par match,
  //    source externe) vivent déjà dans tn_players et ne doivent PAS être
  //    écrasés. On les rechargera depuis la base pour la simulation.
  const players = extraireJoueurs(extract);

  const sb = supabaseAdmin();

  // 3. Tournoi (upsert sur external_id, tour, year)
  const slug = extract.tournament.slug;
  const mois = new Date(extract.extractedAt).getUTCMonth() + 1;
  const surface = devinerSurface(slug, mois);
  const bestOf = devinerBestOf(extract.tour, slug);
  const rounds = extract.roundsFound;
  const drawSize = DRAW_FROM_ROUND[rounds[0]] ?? null;

  // Statut : terminé si la finale est jouée
  const finale = extract.matches.find(
    (m) => m.round === rounds[rounds.length - 1] && m.status === 'completed',
  );
  const status = finale ? 'completed' : 'running';

  const tournamentPayload = {
    external_id: extract.tournament.atpId,
    slug,
    name: `${prettifyName(slug)} ${extract.tournament.year}`,
    tour: extract.tour,
    surface,
    draw_size: drawSize,
    best_of: bestOf,
    year: extract.tournament.year,
    status,
    rounds,
  };

  let tournamentId: string;
  if (extract.tournament.atpId) {
    const { data, error } = await sb
      .from('tn_tournaments')
      .upsert(tournamentPayload, { onConflict: 'external_id,tour,year' })
      .select('id')
      .single();
    if (error) return { ok: false, error: `Tournoi : ${error.message}`, avertissements };
    tournamentId = data.id;
  } else {
    // Pas d'ID ATP : on retrouve/insère à la main sur slug+tour+year
    const { data: existing } = await sb
      .from('tn_tournaments')
      .select('id')
      .eq('slug', slug ?? '')
      .eq('tour', extract.tour)
      .eq('year', extract.tournament.year)
      .maybeSingle();
    if (existing) {
      const { error } = await sb
        .from('tn_tournaments')
        .update(tournamentPayload)
        .eq('id', existing.id);
      if (error) return { ok: false, error: `Tournoi : ${error.message}`, avertissements };
      tournamentId = existing.id;
    } else {
      const { data, error } = await sb
        .from('tn_tournaments')
        .insert(tournamentPayload)
        .select('id')
        .single();
      if (error) return { ok: false, error: `Tournoi : ${error.message}`, avertissements };
      tournamentId = data.id;
    }
  }

  // 4. Joueurs (upsert sur id) — identité uniquement : on ne touche ni au rang
  //    ni aux colonnes Elo, renseignées par ailleurs avec des Elo réels.
  const playerPayload = Object.values(players).map((p) => ({
    id: p.id,
    tour: p.tour,
    name: p.name,
    country: p.country,
  }));
  if (playerPayload.length) {
    const { error } = await sb
      .from('tn_players')
      .upsert(playerPayload, { onConflict: 'id' });
    if (error) return { ok: false, error: `Joueurs : ${error.message}`, avertissements };
  }

  // 5. Matchs (upsert sur tournament_id, round, position)
  const roundOrder: Record<string, number> = {};
  rounds.forEach((r, i) => (roundOrder[r] = i + 1));

  const matchPayload = extract.matches.map((m) => {
    const [p1, p2] = m.players;
    const p1id = p1.isBye ? null : p1.id;
    const p2id = p2.isBye ? null : p2.id;
    const winnerId =
      (p1.winner && p1id) || (p2.winner && p2id) || null;
    return {
      tournament_id: tournamentId,
      external_id: m.matchId,
      round: m.round,
      round_order: roundOrder[m.round] ?? 0,
      position: m.position,
      half: m.half,
      player1_id: p1id,
      player2_id: p2id,
      winner_id: winnerId,
      sets: setsJson(m),
      status: m.status,
    };
  });

  if (matchPayload.length) {
    const { error } = await sb
      .from('tn_matches')
      .upsert(matchPayload, { onConflict: 'tournament_id,round,position' });
    if (error) return { ok: false, error: `Matchs : ${error.message}`, avertissements };
  }

  // 6. Cache des projections Monte Carlo. On invalide tout le cache du tournoi
  //    (les résultats du tour importé changent les survivants) puis on préchauffe
  //    le tour courant. Les autres tours seront simulés à la demande (et mis en
  //    cache) au premier affichage. Chaque simulation part des survivants réels
  //    du tour concerné (simulerDepuis) et coûte plusieurs secondes.
  try {
    await invaliderProjections(tournamentId);
    const engine = await loadEngineData(tournamentId);
    if (engine) {
      const rc = tourCourantMatches(engine.matchRows, engine.tournament.rounds ?? []);
      if (rc) await computeAndStoreProjections(engine, rc);
    }
  } catch (e) {
    // La simulation ne doit pas faire échouer l'import lui-même.
    console.error('Projections (import):', (e as Error).message);
  }

  revalidatePath('/');
  revalidatePath(`/tournoi/${tournamentId}`);
  revalidatePath(`/tournoi/${tournamentId}/picks`);
  revalidatePath(`/tournoi/${tournamentId}/resultats`);

  return {
    ok: true,
    avertissements,
    tournamentId,
    resume: {
      tournoi: tournamentPayload.name,
      joueurs: playerPayload.length,
      matchs: matchPayload.length,
      rounds,
    },
  };
}
