import { revalidatePath } from 'next/cache';
import { sessionValide } from '@/auth/garde';
import { loadEngineData } from '@/supabase/queries';
import { rafraichirCotes } from '@/supabase/cotes';

/**
 * POST /api/cotes/refresh
 * Body : { tournament_id: string, sport_key: string }
 *
 * SEUL endroit de l'app qui consomme le quota The Odds API (1 crédit par
 * appel : un marché, une région). Volontairement manuel — un rafraîchissement
 * automatique épuiserait les 500 requêtes mensuelles du palier gratuit sans
 * que personne ne regarde le résultat.
 *
 * Écriture : session obligatoire, même garde que les autres routes. La clé
 * d'API vit dans l'environnement (`ODDS_API_KEY`), jamais dans le code ni dans
 * la réponse.
 */
export async function POST(req: Request) {
  if (!(await sessionValide())) {
    return Response.json({ ok: false, error: 'Non authentifié.' }, { status: 401 });
  }

  let body: { tournament_id?: string; sport_key?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const { tournament_id: tournamentId, sport_key: sportKey } = body;
  if (!tournamentId || !sportKey) {
    return Response.json(
      { ok: false, error: 'tournament_id et sport_key sont requis.' },
      { status: 400 },
    );
  }

  const engine = await loadEngineData(tournamentId);
  if (!engine) {
    return Response.json({ ok: false, error: 'Tournoi introuvable.' }, { status: 404 });
  }

  // Le rapprochement se fait contre les joueurs DU TABLEAU : une rencontre
  // renvoyée par l'API qui n'y figure pas est signalée, pas devinée.
  const r = await rafraichirCotes(
    tournamentId,
    sportKey,
    engine.playerRows.map((p) => ({ id: p.id, name: p.name })),
  );
  if (!r.ok) return Response.json(r, { status: 502 });

  revalidatePath('/calibration/cotes');
  return Response.json(r);
}
