import 'server-only';
import { parseHTML } from 'linkedom';
import { supabaseAdmin } from './server';
import { construireMatchPayload, compterMatchsChanges, importerExtraitCoeur } from './importCoeur';
import {
  calculerArret,
  echecsAutoRecents,
  empreinte,
  evaluerEtArreter,
  journaliser,
  listerSurveillances,
  lireSurveillance,
  noterEchec,
  noterSucces,
  type LigneImportAuto,
} from './importAuto';
import { controlerExtrait, extractWta, type ExtraitBrut } from '@/lib/extract';
import { parseExtract } from '@/lib/parser';
import {
  enPauseApresEchec,
  estDu,
  identiteCorrespond,
  urlSourceAutorisee,
  type MotifArret,
} from '@/lib/importAutoRegles';
import type { DrawExtract } from '@/lib/types';
import { ecrireApresImport, parametresDeSurveillance, preparerDepuisApi } from './importApi';
import { mettreAJourEloMaison } from './eloMaison';

/**
 * IMPORT AUTOMATIQUE — les deux chemins d'entrée :
 *  - `ingerer`  : extraction envoyée par le userscript (POST /ingest) ;
 *  - `passage`  : le cron récupère lui-même les pages WTA (POST /run).
 *
 * Tous deux finissent dans `importerExtraitCoeur`, exactement comme l'import
 * manuel. La synchro du bracket de Thomas n'est JAMAIS déclenchée ici (elle
 * reste manuelle : npm run sync:bracket-thomas).
 */

export type StatutTournoi = 'importe' | 'inchange' | 'erreur' | 'arrete' | 'ignore';

export interface ResultatTournoi {
  tournament_id: string;
  statut: StatutTournoi;
  detail?: string;
  matchs_total?: number;
  matchs_changes?: number;
  avertissements?: string[];
  arret?: MotifArret | null;
  /** Mode à blanc : diagnostic de la récupération. */
  diagnostic?: DiagnosticPage;
}

export interface DiagnosticPage {
  url: string;
  statut_http: number;
  taille: number;
  lignes_joueuses: number;
  matchs_extraits: number;
  rounds: string[];
  matchs_en_base?: number;
  matchs_differents?: number;
  hash_identique?: boolean;
  tournoi_en_base?: string | null;
}

/** Tournoi en base visé par une extraction (même clé que l'import). */
async function tournoiDeLExtrait(e: DrawExtract) {
  const sb = supabaseAdmin();
  const base = sb.from('tn_tournaments').select('id, external_id, slug, tour, year').eq('tour', e.tour).eq('year', e.tournament.year);
  const { data, error } = e.tournament.externalId
    ? await base.eq('external_id', e.tournament.externalId).maybeSingle()
    : await base.eq('slug', e.tournament.slug ?? '').maybeSingle();
  if (error) throw new Error(`Tournoi : ${error.message}`);
  return data;
}

/**
 * Importe une extraction pour un tournoi SURVEILLÉ et actif, puis met à jour
 * la surveillance et le journal. Refuse (sans rien écrire en base de jeu) un
 * tournoi inconnu, non surveillé, arrêté, ou une extraction d'un autre tournoi.
 */
