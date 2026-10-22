import 'server-only';
import { supabaseAdmin } from './server';
import { importerExtraitCoeur, type ImportResult } from './importCoeur';
import { noterImportManuel } from './importAuto';
import { calendrierAnnee, tableauTournoi } from '@/externe/tennisApiClient';
import {
  convertirTableauApi,
  estCircuitPrincipal,
  lireUrlTableauApi,
  PREFIXE_ID,
  probaSansMarge,
  reidentifier,
  type CoteTableau,
  type TournoiApi,
} from '@/lib/extract/matchstat';
import type { ExtraitBrut } from '@/lib/extract';
import type { Tour } from '@/lib/types';

/**
 * IMPORT DEPUIS L'API TENNIS — tout ce qui touche à la base.
 *
 *  1. le tableau est lu dans l'API (1 requête) et converti en extrait du
 *     bookmarklet (lib/extract/matchstat.ts, pur et testé) ;
 *  2. les identifiants de la source sont remplacés par ceux des joueurs déjà
 *     en base : correspondance mémorisée (tn_player_source_ids, 0027), sinon
 *     rapprochement par nom (une seule fois), sinon nouveau joueur ;
 *  3. l'extrait passe par EXACTEMENT le même chemin qu'un collage :
 *     importerExtraitCoeur (bouton) ou importerPourSurveillance (cron) ;
 *  4. les cotes avant-match du tableau sont archivées (tn_odds +
 *     tn_odds_historique), sans requête de plus.
 *
 * Appelants : Server Action de /import (session vérifiée) et passage du cron
 * (jeton vérifié). Ce module ne vérifie AUCUN accès lui-même.
 */

const SOURCE = 'matchstat';
const SPORT_KEY = 'matchstat';

export function cleApi(): string {
  return process.env.RAPIDAPI_KEY ?? '';
}

export function apiConfiguree(): boolean {
  return Boolean(process.env.RAPIDAPI_KEY);
}

/* -------------------------------------------------------------------------- */
/*  Calendrier : tournois importables                                          */
/* -------------------------------------------------------------------------- */

export interface TournoiImportable {
  seasonId: number;
  nom: string;
  type: 'atp' | 'wta';
  tour: Tour;
  annee: number;
  startDate: string;
  surface: string | null;
  categorie: string | null;
  /** Déjà en base (importé depuis l'API) : id du tournoi et état de la surveillance. */
  enBase: { tournamentId: string; nom: string; surveille: boolean; actif: boolean } | null;
}

const JOUR = 24 * 60 * 60 * 1000;
/** Le calendrier d'une saison ne bouge presque pas : 1 lecture par circuit et par jour. */
const CACHE_CALENDRIER_S = 24 * 60 * 60;

/**
 * Tournois du circuit principal qui commencent entre il y a 10 jours et dans
 * 9 jours (les tableaux sortent avant le lundi, et un Masters dure deux
 * semaines). Lecture du calendrier mise en cache 24 h par Next.
 */
