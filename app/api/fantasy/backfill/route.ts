import { sessionValide } from '@/auth/garde';
import { supabaseAnon } from '@/supabase/anon';
import { loadEngineData } from '@/supabase/queries';
import { creerLecteurEloAnterieur } from '@/supabase/elo-historique';
import { evaluerFantasyAnterieur } from '@/supabase/fantasy-anterieur';
import {
  enregistrerAnterieur,
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
 * DEUX VOLETS PAR TOURNOI :
 *   - COURANT — l'équipe reconstituée avec les Elo d'aujourd'hui, qui ont
 *     déjà intégré les résultats du tournoi. C'est le calcul historique, celui
 *     que l'import écrit aussi ;
 *   - PROPRE — la même équipe recomposée sur le dernier relevé Elo antérieur
 *     au tirage (cf. supabase/fantasy-anterieur.ts). C'est celui dont la
 *     comparaison prédit/réalisé a un sens, et il n'existe que si l'archive
 *     contient un relevé plus ancien que le tournoi.
 *
 * L'archive ne remonte pas le temps : aucun tournoi déjà en base n'a d'Elo
 * antérieur, et aucun n'en aura. Le volet propre ne se remplira que pour les
 * tournois à venir — d'où `sansEloAnterieur` dans la réponse, qui dit
 * combien de tournois sont restés hors de l'évaluation propre plutôt que de
 * le taire.
 *
 * Traite en priorité ce qui manque ou ce qui a bougé :
 *   - pas de ligne             → à calculer ;
 *   - ligne « en cours »       → le tournoi a pu avancer depuis, à recalculer ;
 *   - ligne « terminé » sans
 *     volet propre             → seul ce volet est recalculé, si possible ;
 *   - ligne « terminé » avec
 *     les deux volets          → définitive, on n'y touche plus.
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
        .select('id, name, tour, start_date')
        .order('start_date', { ascending: false, nullsFirst: false }),
      sb
        .from('tn_fantasy_historique')
        .select('tournament_id, termine, e_predit_anterieur'),
    ]);
    if (tournois.error) throw new Error(tournois.error.message);
    if (historique.error) throw new Error(historique.error.message);

    const lignes = new Map(
      (historique.data ?? []).map((h) => [h.tournament_id as string, h]),
    );

    // Définitif = terminé ET déjà jugé sans look-ahead. Un tournoi terminé
    // dont le volet propre manque reste à reprendre : il peut s'agir d'un
    // tournoi récent, joué après la mise en place de l'archive.
    const definitif = (id: string) => {
      const h = lignes.get(id);
      return Boolean(h?.termine && h.e_predit_anterieur !== null);
    };

    const aFaire = (tournois.data ?? []).filter((t) => !definitif(t.id));
    const lecteur = creerLecteurEloAnterieur();

    let traites = 0;
    let ignores = 0;
    let restants = 0;
    let propres = 0;
    let sansEloAnterieur = 0;
    /** Tournois traités dans cette passe, quelle qu'en soit l'issue. */
    let vus = 0;

    for (const t of aFaire) {
      if (Date.now() - debut > BUDGET_MS) {
        restants = aFaire.length - vus;
        break;
      }
      vus++;

      const dejaTermine = lignes.get(t.id)?.termine === true;

      // Un tournoi terminé n'a plus que son volet propre à gagner. La question
      // « un relevé Elo lui est-il antérieur ? » coûte une requête ; charger
      // le moteur et resimuler pour s'entendre dire non coûterait bien plus.
      if (dejaTermine) {
        const dispo = await lecteur.avant(t.tour, t.start_date);
        if (!dispo) {
          sansEloAnterieur++;
          continue;
        }
      }

      const engine = await loadEngineData(t.id);
      if (!engine || (engine.tournament.rounds ?? []).length === 0) {
        ignores++;
        continue;
      }

      const anterieur = await evaluerFantasyAnterieur(engine, lecteur);
      if (anterieur) propres++;
      else if (!dejaTermine) sansEloAnterieur++;

      // Le couple courant d'un tournoi terminé est définitif : on ne réécrit
      // que ce qui manquait.
      if (dejaTermine) {
        if (!anterieur) {
          ignores++;
          continue;
        }
        const r = await enregistrerAnterieur(t.id, anterieur);
        if (!r.ok) throw new Error(`${t.name} : ${r.error}`);
        traites++;
        continue;
      }

      const evaluation = equipeEvaluee(engine, await getFantasy(engine));

      // Une équipe dont aucun palier n'est pourvu n'apprend rien : l'enregistrer
      // ne ferait que diluer la synthèse.
      if (evaluation.eTotal <= 0) {
        ignores++;
        continue;
      }

      const r = await enregistrerHistorique(engine, evaluation, anterieur);
      if (!r.ok) throw new Error(`${t.name} : ${r.error}`);
      traites++;
    }

    return Response.json({
      ok: true,
      traites,
      ignores,
      restants,
      definitifs: (tournois.data ?? []).filter((t) => definitif(t.id)).length,
      propres,
      sansEloAnterieur,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
