import { sessionValide } from '@/auth/garde';
import { comparerEchelles } from '@/supabase/comparaison-echelle';

/**
 * POST /api/calibration/echelle
 *
 * Rejoue l'historique Fantasy sous plusieurs échelles Elo et renvoie, pour
 * chacune, l'écart prédit/réalisé global et par catégorie.
 *
 * Coûteux : une simulation Monte Carlo par tournoi ET par échelle. D'où le
 * déclenchement explicite (bouton) plutôt qu'un calcul au chargement de la
 * page, et le budget de temps côté module — la réponse porte `partiel` quand
 * il a coupé.
 *
 * ⚠ LECTURE SEULE. `ECHELLE_ELO` (lib/elo.ts) n'est jamais modifiée : la
 * décision reste humaine.
 */
export async function POST() {
  if (!(await sessionValide())) {
    return Response.json({ ok: false, error: 'Non authentifié.' }, { status: 401 });
  }

  try {
    return Response.json({ ok: true, comparaison: await comparerEchelles() });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
