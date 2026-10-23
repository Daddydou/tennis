/**
 * CLIENT HTTP — API Tennis (Matchstat, abonnement RapidAPI).
 *
 * GET seulement, deux routes : le calendrier des tournois de la semaine et le
 * tableau d'un tournoi. La clé (RAPIDAPI_KEY) est passée par l'appelant, lue
 * dans l'environnement côté serveur ; elle n'apparaît jamais dans une erreur,
 * un journal ni une réponse.
 *
 * QUOTA. Plan Basic : 50 requêtes PAR JOUR, plafond strict (429 au-delà,
 * jusqu'au lendemain). Un tableau = 1 requête, résultats et cotes compris.
 * C'est pourquoi le calendrier est mis en cache par l'appelant et la mise à
 * jour automatique espacée (lib/importAutoRegles.ts).
 *
 * Sans Next ni Supabase : `init` laisse l'appelant ajouter ses options de
 * cache (`next: { revalidate }`).
 */

import { HOTE_API, type TableauApi, type TournoiApi } from '@/lib/extract/matchstat';

const DELAI_MS = 20_000;

export class ErreurApiTennis extends Error {
  constructor(
    message: string,
    readonly statut: number | null,
  ) {
    super(message);
    this.name = 'ErreurApiTennis';
  }
}

export interface ReponseApi<T> {
  donnees: T;
  /** Requêtes restantes sur le quota du jour (en-tête RapidAPI), si fourni. */
  quotaRestant: number | null;
}

/**
 * Dernier quota restant connu (en-tete x-ratelimit-requests-remaining de la derniere reponse),
 * partage par tout ce qui appelle l'API dans le meme processus : les tableaux et l'Elo maison
 * (db/eloMaison.ts) se partagent les 50 requetes du jour. `null` = inconnu. Le passage du cron
 * le remet a `null` en debut de passage (un processus Vercel chaud peut en servir plusieurs).
 */
export const quotaApi: { restant: number | null } = { restant: null };

async function appeler<T>(cle: string, chemin: string, init?: RequestInit & { next?: unknown }): Promise<ReponseApi<T>> {
  if (!cle) throw new ErreurApiTennis('RAPIDAPI_KEY absente : la clé se configure dans Vercel et .env.local.', null);
  let res: Response;
  try {
    res = await fetch(`https://${HOTE_API}${chemin}`, {
      ...init,
      headers: { 'X-RapidAPI-Key': cle, 'X-RapidAPI-Host': HOTE_API },
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch (e) {
    throw new ErreurApiTennis(`API tennis injoignable : ${(e as Error).message}`, null);
  }
  const restant = Number(res.headers.get('x-ratelimit-requests-remaining') ?? NaN);
  const quotaRestant = Number.isFinite(restant) ? restant : null;
  if (quotaRestant !== null) quotaApi.restant = quotaRestant;
  if (!res.ok) {
    const corps = (await res.text().catch(() => '')).slice(0, 200);
    const raison =
      res.status === 429
        ? 'quota du jour atteint (50 requêtes) — réessayer demain'
        : res.status === 401 || res.status === 403
          ? 'clé refusée ou route hors abonnement'
          : `HTTP ${res.status}`;
    throw new ErreurApiTennis(`API tennis : ${raison}. ${corps}`.trim(), res.status);
  }
  return { donnees: (await res.json()) as T, quotaRestant };
}

/** Tournois de la semaine en cours, tous niveaux (filtrer avec `estCircuitPrincipal`). */
export function calendrierActif(cle: string, init?: RequestInit & { next?: unknown }) {
  return appeler<{ data?: TournoiApi[] }>(cle, '/tennis/v2/calendar/active', init);
}

/**
 * Calendrier d'une saison pour un circuit (tous niveaux, ITF compris : à
 * filtrer). Préféré à `calendrierActif`, qui ne montre que la semaine en
 * cours : les tableaux sortent le vendredi ou le samedi, AVANT la semaine du
 * tournoi, et c'est là qu'on veut pouvoir les importer.
 */
export function calendrierAnnee(cle: string, type: 'atp' | 'wta', annee: number, init?: RequestInit & { next?: unknown }) {
  return appeler<TournoiApi[] | { data?: TournoiApi[] }>(cle, `/tennis/v2/${type}/tournament/calendar/${annee}`, init);
}

/** Tableau complet d'un tournoi (places d'attente « TBA » et exemptions comprises). */
export function tableauTournoi(cle: string, type: 'atp' | 'wta', nom: string, annee: number) {
  return appeler<TableauApi>(
    cle,
    `/tennis/v2/tournament/${type}/${encodeURIComponent(nom)}/${annee}/draws?fullBracket=true`,
    { cache: 'no-store' },
  );
}