export async function tournoisImportables(maintenant = new Date()): Promise<TournoiImportable[]> {
  const debut = new Date(maintenant.getTime() - 10 * JOUR).toISOString().slice(0, 10);
  const fin = new Date(maintenant.getTime() + 9 * JOUR).toISOString().slice(0, 10);
  const annees = [...new Set([Number(debut.slice(0, 4)), Number(fin.slice(0, 4))])];

  const lus: TournoiImportable[] = [];
  for (const type of ['atp', 'wta'] as const) {
    for (const annee of annees) {
      const { donnees } = await calendrierAnnee(cleApi(), type, annee, {
        next: { revalidate: CACHE_CALENDRIER_S, tags: ['api-tennis-calendrier'] },
      });
      const liste: TournoiApi[] = Array.isArray(donnees) ? donnees : (donnees.data ?? []);
      for (const t of liste) {
        const date = String(t.startDate ?? t.date ?? '').slice(0, 10);
        if (!date || date < debut || date > fin) continue;
        if (!estCircuitPrincipal({ ...t, tour: type })) continue;
        lus.push({
          seasonId: t.id,
          nom: t.name,
          type,
          tour: type === 'wta' ? 'WTA' : 'ATP',
          annee: Number(date.slice(0, 4)),
          startDate: date,
          surface: t.court?.name ?? null,
          categorie: (t as { tier?: string }).tier ?? null,
          enBase: null,
        });
      }
    }
  }
  if (lus.length === 0) return [];

  const sb = supabaseAdmin();
  const { data: tournois, error } = await sb
    .from('tn_tournaments')
    .select('id, name, external_id, tour, year')
    .in('external_id', lus.map((t) => `${PREFIXE_ID}${t.seasonId}`));
  if (error) throw new Error(`Tournois : ${error.message}`);
  const ids = (tournois ?? []).map((t) => t.id as string);
  const { data: surv, error: eS } = ids.length
    ? await sb.from('tn_import_auto').select('tournament_id, actif').in('tournament_id', ids)
    : { data: [], error: null };
  if (eS) throw new Error(`Surveillance : ${eS.message}`);
  const actifs = new Map((surv ?? []).map((s) => [s.tournament_id as string, s.actif as boolean]));

  for (const t of lus) {
    const b = (tournois ?? []).find((x) => x.external_id === `${PREFIXE_ID}${t.seasonId}` && x.tour === t.tour && x.year === t.annee);
    if (b) t.enBase = { tournamentId: b.id, nom: b.name, surveille: actifs.has(b.id), actif: actifs.get(b.id) ?? false };
  }
  return lus.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.tour.localeCompare(b.tour) || a.nom.localeCompare(b.nom));
}

/* -------------------------------------------------------------------------- */
/*  Préparation d'un extrait                                                   */
/* -------------------------------------------------------------------------- */

export interface ParametresApi {
  type: 'atp' | 'wta';
  nom: string;
  annee: number;
  seasonId: number | string;
  startDate?: string | null;
}

interface Preparation {
  brut: ExtraitBrut;
  cotes: CoteTableau[];
  avertissements: string[];
  /** ID de la source (sans préfixe) → ID retenu, pour mémoriser la correspondance après import. */
  correspondances: { sourceId: string; playerId: string; nomSource: string }[];
}

/** Lit le tableau dans l'API et le prépare pour l'import (aucune écriture). */
export async function preparerDepuisApi(p: ParametresApi): Promise<Preparation> {
  const { donnees } = await tableauTournoi(cleApi(), p.type, p.nom, p.annee);
  if (!donnees?.singles?.length) {
    throw new Error(`Tableau de « ${p.nom} » ${p.annee} pas encore publié par l’API.`);
  }
  const conv = convertirTableauApi(donnees, p);
  const tour: Tour = conv.extrait.tour;
  const sb = supabaseAdmin();

  const [{ data: memo, error: eM }, { data: joueurs, error: eJ }] = await Promise.all([
    sb.from('tn_player_source_ids').select('source_id, player_id').eq('source', SOURCE).eq('tour', tour),
    sb.from('tn_players').select('id, name, country').eq('tour', tour),
  ]);
  if (eM) throw new Error(`Correspondances : ${eM.message}`);
  if (eJ) throw new Error(`Joueurs : ${eJ.message}`);
  const memoire = new Map((memo ?? []).map((m) => [m.source_id as string, m.player_id as string]));

  // Ordre haut/bas stable d'un import à l'autre : celui déjà en base prime
  // (un 1er tour joué arrive « vainqueur en tête » dans la source).
  const { data: tournoi } = await sb
    .from('tn_tournaments')
    .select('id')
    .eq('external_id', conv.extrait.tournament.atp_id)
    .eq('tour', tour)
    .eq('year', conv.extrait.tournament.year)
    .maybeSingle();
  const enBase = new Map<string, [string | null, string | null]>();
  if (tournoi) {
    const { data: lignes, error } = await sb
      .from('tn_matches')
      .select('round, position, player1_id, player2_id')
      .eq('tournament_id', tournoi.id);
    if (error) throw new Error(`Matchs en base : ${error.message}`);
    for (const l of lignes ?? []) enBase.set(`${l.round}#${l.position}`, [l.player1_id, l.player2_id]);
  }

  const r = reidentifier(conv, (joueurs ?? []) as { id: string; name: string; country: string | null }[], memoire, enBase);
  return { brut: r.extrait, cotes: r.cotes, avertissements: r.avertissements, correspondances: r.correspondances };
}

