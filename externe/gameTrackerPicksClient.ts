import {
  lireEtatGT,
  lireReponsePostGT,
  lireTournoisPicksGT,
  type EtatGT,
  type ReponsePostGT,
  type TournoiPicksGT,
} from '@/lib/gameTrackerPicks';

/**
 * CLIENT HTTP DE L'API « PICKS TENNIS » DE GAME TRACKER — lecture ET écriture.
 *
 * ⚠ Contrairement à externe/thomasClient.ts (GET seulement), celui-ci peut
 * ÉCRIRE chez Game Tracker : un seul POST, sur /picks, pour poser le pick du
 * tour ouvert au nom du joueur de la clé. Choix assumé (cf. CLAUDE.md,
 * « Game Tracker : picks ») : il n'est appelé que par une Server Action
 * protégée par la session, déclenchée par un bouton MANUEL.
 *
 * Dossier `externe/` : aucun import Next ni Supabase.
 *
 * CLÉ : `GAMETRACKER_PICKS_KEY` (droit write:tennis-picks), lue AU MOMENT de
 * chaque appel, envoyée en `Authorization: Bearer`. Elle n'apparaît dans AUCUN
 * message d'erreur : ni les en-têtes, ni l'erreur d'origine de `fetch` ne sont
 * repris ; le texte d'un refus de Game Tracker est repris SANS la clé si
 * jamais il la citait.
 */

export const BASE_GT_PICKS = 'https://bowling-tracker-phi.vercel.app/api/v1/tennis/picks';

const DELAI_MS = 15_000;

/** Échec d'appel à Game Tracker. Message sûr à afficher : jamais de clé. */
export class ErreurApiGT extends Error {
  // Propriétés déclarées à part (type stripping de Node, cf. thomasClient).
  readonly statut: number | null;
  /** Secondes à attendre avant de réessayer (HTTP 429, en-tête Retry-After). */
  readonly retryApres: number | null;

  constructor(message: string, statut: number | null = null, retryApres: number | null = null) {
    super(message);
    this.name = 'ErreurApiGT';
    this.statut = statut;
    this.retryApres = retryApres;
  }
}

type Fetch = typeof fetch;

/** Sens des codes d'erreur communs, d'après la doc de l'API. */
function messageStatut(statut: number): string {
  if (statut === 401) return 'clé absente, invalide, révoquée ou expirée.';
  if (statut === 403)
    return 'accès refusé : la clé ne permet pas de poser des picks tennis, ou tu n’es pas inscrit à ce tournoi.';
  if (statut === 429) return 'trop de requêtes (60 par minute).';
  if (statut >= 500) return 'erreur côté Game Tracker, réessaie plus tard.';
  return `HTTP ${statut}.`;
}

/** Texte venu de Game Tracker, borné et sans la clé si elle y figurait. */
function texteSur(t: string, cle: string): string {
  const net = cle ? t.split(cle).join('***') : t;
  return net.length > 300 ? `${net.slice(0, 300)}…` : net;
}

/** Chemin sans sa query string, pour les messages. */
function routeSeule(chemin: string): string {
  return chemin.split('?')[0] || '/';
}

function lireCle(): string {
  const cle = process.env.GAMETRACKER_PICKS_KEY;
  if (!cle) throw new ErreurApiGT('GAMETRACKER_PICKS_KEY absente de l’environnement.');
  return cle;
}

async function appeler(
  chemin: string,
  init: { method: 'GET' } | { method: 'POST'; corps: unknown },
  faireFetch: Fetch,
): Promise<{ statut: number; json: unknown }> {
  const cle = lireCle();
  const ou = `Game Tracker ${init.method} ${routeSeule(chemin)}`;

  let res: Response;
  try {
    res = await faireFetch(`${BASE_GT_PICKS}${chemin}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${cle}`,
        Accept: 'application/json',
        ...(init.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init.method === 'POST' ? { body: JSON.stringify(init.corps) } : {}),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch {
    // L'erreur d'origine peut citer la requête (donc la clé) : on ne la reprend pas.
    throw new ErreurApiGT(`${ou} : échec réseau.`);
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    // Un refus de règle (POST) porte `enregistre: false` + `erreur` : on le rend
    // à l'appelant, qui doit afficher la raison. Tout le reste est une panne.
    const estRefusDeRegle =
      init.method === 'POST' &&
      typeof json === 'object' &&
      json !== null &&
      (json as Record<string, unknown>).enregistre === false;
    if (estRefusDeRegle) return { statut: res.status, json };

    // Le texte donné par Game Tracker (ex. « Tu n'es pas inscrit à ce tournoi »,
    // 403) est plus précis que notre message générique : on l'ajoute.
    const o = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
    const detail = typeof o.erreur === 'string' ? o.erreur : typeof o.error === 'string' ? o.error : '';
    const precision = detail ? ` « ${texteSur(detail, cle)} »` : '';

    const retry = Number(res.headers.get('Retry-After'));
    throw new ErreurApiGT(
      `${ou} : ${messageStatut(res.status)}${precision}`,
      res.status,
      res.status === 429 && Number.isFinite(retry) && retry > 0 ? retry : null,
    );
  }
  if (json === null) throw new ErreurApiGT(`${ou} : réponse non JSON.`, res.status);
  return { statut: res.status, json };
}

/** GET /picks/tournois : les tournois où l'on peut piquer. */
export async function listerTournoisPicks(faireFetch: Fetch = fetch): Promise<TournoiPicksGT[]> {
  return lireTournoisPicksGT((await appeler('/tournois', { method: 'GET' }, faireFetch)).json);
}

/** GET /picks?tournoi=<id> : pool, pick actuel, tours verrouillés, classement. */
export async function etatPicksGT(tournoiId: string, faireFetch: Fetch = fetch): Promise<EtatGT> {
  return lireEtatGT((await appeler(`?tournoi=${encodeURIComponent(tournoiId)}`, { method: 'GET' }, faireFetch)).json);
}

/**
 * POST /picks : pose, remplace ou vide le pick d'un tour pas encore verrouillé
 * (le tour ouvert, ou un tour à venir : picks à l'avance).
 * `haut` et `bas` sont OBLIGATOIRES (position, ou null pour vider ce côté) :
 * l'envoi remplace le pick du tour en entier.
 *
 * Un refus de règle (tour verrouillé, joueur hors pool…) n'est PAS une
 * exception : la réponse porte `enregistre: false` et `erreur`.
 */
export async function poserPicksGT(
  tournoiId: string,
  tour: number,
  haut: number | null,
  bas: number | null,
  faireFetch: Fetch = fetch,
): Promise<ReponsePostGT & { statut: number }> {
  const { statut, json } = await appeler(
    '',
    { method: 'POST', corps: { tournoi: tournoiId, tour, haut, bas } },
    faireFetch,
  );
  const r = lireReponsePostGT(json);
  const cle = process.env.GAMETRACKER_PICKS_KEY ?? '';
  return { ...r, erreur: r.erreur === null ? null : texteSur(r.erreur, cle), statut };
}
