import 'server-only';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from './server';
import { parseExtract } from '@/lib/parser';
import {
  contenuAEmpreinter,
  enPauseApresEchec,
  estDu,
  modeParDefaut,
  motifArret,
  PAUSE_APRES_ECHEC_MS,
  urlSourceValide,
  type ModeImportAuto,
  type MotifArret,
  type SourceImport,
} from '@/lib/importAutoRegles';
import type { Tour } from '@/lib/types';
import type { ImportResult } from './importCoeur';

/**
 * IMPORT AUTOMATIQUE — lecture/écriture de `tn_import_auto` (surveillance) et
 * `tn_import_log` (journal), migration 0026.
 *
 * Tables PRIVÉES (aucune lecture publique) : tout passe par `supabaseAdmin()`.
 * Les appelants ont déjà vérifié l'accès (session pour /import, jeton
 * `x-import-token` pour /api/import-auto/*). Les règles (échéance, arrêt)
 * vivent dans lib/importAutoRegles.ts.
 */

export interface LigneImportAuto {
  tournament_id: string;
  tour: Tour;
  source_url: string;
  mode: ModeImportAuto;
  actif: boolean;
  premier_import_at: string;
  dernier_succes_at: string | null;
  dernier_hash: string | null;
  derniere_erreur: string | null;
  echecs_consecutifs: number;
  arrete_at: string | null;
  motif_arret: MotifArret | null;
  created_at: string;
}

export interface LigneImportLog {
  id: number;
  tournament_id: string | null;
  source: SourceImport;
  ok: boolean;
  matchs_total: number | null;
  matchs_changes: number | null;
  avertissements: string[];
  erreur: string | null;
  duree_ms: number | null;
  created_at: string;
}

/** Empreinte SHA-256 du contenu d'une extraction (sans horodatage ni URL). */
export function empreinte(brut: unknown): string {
  return createHash('sha256').update(contenuAEmpreinter(brut)).digest('hex');
}

/** Ajoute une ligne au journal. Ne lève jamais : le journal ne doit rien bloquer. */
export async function journaliser(entree: {
  tournament_id: string | null;
  source: SourceImport;
  ok: boolean;
  matchs_total?: number | null;
  matchs_changes?: number | null;
  avertissements?: string[];
  erreur?: string | null;
  duree_ms?: number | null;
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin()
      .from('tn_import_log')
      .insert({
        ...entree,
        avertissements: entree.avertissements ?? [],
        erreur: entree.erreur ? entree.erreur.slice(0, 2000) : null,
        duree_ms: entree.duree_ms == null ? null : Math.max(0, Math.round(entree.duree_ms)),
      });
    if (error) console.error('[import-auto] journal :', error.message);
  } catch (e) {
    console.error('[import-auto] journal :', (e as Error).message);
  }
}

export async function lireSurveillance(tournamentId: string): Promise<LigneImportAuto | null> {
  const { data, error } = await supabaseAdmin()
    .from('tn_import_auto')
    .select('*')
    .eq('tournament_id', tournamentId)
    .maybeSingle();
  if (error) throw new Error(`Surveillance : ${error.message}`);
  return (data as LigneImportAuto | null) ?? null;
}

export async function listerSurveillances(): Promise<LigneImportAuto[]> {
  const { data, error } = await supabaseAdmin()
    .from('tn_import_auto')
    .select('*')
    .order('actif', { ascending: false })
    .order('premier_import_at', { ascending: false });
  if (error) throw new Error(`Surveillances : ${error.message}`);
  return (data as LigneImportAuto[]) ?? [];
}