export async function importerPourSurveillance(
  brut: unknown,
  source: 'serveur' | 'navigateur',
  tournamentIdAnnonce: string | null,
): Promise<ResultatTournoi> {
  const debut = Date.now();
  const controle = controlerExtrait(brut);
  if (!controle.ok) {
    if (tournamentIdAnnonce) await echouer(tournamentIdAnnonce, source, controle.erreur, debut);
    return { tournament_id: tournamentIdAnnonce ?? '', statut: 'erreur', detail: controle.erreur };
  }
  const extract = parseExtract(brut);
  const tournoi = await tournoiDeLExtrait(extract);
  if (!tournoi || (tournamentIdAnnonce && tournoi.id !== tournamentIdAnnonce) || !identiteCorrespond(extract, tournoi)) {
    const detail = 'Extraction d’un tournoi inconnu ou différent du tournoi annoncé : rien importé.';
    if (tournamentIdAnnonce) await echouer(tournamentIdAnnonce, source, detail, debut);
    return { tournament_id: tournamentIdAnnonce ?? tournoi?.id ?? '', statut: 'erreur', detail };
  }
  const id = tournoi.id as string;

  const arret = await evaluerEtArreter(id);
  const s = await lireSurveillance(id);
  if (!s) return { tournament_id: id, statut: 'erreur', detail: 'Tournoi non surveillé : faire d’abord un import manuel.' };
  if (!s.actif) return { tournament_id: id, statut: 'arrete', detail: `Surveillance arrêtée (${s.motif_arret}).`, arret: arret ?? s.motif_arret };

  const hash = empreinte(brut);
  if (s.dernier_hash === hash) {
    await noterSucces({ tournamentId: id, tour: extract.tour, sourceUrl: s.source_url, hash });
    await journaliser({
      tournament_id: id,
      source,
      ok: true,
      matchs_total: controle.matchs,
      matchs_changes: 0,
      avertissements: ['Tableau inchangé : rien réimporté ni recalculé.'],
      duree_ms: Date.now() - debut,
    });
    return { tournament_id: id, statut: 'inchange', matchs_total: controle.matchs, matchs_changes: 0 };
  }

  const r = await importerExtraitCoeur(JSON.stringify(brut));
  if (!r.ok) {
    await echouer(id, source, r.error ?? 'Échec de l’import.', debut, r.avertissements);
    return { tournament_id: id, statut: 'erreur', detail: r.error, avertissements: r.avertissements };
  }
  await journaliser({
    tournament_id: id,
    source,
    ok: true,
    matchs_total: r.resume?.matchs ?? null,
    matchs_changes: r.matchsChanges ?? null,
    avertissements: r.avertissements,
    duree_ms: Date.now() - debut,
  });
  // L'URL enregistrée reste celle de la surveillance : une extraction faite
  // depuis un autre onglet ne la déplace pas.
  const suivi = await noterSucces({ tournamentId: id, tour: extract.tour, sourceUrl: s.source_url, hash });
  return {
    tournament_id: id,
    statut: 'importe',
    matchs_total: r.resume?.matchs,
    matchs_changes: r.matchsChanges,
    avertissements: r.avertissements,
    arret: suivi.arret,
  };
}

async function echouer(id: string, source: 'serveur' | 'navigateur', erreur: string, debut: number, avertissements: string[] = []) {
  await noterEchec(id, erreur);
  await journaliser({ tournament_id: id, source, ok: false, erreur, avertissements, duree_ms: Date.now() - debut });
}

/** Échec signalé par le userscript (0 match extrait, page illisible…). */
export async function signalerEchecNavigateur(tournamentId: string, erreur: string): Promise<boolean> {
  const s = await lireSurveillance(tournamentId);
  if (!s) return false;
  await echouer(tournamentId, 'navigateur', `Userscript : ${erreur}`.slice(0, 500), Date.now());
  return true;
}

/* -------------------------------------------------------------------------- */
/*  Passage du cron (WTA, mode « serveur »)                                    */
/* -------------------------------------------------------------------------- */

const ENTETES_NAVIGATEUR = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
};
const DELAI_FETCH_MS = 25_000;

/** Récupère et lit une page de tableau WTA ; aucune écriture. */
async function lirePageWta(url: string): Promise<{ extrait: ExtraitBrut | null; diagnostic: DiagnosticPage }> {
  if (!urlSourceAutorisee(url, 'WTA')) throw new Error('URL hors de wtatennis.com : refusée.');
  const res = await fetch(url, {
    headers: ENTETES_NAVIGATEUR,
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(DELAI_FETCH_MS),
  });
  // Une redirection ne doit pas nous emmener hors du site officiel.
  if (res.url && !urlSourceAutorisee(res.url, 'WTA')) throw new Error(`Redirigé hors de wtatennis.com (${res.url}).`);
  const html = await res.text();
  const diagnostic: DiagnosticPage = {
    url,
    statut_http: res.status,
    taille: html.length,
    lignes_joueuses: 0,
    matchs_extraits: 0,
    rounds: [],
  };
  if (!res.ok) return { extrait: null, diagnostic };

  // linkedom, pas jsdom : jsdom ne se charge pas sur Vercel (une de ses
  // dépendances est un module ESM requis en CommonJS). linkedom n'exécute
  // aucun script ; même extraction que jsdom, vérifiée par les tests.
  const doc = parseHTML(html).document as unknown as Document;
  diagnostic.lignes_joueuses = doc.querySelectorAll('.js-player-row').length;
  const extrait = extractWta(doc, url);
  diagnostic.matchs_extraits = extrait?.match_count ?? 0;
  diagnostic.rounds = extrait?.rounds_found ?? [];
  return { extrait, diagnostic };
}

