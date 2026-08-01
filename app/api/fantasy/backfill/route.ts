import { sessionValide } from '@/auth/garde';
import { supabaseAnon } from '@/supabase/anon';
import { loadEngineData } from '@/supabase/queries';
import {
  enregistrerHistorique,
  equipeEvaluee,
  getFantasy,
} from '@/supabase/fantasy';

/**
 * POST /api/fantasy/backfill
 *
 * Remplit `tn_fantasy_historique` pour les tournois DÉJÀ en base.
 *
 * L'historique s'alimente à chaque import, mais les tournois importés avant
 * son existence n'ont pas de ligne — et ce sont eux qui portent le volume dont
 * dépend toute évaluation de calibration. On rejoue donc le calcul sur
 * l'existant : équipe optimale a priori, puis score réel de cette équipe sur
 * les résultats déjà en base. Rien n'est ajusté, on enregistre des couples.
 *
 * Traite en priorité ce qui manque ou ce qui a bougé :
 *   - pas de ligne          → à calculer ;
 *   - ligne « en cours »    → le tournoi a pu avancer depuis, à recalculer ;
 *   - ligne « terminé »     → définitive, on n'y touche plus.
 *
 * BORNÉ DANS LE TEMPS. Un tournoi sans projection en cache déclenche une
 * simulation Monte Carlo (jusqu'à ~30 s sur un tableau de 128) : tout traiter
 * d'un coup dépasserait le temps d'exécution d'une fonction. On s'arrête donc
 * à l'approche de la limite et on renvoie le reste à faire — rappeler la route
 * reprend là où elle s'est arrêtée. C'est aussi pour ça que la réponse porte
 * `restants` : c'est au bouton de dire s'il faut recliquer.
 */

/** Marge sous la limite d'exécution : on ne commence pas un tournoi après ça. */
const BUDGET_MS = 60_000;

export async function POST() {
  if (!(await sessionValide())) {
    return Response.json({ ok: false, error: 'Non authentifié.' }, { status: 401 });
  }

  const debut = Date.now();

  try {
    const sb = supabaseAnon();

    const [tournois, historique] = await Promise.all([
      sb
        .from('tn_tournaments')
        .select('id, name')
        .order('start_date', { ascending: false, nullsFirst: false }),
      sb.from('tn_fantasy_historique').select('tournament_id, termine'),
    ]);
    if (tournois.error) throw new Error(tournois.error.message);
    if (historique.error) throw new Error(historique.error.message);

    const definitifs = new Set(
      (historique.data ?? [])
        .filter((h) => h.termine)
        .map((h) => h.tournament_id as string),
    );

    const aFaire = (tournois.data ?? []).filter((t) => !definitifs.has(t.id));

    let traites = 0;
    let ignores = 0;
    let restants = 0;

    for (const t of aFaire) {
      if (Date.now() - debut > BUDGET_MS) {
        restants = aFaire.length - traites - ignores;
        break;
      }

      const engine = await loadEngineData(t.id);
      if (!engine || (engine.tournament.rounds ?? []).length === 0) {
        ignores++;
        continue;
      }

      const evaluation = equipeEvaluee(engine, await getFantasy(engine));

      // Une équipe dont aucun palier n'est pourvu n'apprend rien : l'enregistrer
      // ne ferait que diluer la synthèse.
      if (evaluation.eTotal <= 0) {
        ignores++;
        continue;
      }

      const r = await enregistrerHistorique(engine, evaluation);
      if (!r.ok) throw new Error(`${t.name} : ${r.error}`);
      traites++;
    }

    return Response.json({
      ok: true,
      traites,
      ignores,
      restants,
      definitifs: definitifs.size,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
