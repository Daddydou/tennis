import { sessionValide } from '@/auth/garde';
import { calibrerElo } from '@/supabase/calibration';

/**
 * POST /api/calibration/elo
 *
 * Mesure la calibration de la courbe Elo → probabilité du moteur sur tous les
 * matchs terminés en base, et renvoie le constat en JSON (mêmes chiffres que
 * la page /calibration, pour un usage scripté).
 *
 * ⚠ LECTURE SEULE. Rien n'est écrit, et surtout rien n'est modifié dans
 * `lib/elo.ts` : la constante du moteur reste 400 tant qu'une décision humaine
 * n'en dispose pas autrement.
 *
 * Protégée comme les autres routes : le proxy filtre déjà /api/*, mais c'est
 * cette vérification qui fait foi (une route reste atteignable autrement).
 */
export async function POST() {
  if (!(await sessionValide())) {
    return Response.json({ ok: false, error: 'Non authentifié.' }, { status: 401 });
  }

  try {
    return Response.json({ ok: true, calibration: await calibrerElo() });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