/** Comparaison à blanc avec la base : matchs en base, matchs qui changeraient. */
async function comparerAvecBase(extrait: ExtraitBrut, diag: DiagnosticPage, hashBase: string | null) {
  const extract = parseExtract(extrait);
  const tournoi = await tournoiDeLExtrait(extract);
  diag.tournoi_en_base = tournoi?.id ?? null;
  diag.hash_identique = hashBase !== null && hashBase === empreinte(extrait);
  if (!tournoi) return;
  const { data, error } = await supabaseAdmin()
    .from('tn_matches')
    .select('round, position, player1_id, player2_id, winner_id, sets, status')
    .eq('tournament_id', tournoi.id);
  if (error) throw new Error(`Matchs en base : ${error.message}`);
  diag.matchs_en_base = (data ?? []).length;
  diag.matchs_differents = compterMatchsChanges(data ?? [], construireMatchPayload(extract, tournoi.id, extract.roundsFound));
}

export interface RapportPassage {
  ok: boolean;
  dry: boolean;
  erreurs: number;
  resultats: ResultatTournoi[];
}

/**
 * POST /api/import-auto/run. Pour chaque tournoi actif : arrêt éventuel ;
 * puis, pour chaque tournoi WTA en mode « serveur », dû et pas en pause
 * après échec : récupération, extraction, import si le tableau a changé.
 * Une erreur sur un tournoi n'arrête pas les autres.
 *
 * `dry` : récupération + extraction + comparaison avec la base, ZÉRO
 * écriture (ni import, ni journal, ni surveillance). `urlTest` (à blanc
 * seulement) : diagnostique une page WTA précise, surveillée ou non.
 */
export async function passage({ dry, urlTest }: { dry: boolean; urlTest?: string | null }): Promise<RapportPassage> {
  const maintenant = new Date();
  const resultats: ResultatTournoi[] = [];

  if (dry && urlTest) {
    try {
      const { extrait, diagnostic } = await lirePageWta(urlTest);
      if (extrait) await comparerAvecBase(extrait, diagnostic, null);
      resultats.push({
        tournament_id: diagnostic.tournoi_en_base ?? '',
        statut: extrait && extrait.match_count > 0 ? 'ignore' : 'erreur',
        detail: extrait ? 'Diagnostic à blanc (aucune écriture).' : 'Aucun tableau extrait.',
        diagnostic,
      });
    } catch (e) {
      resultats.push({ tournament_id: '', statut: 'erreur', detail: (e as Error).message });
    }
    return rapport(dry, resultats);
  }

  const [surveillances, echecs] = await Promise.all([listerSurveillances(), echecsAutoRecents(maintenant)]);
  for (const s of surveillances.filter((x) => x.actif)) {
    try {
      resultats.push(await passageTournoi(s, dry, maintenant, echecs.get(s.tournament_id) ?? null));
    } catch (e) {
      const detail = (e as Error).message;
      if (!dry) await echouer(s.tournament_id, 'serveur', detail, maintenant.getTime());
      resultats.push({ tournament_id: s.tournament_id, statut: 'erreur', detail });
    }
  }

  // Elo maison : résultats de la veille (tous niveaux), APRÈS les tableaux pour qu'un quota
  // serré serve d'abord aux tournois suivis. Une fois par jour en pratique : les passages
  // suivants trouvent le suivi à jour et ne font aucune requête.
  if (!dry) {
    try {
      for (const r of await mettreAJourEloMaison(6, maintenant)) {
        if (r.statut === 'non_amorce') continue;
        resultats.push({
          tournament_id: `elo-maison-${r.tour}`,
          statut: r.statut === 'mis_a_jour' || r.statut === 'partiel' ? 'importe' : 'ignore',
          detail:
            r.statut === 'en_retard'
              ? `Elo maison ${r.tour.toUpperCase()} : plus de 10 jours de retard (dernier jour ${r.jusquau}), à ré-amorcer.`
              : `Elo maison ${r.tour.toUpperCase()} : ${r.jours} jour(s), ${r.matchs} match(s), ${r.nouveaux} nouveau(x) joueur(s), ${r.requetes} requête(s), à jour au ${r.jusquau}.`,
        });
      }
    } catch (e) {
      resultats.push({ tournament_id: 'elo-maison', statut: 'erreur', detail: `Elo maison : ${(e as Error).message}` });
    }
  }
  return rapport(dry, resultats);
}