/* -------------------------------------------------------------------------- */
/*  Après un import réussi : correspondances et cotes                          */
/* -------------------------------------------------------------------------- */

/**
 * Mémorise les correspondances (seulement vers des joueurs bien présents en
 * base) et archive les cotes avant-match. Ne lève jamais : renvoie des
 * avertissements, l'import lui-même est déjà écrit.
 */
export async function ecrireApresImport(
  tournamentId: string,
  tour: Tour,
  prep: Pick<Preparation, 'cotes' | 'correspondances'>,
  maintenant = new Date(),
): Promise<string[]> {
  const sb = supabaseAdmin();
  const av: string[] = [];

  try {
    const ids = [...new Set(prep.correspondances.map((c) => c.playerId))];
    const { data: presents, error } = ids.length
      ? await sb.from('tn_players').select('id').in('id', ids)
      : { data: [], error: null };
    if (error) throw new Error(error.message);
    const ok = new Set((presents ?? []).map((p) => p.id as string));
    const lignes = prep.correspondances
      .filter((c) => ok.has(c.playerId))
      .map((c) => ({ source: SOURCE, tour, source_id: c.sourceId, player_id: c.playerId, nom_source: c.nomSource }));
    if (lignes.length) {
      const { error: eU } = await sb.from('tn_player_source_ids').upsert(lignes, { onConflict: 'source,tour,source_id' });
      if (eU) throw new Error(eU.message);
    }
  } catch (e) {
    av.push(`Correspondances des joueurs non mémorisées : ${(e as Error).message}`);
  }

  try {
    const n = await archiverCotes(tournamentId, prep.cotes, maintenant);
    if (n > 0) av.push(`Cotes : ${n} match(s) à venir capturé(s) ou mis à jour.`);
  } catch (e) {
    av.push(`Cotes non archivées : ${(e as Error).message}`);
  }
  return av;
}

/**
 * Cotes AVANT-MATCH seulement (capturées avant le coup d'envoi annoncé) :
 * tn_odds garde la dernière photo, tn_odds_historique une ligne par
 * changement de cote. Renvoie le nombre de matchs écrits.
 */
async function archiverCotes(tournamentId: string, cotes: CoteTableau[], maintenant: Date): Promise<number> {
  const aVenir = cotes.filter((c) => new Date(c.commenceTime).getTime() > maintenant.getTime());
  if (aVenir.length === 0) return 0;
  const sb = supabaseAdmin();
  const { data: avant, error } = await sb
    .from('tn_odds')
    .select('event_id, cote_a, cote_b, player_a_id')
    .eq('tournament_id', tournamentId)
    .in('event_id', aVenir.map((c) => c.eventId));
  if (error) throw new Error(error.message);
  const precedent = new Map((avant ?? []).map((l) => [l.event_id as string, l]));

  const iso = maintenant.toISOString();
  const lignes = aVenir.map((c) => {
    const pa = probaSansMarge(c.coteA, c.coteB);
    return {
      tournament_id: tournamentId,
      event_id: c.eventId,
      sport_key: SPORT_KEY,
      commence_time: c.commenceTime,
      nom_a: c.nomA,
      nom_b: c.nomB,
      player_a_id: c.playerAId,
      player_b_id: c.playerBId,
      proba_a: pa,
      proba_b: 1 - pa,
      bookmakers: 1,
      cote_a: c.coteA,
      cote_b: c.coteB,
      recupere_le: iso,
    };
  });
  const changees = lignes.filter((l) => {
    const p = precedent.get(l.event_id);
    if (!p) return true;
    const memeSens = p.player_a_id === l.player_a_id;
    const [a, b] = memeSens ? [p.cote_a, p.cote_b] : [p.cote_b, p.cote_a];
    return Number(a) !== l.cote_a || Number(b) !== l.cote_b;
  });
  if (changees.length === 0) return 0;

  const { error: eU } = await sb.from('tn_odds').upsert(changees, { onConflict: 'tournament_id,event_id' });
  if (eU) throw new Error(`tn_odds : ${eU.message}`);
  // tn_odds_historique n'a pas de sport_key ; la date de capture s'appelle capture_le.
  const { error: eH } = await sb.from('tn_odds_historique').insert(
    changees.map((l) => ({
      tournament_id: l.tournament_id,
      event_id: l.event_id,
      commence_time: l.commence_time,
      nom_a: l.nom_a,
      nom_b: l.nom_b,
      player_a_id: l.player_a_id,
      player_b_id: l.player_b_id,
      proba_a: l.proba_a,
      proba_b: l.proba_b,
      bookmakers: l.bookmakers,
      cote_a: l.cote_a,
      cote_b: l.cote_b,
      capture_le: l.recupere_le,
    })),
  );
  if (eH) throw new Error(`tn_odds_historique : ${eH.message}`);
  return changees.length;
}

