import { lireBracket, lireIds, lireTournois, type BracketThomas, type ResumeTournoiThomas } from '@/lib/thomasApi';

/**
 * CLIENT HTTP DE L'API BRACKET DE THOMAS — lecture seule, GET uniquement.
 *
 * Dossier `externe/` : ni moteur pur (lib/, sans réseau), ni accès base
 * (db/). Aucun import Next ni Supabase, et pas de `server-only` : le script
 * manuel scripts/sync-bracket-thomas.mts l'importe hors de Next.
 *
 * CLÉ : `THOMAS_API_KEY`, lue AU MOMENT de chaque appel (jamais mise en
 * cache dans le module), envoyée en `Authorization: Bearer`. Elle n'apparaît
 * dans AUCUN message d'erreur : on ne reprend ni les en-têtes, ni le corps de
 * la réponse, ni l'erreur d'origine de `fetch` (qui peut citer la requête).
 */

export const BASE_THOMAS = 'https://bowling-tracker-phi.vercel.app/api/v1/tennis';

/** Échec d'appel à l'API de Thomas. Message sûr à afficher : jamais de clé. */
export class ErreurApiThomas extends Error {
  // Propriété déclarée à part : le type stripping de Node (script hors Next)
  // refuse les propriétés de paramètre (`readonly statut` dans le constructeur).
  readonly statut: number | null;

  constructor(message: string, statut: number | null = null) {
    super(message);
    this.name = 'ErreurApiThomas';
    this.statut = statut;
  }
}

type Fetch = typeof fetch;

async function appeler(chemin: string, faireFetch: Fetch): Promise<unknown> {
  const cle = process.env.THOMAS_API_KEY;
  if (!cle) throw new ErreurApiThomas('THOMAS_API_KEY absente de l’environnement.');

  let res: Response;
  try {
    res = await faireFetch(`${BASE_THOMAS}${chemin}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cle}`, Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    throw new ErreurApiThomas(`API Thomas ${routeSeule(chemin)} : échec réseau.`);
  }

  if (!res.ok) {
    throw new ErreurApiThomas(`API Thomas ${routeSeule(chemin)} : HTTP ${res.status}.`, res.status);
  }
  try {
    return await res.json();
  } catch {
    throw new ErreurApiThomas(`API Thomas ${routeSeule(chemin)} : réponse non JSON.`, res.status);
  }
}

/** Chemin sans sa query string, pour les messages. */
function routeSeule(chemin: string): string {
  return chemin.split('?')[0];
}

/** GET /tournaments[?updatedSince=<ISO>]. */
export async function listerTournoisThomas(
  updatedSince?: string | null,
  faireFetch: Fetch = fetch,
): Promise<ResumeTournoiThomas[]> {
  const q = updatedSince ? `?updatedSince=${encodeURIComponent(updatedSince)}` : '';
  return lireTournois(await appeler(`/tournaments${q}`, faireFetch));
}

/** GET /brackets?tournoi=<id>. */
export async function bracketThomas(tournoiId: string, faireFetch: Fetch = fetch): Promise<BracketThomas> {
  return lireBracket(await appeler(`/brackets?tournoi=${encodeURIComponent(tournoiId)}`, faireFetch));
}

/** GET /ids. */
export async function idsThomas(faireFetch: Fetch = fetch): Promise<string[]> {
  return lireIds(await appeler('/ids', faireFetch));
}
