import { recalculerPoints } from '@/supabase/points';
import { sessionValide } from '@/auth/garde';

/**
 * POST /api/recompute
 * Body: { tournament_id: string }
 * Appelle la fonction Supabase tn_recompute_picks(tournament_id) qui recalcule
 * les points de chaque pick à partir des matchs.
 *
 * Écriture : session obligatoire. Le proxy filtre déjà /api/*, mais on ne s'en
 * remet pas à lui seul — c'est cette vérification qui fait foi.
 */
export async function POST(req: Request) {
  if (!(await sessionValide())) {
    return Response.json({ ok: false, error: 'Non authentifié.' }, { status: 401 });
  }

  let body: { tournament_id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Corps JSON invalide' }, { status: 400 });
  }

  const tournamentId = body.tournament_id;
  if (!tournamentId) {
    return Response.json(
      { ok: false, error: 'tournament_id requis' },
      { status: 400 },
    );
  }

  // Recalcul manuel : même chemin que les recalculs automatiques (import,
  // validation d'un pick). Le bouton n'est plus qu'un filet de sécurité.
  const r = await recalculerPoints(tournamentId);
  if (!r.ok) {
    return Response.json({ ok: false, error: r.error }, { status: 500 });
  }

  return Response.json({ ok: true, picksRecalcules: r.picks ?? 0 });
}