/** Date du dernier échec AUTOMATIQUE de moins d'une heure, par tournoi. */
export async function echecsAutoRecents(maintenant: Date): Promise<Map<string, string>> {
  const depuis = new Date(maintenant.getTime() - PAUSE_APRES_ECHEC_MS).toISOString();
  const { data, error } = await supabaseAdmin()
    .from('tn_import_log')
    .select('tournament_id, created_at')
    .eq('ok', false)
    .in('source', ['serveur', 'navigateur'])
    .gte('created_at', depuis)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Journal : ${error.message}`);
  const parTournoi = new Map<string, string>();
  for (const l of data ?? []) {
    if (l.tournament_id && !parTournoi.has(l.tournament_id)) parTournoi.set(l.tournament_id, l.created_at);
  }
  return parTournoi;
}

/**
 * Motif d'arrêt applicable MAINTENANT, sans rien écrire : finale gagnée en
 * base, tournoi terminé / date de fin dépassée, plafond de 21 jours.
 */
export async function calculerArret(s: LigneImportAuto, maintenant: Date): Promise<MotifArret | null> {
  const sb = supabaseAdmin();
  const [{ data: tournoi, error: eT }, { data: finale, error: eF }] = await Promise.all([
    sb.from('tn_tournaments').select('status, end_date').eq('id', s.tournament_id).maybeSingle(),
    sb
      .from('tn_matches')
      .select('id')
      .eq('tournament_id', s.tournament_id)
      .eq('round', 'F')
      .not('winner_id', 'is', null)
      .limit(1),
  ]);
  if (eT) throw new Error(`Tournoi : ${eT.message}`);
  if (eF) throw new Error(`Finale : ${eF.message}`);
  return motifArret(
    {
      finaleGagnee: (finale ?? []).length > 0,
      statutTournoi: tournoi?.status ?? null,
      dateFin: tournoi?.end_date ?? null,
      premierImportAt: s.premier_import_at,
    },
    maintenant,
  );
}

/** Coupe la surveillance (actif=false, date et motif). */
export async function arreterSurveillance(tournamentId: string, motif: MotifArret, maintenant = new Date()) {
  const { error } = await supabaseAdmin()
    .from('tn_import_auto')
    .update({ actif: false, arrete_at: maintenant.toISOString(), motif_arret: motif })
    .eq('tournament_id', tournamentId);
  if (error) throw new Error(`Arrêt de la surveillance : ${error.message}`);
}

/**
 * Relance une surveillance arrêtée. Le compteur des 21 jours repart de
 * maintenant (sinon un tournoi arrêté au plafond serait recoupé aussitôt) ;
 * une finale déjà gagnée le recoupera au prochain passage.
 */
export async function reprendreSurveillance(tournamentId: string, maintenant = new Date()) {
  const { error } = await supabaseAdmin()
    .from('tn_import_auto')
    .update({
      actif: true,
      arrete_at: null,
      motif_arret: null,
      echecs_consecutifs: 0,
      derniere_erreur: null,
      premier_import_at: maintenant.toISOString(),
    })
    .eq('tournament_id', tournamentId);
  if (error) throw new Error(`Reprise de la surveillance : ${error.message}`);
}

/** Évalue l'arrêt et l'applique ; renvoie le motif s'il vient d'être posé. */
export async function evaluerEtArreter(tournamentId: string, maintenant = new Date()): Promise<MotifArret | null> {
  const s = await lireSurveillance(tournamentId);
  if (!s || !s.actif) return null;
  const motif = await calculerArret(s, maintenant);
  if (motif) await arreterSurveillance(tournamentId, motif, maintenant);
  return motif;
}

/**
 * Après un import RÉUSSI (manuel ou auto) : inscrit le tournoi à la
 * surveillance s'il ne l'est pas, sinon met à jour son dernier succès ; puis
 * évalue l'arrêt. Une surveillance arrêtée n'est PAS relancée par un import.
 */
export async function noterSucces(p: {
  tournamentId: string;
  tour: Tour;
  sourceUrl: string;
  hash: string;
  maintenant?: Date;
}): Promise<{ inscrit: boolean; arret: MotifArret | null }> {
  const maintenant = p.maintenant ?? new Date();
  const sb = supabaseAdmin();
  const existante = await lireSurveillance(p.tournamentId);
  const urlValide = urlSourceValide(p.sourceUrl, p.tour);

  if (!existante) {
    if (!urlValide) {
      throw new Error(
        `URL source absente ou hors du site officiel ${p.tour} (« ${p.sourceUrl.slice(0, 120)} ») : ` +
          'tournoi non inscrit à l’import automatique.',
      );
    }
    const { error } = await sb.from('tn_import_auto').insert({
      tournament_id: p.tournamentId,
      tour: p.tour,
      source_url: p.sourceUrl,
      mode: modeParDefaut(p.tour, p.sourceUrl),
      premier_import_at: maintenant.toISOString(),
      dernier_succes_at: maintenant.toISOString(),
      dernier_hash: p.hash,
    });
    if (error) throw new Error(`Inscription à la surveillance : ${error.message}`);
  } else {
    const { error } = await sb
      .from('tn_import_auto')
      .update({
        dernier_succes_at: maintenant.toISOString(),
        dernier_hash: p.hash,
        derniere_erreur: null,
        echecs_consecutifs: 0,
        ...(urlValide ? { source_url: p.sourceUrl } : {}),
      })
      .eq('tournament_id', p.tournamentId);
    if (error) throw new Error(`Surveillance : ${error.message}`);
  }
  return { inscrit: !existante, arret: await evaluerEtArreter(p.tournamentId, maintenant) };
}

/** Échec d'un passage automatique : compteur + dernière erreur. */
export async function noterEchec(tournamentId: string, erreur: string): Promise<void> {
  const s = await lireSurveillance(tournamentId);
  if (!s) return;
  const { error } = await supabaseAdmin()
    .from('tn_import_auto')
    .update({ echecs_consecutifs: s.echecs_consecutifs + 1, derniere_erreur: erreur.slice(0, 2000) })
    .eq('tournament_id', tournamentId);
  if (error) console.error('[import-auto] échec non noté :', error.message);
}

/**
 * Import MANUEL (/import) terminé : journal + inscription/maj de la
 * surveillance. Renvoie un avertissement à afficher, ou null. Ne lève jamais.
 */
export async function noterImportManuel(
  jsonText: string,
  resultat: ImportResult,
  dureeMs: number,
): Promise<string | null> {
  if (!resultat.ok || !resultat.tournamentId) {
    await journaliser({ tournament_id: null, source: 'manuel', ok: false, erreur: resultat.error ?? null, duree_ms: dureeMs });
    return null;
  }
  try {
    const brut = JSON.parse(jsonText);
    const extract = parseExtract(brut);
    const hash = empreinte(brut);
    await journaliser({
      tournament_id: resultat.tournamentId,
      source: 'manuel',
      ok: true,
      matchs_total: resultat.resume?.matchs ?? null,
      matchs_changes: resultat.matchsChanges ?? null,
      avertissements: resultat.avertissements,
      duree_ms: dureeMs,
    });
    const { inscrit, arret } = await noterSucces({
      tournamentId: resultat.tournamentId,
      tour: extract.tour,
      sourceUrl: extract.sourceUrl,
      hash,
    });
    if (arret) return `Import automatique : surveillance arrêtée (${arret}).`;
    if (inscrit) return 'Import automatique : tournoi inscrit, ré-import toutes les 12 h jusqu’à la finale.';
    return null;
  } catch (e) {
    console.error('[import-auto] suivi de l’import manuel :', (e as Error).message);
    return `Import automatique : ${(e as Error).message}`;
  }
}

export interface EtatTournoi {
  tournament_id: string;
  tour: Tour;
  source_url: string;
  mode: ModeImportAuto;
  du: boolean;
  dernier_succes_at: string | null;
}

/**
 * GET /api/import-auto/etat : tournois actifs et leur échéance. Lecture seule.
 * Lu par le userscript : les tournois en mode 'api' en sont EXCLUS (le
 * serveur s'en charge seul ; leur URL source n'est pas une page à ouvrir).
 */
export async function etatSurveillances(maintenant = new Date()): Promise<EtatTournoi[]> {
  const [lignes, echecs] = await Promise.all([listerSurveillances(), echecsAutoRecents(maintenant)]);
  return lignes
    .filter((s) => s.actif && s.mode !== 'api')
    .map((s) => ({
      tournament_id: s.tournament_id,
      tour: s.tour,
      source_url: s.source_url,
      mode: s.mode,
      du: estDu(s, maintenant) && !enPauseApresEchec(echecs.get(s.tournament_id) ?? null, maintenant),
      dernier_succes_at: s.dernier_succes_at,
    }));
}

/** Les n dernières lignes de journal de chaque tournoi (écran /import). */
export async function journalRecent(tournamentIds: string[], n = 10): Promise<Map<string, LigneImportLog[]>> {
  const sb = supabaseAdmin();
  // Une requête par tournoi (une poignée au plus) : une limite globale
  // laisserait un tournoi bavard masquer le journal des autres.
  const lignes = await Promise.all(
    tournamentIds.map(async (id) => {
      const { data, error } = await sb
        .from('tn_import_log')
        .select('*')
        .eq('tournament_id', id)
        .order('created_at', { ascending: false })
        .limit(n);
      if (error) throw new Error(`Journal : ${error.message}`);
      return [id, (data as LigneImportLog[]) ?? []] as const;
    }),
  );
  return new Map(lignes);
}

export interface VueSurveillance extends LigneImportAuto {
  nom: string;
  journal: LigneImportLog[];
}

/** Écran /import : surveillances (actives d'abord), nom du tournoi et 10 derniers logs. */
export async function vueImportsAuto(): Promise<VueSurveillance[]> {
  const lignes = await listerSurveillances();
  if (lignes.length === 0) return [];
  const ids = lignes.map((l) => l.tournament_id);
  const [{ data: tournois, error }, journal] = await Promise.all([
    supabaseAdmin().from('tn_tournaments').select('id, name').in('id', ids),
    journalRecent(ids, 10),
  ]);
  if (error) throw new Error(`Tournois : ${error.message}`);
  const noms = new Map((tournois ?? []).map((t) => [t.id as string, t.name as string]));
  return lignes.map((l) => ({ ...l, nom: noms.get(l.tournament_id) ?? l.tournament_id, journal: journal.get(l.tournament_id) ?? [] }));
}