async function passageTournoi(
  s: LigneImportAuto,
  dry: boolean,
  maintenant: Date,
  dernierEchec: string | null,
): Promise<ResultatTournoi> {
  const id = s.tournament_id;
  const motif = await calculerArret(s, maintenant);
  if (motif) {
    if (!dry) await evaluerEtArreter(id, maintenant);
    return { tournament_id: id, statut: 'arrete', arret: motif, detail: dry ? 'Serait arrêté (à blanc).' : undefined };
  }
  if (s.mode === 'api') return passageApi(s, dry, maintenant, dernierEchec);
  if (s.tour !== 'WTA' || s.mode !== 'serveur') return { tournament_id: id, statut: 'ignore', detail: `Mode ${s.mode} (${s.tour}) : userscript.` };
  if (!estDu(s, maintenant)) return { tournament_id: id, statut: 'ignore', detail: 'Pas encore dû.' };
  if (enPauseApresEchec(dernierEchec, maintenant)) return { tournament_id: id, statut: 'ignore', detail: 'Échec il y a moins d’une heure : pas de relance.' };

  const debut = Date.now();
  const { extrait, diagnostic } = await lirePageWta(s.source_url);
  if (dry) {
    if (extrait) await comparerAvecBase(extrait, diagnostic, s.dernier_hash);
    return {
      tournament_id: id,
      statut: extrait && extrait.match_count > 0 ? 'ignore' : 'erreur',
      detail: 'À blanc : aucune écriture.',
      diagnostic,
    };
  }
  if (diagnostic.statut_http !== 200) {
    const detail = `HTTP ${diagnostic.statut_http} sur ${s.source_url}`;
    await echouer(id, 'serveur', detail, debut);
    return { tournament_id: id, statut: 'erreur', detail, diagnostic };
  }
  if (!extrait || extrait.match_count === 0) {
    const detail = `Aucun match extrait (${diagnostic.lignes_joueuses} lignes .js-player-row, ${diagnostic.taille} octets).`;
    await echouer(id, 'serveur', detail, debut);
    return { tournament_id: id, statut: 'erreur', detail, diagnostic };
  }
  return importerPourSurveillance(extrait, 'serveur', id);
}

/**
 * Mode 'api' (ATP et WTA) : 1 requête à l'API tennis par tournoi dû, puis
 * le même chemin que le userscript (importerPourSurveillance : contrôle
 * d'identité, tableau inchangé, import, surveillance). Correspondances des
 * joueurs et cotes avant-match ensuite. Une erreur remonte à `passage`, qui
 * la journalise comme les autres.
 */
async function passageApi(
  s: LigneImportAuto,
  dry: boolean,
  maintenant: Date,
  dernierEchec: string | null,
): Promise<ResultatTournoi> {
  const id = s.tournament_id;
  if (!estDu(s, maintenant)) return { tournament_id: id, statut: 'ignore', detail: 'Pas encore dû.' };
  if (enPauseApresEchec(dernierEchec, maintenant)) return { tournament_id: id, statut: 'ignore', detail: 'Échec il y a moins d’une heure : pas de relance.' };

  const prep = await preparerDepuisApi(await parametresDeSurveillance(id, s.source_url));
  if (dry) {
    const diagnostic: DiagnosticPage = {
      url: s.source_url,
      statut_http: 200,
      taille: JSON.stringify(prep.brut).length,
      lignes_joueuses: 0,
      matchs_extraits: prep.brut.match_count,
      rounds: prep.brut.rounds_found,
    };
    await comparerAvecBase(prep.brut, diagnostic, s.dernier_hash);
    return { tournament_id: id, statut: 'ignore', detail: 'À blanc : aucune écriture (1 requête API utilisée).', diagnostic };
  }
  const r = await importerPourSurveillance(prep.brut, 'serveur', id);
  if (r.statut === 'importe' || r.statut === 'inchange') {
    const suite = await ecrireApresImport(id, s.tour, prep, maintenant);
    r.avertissements = [...prep.avertissements, ...(r.avertissements ?? []), ...suite];
  }
  return r;
}

function rapport(dry: boolean, resultats: ResultatTournoi[]): RapportPassage {
  const erreurs = resultats.filter((r) => r.statut === 'erreur').length;
  return { ok: erreurs === 0, dry, erreurs, resultats };
}
