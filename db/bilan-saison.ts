import 'server-only';
import { supabaseAnon } from './anon';
import { chargerIndexElo, resoudreElosParJoueur } from './elo';
import type { BracketRoundPickRow, MatchRow, PickRow, PlayerRow } from './queries';
import type { ReleveElo } from '@/lib/bilanSaison';
import type { Tour } from '@/lib/types';

/**
 * BILAN DE SAISON — lectures brutes (clé anon uniquement), toutes PAGINÉES :
 * PostgREST tronque silencieusement une lecture à 1000 lignes, et une saison
 * compte plusieurs milliers de matchs et de relevés Elo.
 */

const PAGE = 1000;

/** Lit toutes les pages d'une requête ordonnée. */
async function toutLire<T>(
  requete: (debut: number, fin: number) => PromiseLike<{ data: unknown[] | null; error: { message: string; code?: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await requete(debut, debut + PAGE - 1);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

/** Matchs des tournois donnés (tous statuts). */
export function matchsDesTournois(ids: string[]): Promise<MatchRow[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return toutLire<MatchRow>((d, f) =>
    supabaseAnon().from('tn_matches').select('*').in('tournament_id', ids).order('id').range(d, f),
  );
}

/** Tous les picks (moi et participants) des tournois donnés. */
export function picksDesTournois(ids: string[]): Promise<PickRow[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return toutLire<PickRow>((d, f) =>
    supabaseAnon().from('tn_picks').select('*').in('tournament_id', ids).order('id').range(d, f),
  );
}

/** Pronostics de Bracket (tous stocks) des tournois donnés. */
export function bracketPicksDesTournois(ids: string[]): Promise<BracketRoundPickRow[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return toutLire<BracketRoundPickRow>((d, f) =>
    supabaseAnon()
      .from('tn_bracket_round_picks')
      .select('*')
      .in('tournament_id', ids)
      .order('id')
      .range(d, f),
  );
}

/**
 * Slugs Tennis Abstract des joueurs présents dans nos tournois (tn_players),
 * résolus par la même cascade que partout ailleurs (db/elo.ts). Sert à
 * restreindre le bilan Elo aux joueurs qu'on suit réellement — l'archive
 * couvre tout le circuit, juniors et joueurs inactifs compris.
 */
export async function slugsDeNosJoueurs(tour: Tour): Promise<Set<string>> {
  const [joueurs, index] = await Promise.all([
    toutLire<PlayerRow>((d, f) =>
      supabaseAnon().from('tn_players').select('*').eq('tour', tour).order('id').range(d, f),
    ),
    chargerIndexElo(tour),
  ]);
  const elos = resoudreElosParJoueur(joueurs, index);
  return new Set(
    Object.values(elos)
      .map((e) => e.taSlug)
      .filter((s): s is string => s !== null),
  );
}

/**
 * Relevés Elo archivés d'un circuit sur une année civile. Vide si l'archive
 * n'existe pas encore (migration 0010 non appliquée).
 */
export async function relevesEloDeLAnnee(tour: Tour, annee: number): Promise<ReleveElo[]> {
  try {
    const lignes = await toutLire<{
      ta_slug: string;
      ta_name: string;
      releve_le: string;
      elo_overall: number | string | null;
    }>((d, f) =>
      supabaseAnon()
        .from('ta_elo_historique')
        .select('ta_slug, ta_name, releve_le, elo_overall')
        .eq('tour', tour.toLowerCase())
        .gte('releve_le', `${annee}-01-01`)
        .lte('releve_le', `${annee}-12-31`)
        .order('id')
        .range(d, f),
    );
    return lignes.map((r) => ({
      slug: r.ta_slug,
      nom: r.ta_name,
      releveLe: r.releve_le,
      elo: r.elo_overall === null ? null : Number(r.elo_overall),
    }));
  } catch (e) {
    if ((e as { code?: string }).code === '42P01') return [];
    throw e;
  }
}
