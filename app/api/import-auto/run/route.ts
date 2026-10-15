import type { NextRequest } from 'next/server';
import { passage } from '@/db/importAutoFlux';
import { erreurInterne, introuvable, jetonValide, SANS_CACHE } from '../porte';

export const dynamic = 'force-dynamic';
// Plusieurs tournois à la suite, chacun : page WTA (~1,3 Mo) + import +
// préchauffage Monte Carlo. 300 s = plafond par défaut de Vercel.
export const maxDuration = 300;

/**
 * POST /api/import-auto/run — appelé par le workflow GitHub (06:00 et 18:00 UTC).
 *
 *   ?dry=1                    récupération + extraction + comparaison, ZÉRO écriture ;
 *   ?dry=1&source_url=<url>   idem sur une page wtatennis.com précise (diagnostic).
 *
 * Réponse { ok, dry, erreurs, resultats[] } ; `ok` faux dès qu'un tournoi est
 * en erreur (le workflow échoue alors, et GitHub envoie l'e-mail d'alerte).
 * Ne déclenche JAMAIS la synchro du bracket de Thomas.
 */
export async function POST(req: NextRequest) {
  if (!jetonValide(req)) return introuvable();
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const urlTest = req.nextUrl.searchParams.get('source_url');
  if (urlTest && !dry) {
    return Response.json({ ok: false, error: 'source_url seulement avec dry=1.' }, { status: 400, headers: SANS_CACHE });
  }
  try {
    const r = await passage({ dry, urlTest });
    return Response.json(r, { headers: SANS_CACHE });
  } catch (e) {
    return erreurInterne('run', e);
  }
}
