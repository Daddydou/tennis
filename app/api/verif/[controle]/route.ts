import type { NextRequest } from 'next/server';
import { ENTETE_VERIF, verifierJetonVerif } from '@/auth/session';
import { trouverControle } from '@/db/verif';

export const dynamic = 'force-dynamic';

const SANS_CACHE = { 'Cache-Control': 'no-store' };

/** Réponse unique pour « pas de jeton », « mauvais jeton » et « contrôle inconnu ». */
function introuvable() {
  return Response.json({ ok: false }, { status: 404, headers: SANS_CACHE });
}

/**
 * GET /api/verif/<controle>[?tournoi=<uuid>]
 *
 * Point de contrôle de PRODUCTION, en LECTURE SEULE, pour vérifier la prod
 * sans cookie de session ni AUTH_SECRET. Accès : en-tête `x-verif-token`
 * égal à `VERIF_TOKEN` (comparaison à temps constant, cf. auth/session.ts).
 *
 * - `VERIF_TOKEN` absent, jeton absent ou faux, contrôle inconnu : 404, même
 *   corps — la route ne révèle pas son existence.
 * - Seule une liste FIXE de contrôles nommés est servie (db/verif.ts) ; aucune
 *   requête générique, aucune écriture.
 * - Seul GET est exporté : Next répond 405 aux autres méthodes (et le proxy,
 *   qui ne laisse passer que GET, répond 401 avant).
 *
 * N'accepte PAS la session de l'app : un seul mode d'accès, facile à révoquer.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ controle: string }> }) {
  if (!verifierJetonVerif(req.headers.get(ENTETE_VERIF))) return introuvable();

  const { controle } = await ctx.params;
  const executer = trouverControle(controle);
  if (!executer) return introuvable();

  try {
    const { statut, corps } = await executer(req.nextUrl.searchParams);
    return Response.json(corps, { status: statut, headers: SANS_CACHE });
  } catch (e) {
    console.error(`Contrôle ${controle} :`, (e as Error).message);
    return Response.json(
      { ok: false, error: 'Erreur interne.' },
      { status: 500, headers: SANS_CACHE },
    );
  }
}
