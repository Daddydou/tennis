import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { rafraichirElos } from '@/supabase/elo-refresh';
import type { TourTa } from '@/lib/tennisabstract';

/**
 * POST /api/elo/refresh
 * Body (optionnel) : { tours?: ('atp'|'wta')[] }
 *
 * Récupère les rapports Elo hebdomadaires de Tennis Abstract et remplit
 * `ta_elo`. Ces Elo priment sur les Elo maison à la simulation (cf.
 * supabase/elo.ts).
 *
 * Écriture : session obligatoire, même garde que /api/recompute. Le proxy
 * filtre déjà /api/*, mais c'est cette vérification qui fait foi.
 */
export async function POST(req: Request) {
  if (!(await sessionValide())) {
    return Response.json({ ok: false, error: 'Non authentifié.' }, { status: 401 });
  }

  // Corps facultatif : un POST sans body rafraîchit les deux circuits.
  let tours: TourTa[] | undefined;
  try {
    const body = (await req.json()) as { tours?: TourTa[] };
    if (Array.isArray(body?.tours)) {
      tours = body.tours.filter((t): t is TourTa => t === 'atp' || t === 'wta');
    }
  } catch {
    tours = undefined;
  }

  const r = await rafraichirElos(tours?.length ? tours : undefined);
  if (!r.ok) {
    return Response.json({ ok: false, error: r.error }, { status: 502 });
  }

  // Les Elo changent les projections affichées : on invalide les pages qui
  // les lisent. Le cache tn_projections, lui, est recalculé au prochain
  // affichage d'un tour dont la simulation manque.
  revalidatePath('/', 'layout');

  return Response.json({ ok: true, tours: r.tours });
}
