import type { NextRequest } from 'next/server';
import { etatSurveillances } from '@/db/importAuto';
import { erreurInterne, introuvable, jetonValide, SANS_CACHE } from '../porte';

export const dynamic = 'force-dynamic';

/**
 * GET /api/import-auto/etat — tournois surveillés ACTIFS :
 * { tournament_id, tour, source_url, mode, du, dernier_succes_at }.
 * `du` = actif ET (jamais importé OU dernier succès > 11 h 30) ET pas d'échec
 * automatique dans l'heure. Lecture seule. Lu par le userscript.
 */
export async function GET(req: NextRequest) {
  if (!jetonValide(req)) return introuvable();
  try {
    return Response.json({ ok: true, tournois: await etatSurveillances() }, { headers: SANS_CACHE });
  } catch (e) {
    return erreurInterne('etat', e);
  }
}