/* -------------------------------------------------------------------------- */
/*  Points d'entrée                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Un tableau déjà importé par le bookmarklet (même slug, circuit et année,
 * mais identifiant du site officiel) ne doit pas être doublé par un import
 * API : deux lignes de tournoi, deux jeux de picks. On refuse plutôt.
 */
async function tournoiBookmarkletExistant(brut: ExtraitBrut): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from('tn_tournaments')
    .select('name, external_id')
    .eq('slug', brut.tournament.slug ?? '')
    .eq('tour', brut.tour)
    .eq('year', brut.tournament.year);
  if (error) throw new Error(`Tournois : ${error.message}`);
  const autre = (data ?? []).find((t) => !String(t.external_id ?? '').startsWith(PREFIXE_ID));
  return autre ? (autre.name as string) : null;
}

/**
 * Import depuis l'écran /import (bouton) : même suite qu'un collage — import,
 * journal « manuel », inscription à la surveillance (mode 'api') — puis
 * correspondances et cotes. L'appelant a vérifié la session.
 */
export async function importerDepuisApi(p: ParametresApi): Promise<ImportResult> {
  const debut = Date.now();
  let prep: Preparation;
  try {
    prep = await preparerDepuisApi(p);
    const doublon = await tournoiBookmarkletExistant(prep.brut);
    if (doublon) {
      return {
        ok: false,
        error: `« ${doublon} » est déjà en base, importé par le bookmarklet : continuer avec lui (ou le supprimer) plutôt que d’en créer un second.`,
        avertissements: [],
      };
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message, avertissements: [] };
  }

  const json = JSON.stringify(prep.brut);
  const r = await importerExtraitCoeur(json);
  r.avertissements.unshift(...prep.avertissements);
  const suivi = await noterImportManuel(json, r, Date.now() - debut);
  if (suivi) r.avertissements.push(suivi);
  if (r.ok && r.tournamentId) r.avertissements.push(...(await ecrireApresImport(r.tournamentId, prep.brut.tour, prep)));
  return r;
}

/** Paramètres de requête d'un tournoi surveillé en mode 'api' (URL source + identifiant externe). */
export async function parametresDeSurveillance(tournamentId: string, sourceUrl: string): Promise<ParametresApi> {
  const u = lireUrlTableauApi(sourceUrl);
  if (!u) throw new Error('URL source qui n’est pas une URL de l’API tennis : refusée.');
  const { data, error } = await supabaseAdmin()
    .from('tn_tournaments')
    .select('external_id, start_date')
    .eq('id', tournamentId)
    .maybeSingle();
  if (error) throw new Error(`Tournoi : ${error.message}`);
  const ext = String(data?.external_id ?? '');
  if (!ext.startsWith(PREFIXE_ID)) throw new Error('Tournoi sans identifiant de l’API tennis.');
  return { ...u, seasonId: ext.slice(PREFIXE_ID.length), startDate: data?.start_date ?? null };
}

