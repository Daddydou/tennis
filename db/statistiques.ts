import 'server-only';
import { supabaseAnon } from './anon';
import { toutLire } from './bilan-saison';
import { listerSurveillances } from './importAuto';
import { supabaseAdmin } from './server';
import type { PlanReservationRow, SimulatedPickRow } from './queries';
import type { CoteHistStat } from '@/lib/stats/commun';
import type { LogImportStat, SurveillanceStat } from '@/lib/stats/marche';
import type { ParticipantExterne, TournoiExterne } from '@/lib/stats/bracket';

/**
 * ONGLET STATISTIQUES — lectures complémentaires. Tout est en LECTURE SEULE.
 *
 * Les tables publiques se lisent avec la clé anon (RLS = select). Seul le journal d'import
 * (tn_import_log, tn_import_auto) est privé : il se lit avec la clé de service, et UNIQUEMENT
 * après une vérification de session faite par l'appelant (app/statistiques/donnees.ts).
 */

/** Captures de cotes (historique) des tournois donnés. */
export function cotesHistoriqueDesTournois(ids: string[]): Promise<CoteHistStat[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return toutLire<CoteHistStat>((d, f) =>
    supabaseAnon()
      .from('tn_odds_historique')
      .select('tournament_id, event_id, player_a_id, player_b_id, proba_a, proba_b, capture_le')
      .in('tournament_id', ids)
      .order('id')
      .range(d, f),
  );
}

export function reservationsDesTournois(ids: string[]): Promise<PlanReservationRow[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return toutLire<PlanReservationRow>((d, f) =>
    supabaseAnon().from('tn_plan_reservations').select('*').in('tournament_id', ids).order('id').range(d, f),
  );
}

export function picksSimulesDesTournois(ids: string[]): Promise<SimulatedPickRow[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return toutLire<SimulatedPickRow>((d, f) =>
    supabaseAnon().from('tn_simulated_picks').select('*').in('tournament_id', ids).order('id').range(d, f),
  );
}

/** Bracket de Thomas (API externe) : participants et tournois liés. */
export async function bracketExterne(): Promise<{ participants: ParticipantExterne[]; tournois: TournoiExterne[] }> {
  const sb = supabaseAnon();
  const [p, t] = await Promise.all([
    sb
      .from('tn_bracket_externe_participants')
      .select('tournoi_id, pseudo, rempli, points_totaux_thomas, points_totaux_calcule'),
    sb.from('tn_bracket_externe_tournois').select('id, nom, tournament_id_interne'),
  ]);
  if (p.error) throw new Error(`tn_bracket_externe_participants : ${p.error.message}`);
  if (t.error) throw new Error(`tn_bracket_externe_tournois : ${t.error.message}`);
  return {
    participants: (p.data ?? []) as ParticipantExterne[],
    tournois: (t.data ?? []) as TournoiExterne[],
  };
}

/* -------------------------------------------------------------------------- */
/*  Journal d'import (privé)                                                   */
/* -------------------------------------------------------------------------- */

/** Les 1 000 derniers passages d'import et l'état de surveillance. Clé de service : session exigée en amont. */
export async function journalImport(): Promise<{ logs: LogImportStat[]; surveillances: SurveillanceStat[] }> {
  const [logs, surveillances] = await Promise.all([
    supabaseAdmin()
      .from('tn_import_log')
      .select('tournament_id, source, ok, matchs_total, matchs_changes, avertissements, erreur, duree_ms, created_at')
      .order('created_at', { ascending: false })
      .limit(1000),
    listerSurveillances(),
  ]);
  if (logs.error) throw new Error(`tn_import_log : ${logs.error.message}`);
  return {
    logs: (logs.data ?? []) as LogImportStat[],
    surveillances: surveillances.map((s) => ({
      tournament_id: s.tournament_id,
      actif: s.actif,
      echecs_consecutifs: s.echecs_consecutifs,
      dernier_succes_at: s.dernier_succes_at,
      arrete_at: s.arrete_at,
      motif_arret: s.motif_arret,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/*  Comptes et fraîcheur                                                       */
/* -------------------------------------------------------------------------- */

const TABLES_COMPTEES: { table: string; libelle: string }[] = [
  { table: 'tn_tournaments', libelle: 'Tournois' },
  { table: 'tn_matches', libelle: 'Matchs' },
  { table: 'tn_players', libelle: 'Joueurs suivis' },
  { table: 'tn_picks', libelle: 'Picks posés' },
  { table: 'tn_bracket_round_picks', libelle: 'Pronostics de bracket' },
  { table: 'tn_simulated_picks', libelle: 'Picks du simulateur' },
  { table: 'tn_projections', libelle: 'Projections' },
  { table: 'tn_odds_historique', libelle: 'Relevés de cotes' },
  { table: 'tn_elo_maison', libelle: 'Notes Elo maison' },
];

export async function compterTables(): Promise<{ libelle: string; valeur: number }[]> {
  const sb = supabaseAnon();
  const res = await Promise.all(
    TABLES_COMPTEES.map(async (t) => {
      const { count, error } = await sb.from(t.table).select('*', { count: 'exact', head: true });
      if (error) throw new Error(`${t.table} : ${error.message}`);
      return { libelle: t.libelle, valeur: count ?? 0 };
    }),
  );
  return res;
}

const DATES_SUIVIES: { libelle: string; table: string; colonne: string }[] = [
  { libelle: 'Matchs (dernière mise à jour)', table: 'tn_matches', colonne: 'updated_at' },
  { libelle: 'Projections', table: 'tn_projections', colonne: 'computed_at' },
  { libelle: 'Fantasy', table: 'tn_fantasy', colonne: 'computed_at' },
  { libelle: 'Cotes (cache)', table: 'tn_odds', colonne: 'recupere_le' },
  { libelle: 'Cotes (historique)', table: 'tn_odds_historique', colonne: 'capture_le' },
  { libelle: 'Elo des joueurs', table: 'tn_players', colonne: 'elo_updated_at' },
  { libelle: 'Elo maison (notes)', table: 'tn_elo_maison', colonne: 'updated_at' },
];

export async function dernieresDates(): Promise<{ libelle: string; dernier: string | null }[]> {
  const sb = supabaseAnon();
  return Promise.all(
    DATES_SUIVIES.map(async (d) => {
      const { data, error } = await sb
        .from(d.table)
        .select(d.colonne)
        .not(d.colonne, 'is', null)
        .order(d.colonne, { ascending: false })
        .limit(1);
      if (error) throw new Error(`${d.table} : ${error.message}`);
      const ligne = (data ?? [])[0] as unknown as Record<string, string> | undefined;
      return { libelle: d.libelle, dernier: ligne ? ligne[d.colonne] : null };
    }),
  );
}

/** Dernière mise à jour des matchs d'un tournoi précis (pour les tournois en cours). */
export async function dernierMatchMisAJour(tournoiId: string): Promise<string | null> {
  const { data, error } = await supabaseAnon()
    .from('tn_matches')
    .select('updated_at')
    .eq('tournament_id', tournoiId)
    .not('updated_at', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`tn_matches : ${error.message}`);
  return ((data ?? [])[0] as { updated_at: string } | undefined)?.updated_at ?? null;
}

export type { PlanReservationRow, SimulatedPickRow };
