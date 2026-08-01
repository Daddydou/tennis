import 'server-only';
import { supabaseAnon } from './anon';
import { contexteFantasy } from './fantasy';
import { POIDS_SURFACE } from './elo';
import { loadEngineData, surfacePourElo } from './queries';
import { simulerTournoi } from '@/lib/montecarlo';
import { ECHELLE_ELO } from '@/lib/elo';
import {
  COMPOSITIONS,
  composerEquipe,
  detailReelJoueur,
  detaillerJoueur,
  type CandidatFantasy,
  type FamilleFantasy,
} from '@/lib/fantasy';

/**
 * COMPARATIF D'ÉCHELLES ELO SUR L'HISTORIQUE FANTASY
 *
 * La calibration (/calibration) mesure la courbe match par match. Ici on la
 * juge sur ce qui compte vraiment pour l'app : l'écart entre l'espérance de
 * l'équipe Fantasy optimale et ce qu'elle a réellement marqué.
 *
 * Pour chaque tournoi terminé et chaque échelle candidate, on REJOUE tout :
 * simulation, espérances, composition de l'équipe, score réel de cette équipe.
 * Changer l'échelle change les espérances ET, souvent, la composition — les
 * deux comptent, c'est pourquoi rien n'est réutilisé du cache.
 *
 * ⚠ MESURE SEULEMENT. `ECHELLE_ELO` (lib/elo.ts) n'est pas touchée.
 *
 * ── Deux réserves, dans le même sens ─────────────────────────────────────────
 *
 * 1. MÊME BIAIS DE CIRCULARITÉ QUE /calibration. Les Elo utilisés sont ceux
 *    d'aujourd'hui, qui intègrent déjà les résultats des matchs rejoués : le
 *    favori d'une affiche est en partie désigné par son résultat. Les
 *    espérances des joueurs qui ont bien fini sont donc gonflées, ce qui
 *    avantage artificiellement les échelles basses (courbe raide). L'échelle
 *    qui ressort « optimale » est indicative, pas définitive.
 *
 * 2. C'est le MÊME corpus que celui qui a servi à repérer 305. Retrouver un
 *    optimum bas ici ne le confirme donc pas : les deux mesures partagent
 *    leurs données comme leur biais.
 *
 * La confirmation ne peut venir que de tournois FUTURS, simulés avant qu'ils
 * ne se jouent — cf. l'historique Fantasy, qui accumule exactement ça.
 */

/**
 * Échelles mises en regard. 400 est celle du moteur ; 305 est l'optimum brut
 * de /calibration ; 370 et 350 balisent l'intervalle, parce que l'optimum
 * « vrai » est probablement au-dessus de 305 une fois la circularité retirée.
 */
export const ECHELLES_COMPAREES = [400, 370, 350, 305];

/**
 * Simulations par tournoi et par échelle.
 *
 * Bien en dessous des 20 000 des projections de production, et c'est assumé :
 * il y a ici quatre échelles × une vingtaine de tournois à rejouer, dont cinq
 * tableaux de 128. Le bruit d'échantillonnage sur un total d'équipe reste
 * inférieur au pour cent, très loin des écarts qu'on cherche à lire (10 % et
 * plus entre 400 et 305).
 *
 * Couvrir TOUS les tournois compte davantage que raffiner chacun : une
 * comparaison sur un sous-ensemble arbitraire, forcément les plus récents,
 * mêlerait l'effet de l'échelle à celui du corpus.
 */
export const N_SIMULATIONS = 2000;

/** Même graine que les projections de production : résultats reproductibles. */
const SEED = 42;

/** Regroupement d'affichage : c'est la question « une catégorie dégradée ? ». */
export type GroupeCategorie = FamilleFantasy;

export const LIBELLE_GROUPE: Record<GroupeCategorie, string> = {
  GC: 'Grand Chelem',
  M1000: 'Masters 1000',
  AUTRE: 'Autres catégories',
};

export interface Agregat {
  tournois: number;
  predit: number;
  reel: number;
  /** (réel − prédit) / prédit. Négatif : le modèle promet trop. */
  ecart: number;
}

export interface ResultatEchelle {
  echelle: number;
  global: Agregat;
  parGroupe: { groupe: GroupeCategorie; agregat: Agregat }[];
  /**
   * Plus grand écart absolu parmi les groupes représentés.
   *
   * C'est le garde-fou demandé : une échelle peut très bien ramener l'écart
   * global à zéro en compensant un Grand Chelem trop optimiste par des petits
   * tournois trop pessimistes. Ce maximum-là ne se laisse pas compenser.
   */
  pireEcartGroupe: number;
}

export interface LigneTournoi {
  tournamentId: string;
  nom: string;
  groupe: GroupeCategorie;
  reel: number;
  /** Espérance de l'équipe optimale, échelle par échelle. */
  preditParEchelle: Record<number, number>;
}

export interface Comparaison {
  echelleProduction: number;
  simulations: number;
  tournoisCouverts: number;
  tournoisTotal: number;
  /** Vrai si le budget de temps a coupé avant la fin. */
  partiel: boolean;
  resultats: ResultatEchelle[];
  tournois: LigneTournoi[];
  /** Échelle au plus petit écart global absolu. */
  meilleureGlobale: number;
  /** Échelle au plus petit « pire écart par groupe ». */
  meilleureParGroupe: number;
}

/**
 * On ne commence pas un nouveau tournoi au-delà : cf. `partiel`.
 *
 * Généreux à dessein — un comparatif partiel vaut beaucoup moins qu'un
 * comparatif complet, et la coupure retire toujours les tournois les plus
 * anciens, ce qui biaiserait le corpus.
 */
const BUDGET_MS = 240_000;

type Engine = NonNullable<Awaited<ReturnType<typeof loadEngineData>>>;

/**
 * Rejoue un tournoi sous une échelle donnée : espérance de l'équipe optimale,
 * et score réel de CETTE équipe. Le score réel dépend de l'échelle, puisque la
 * composition en dépend.
 */
function rejouer(
  engine: Engine,
  echelle: number,
): { predit: number; reel: number } | null {
  const { tournament, matches, players } = engine;
  const rounds = tournament.rounds ?? [];
  if (rounds.length === 0) return null;

  const bestOf = (tournament.best_of ?? 3) as 3 | 5;
  const { famille, bareme } = contexteFantasy(tournament);

  const mc = simulerTournoi(
    matches,
    players,
    rounds,
    N_SIMULATIONS,
    bestOf,
    surfacePourElo(tournament.surface),
    POIDS_SURFACE,
    SEED,
    echelle,
  );

  const candidats: CandidatFantasy[] = Object.keys(players).map((playerId) => {
    const { eTotal } = detaillerJoueur(rounds, bareme, (round) => ({
      pReach: mc.presence[playerId]?.[round] ?? 0,
      points: mc.esperances[playerId]?.[round] ?? 0,
    }));
    return { playerId, rang: players[playerId]?.rank ?? null, eTotal };
  });

  let predit = 0;
  let reel = 0;
  for (const m of composerEquipe(COMPOSITIONS[famille], candidats)) {
    if (!m.playerId) continue;
    predit += m.eTotal;
    reel += detailReelJoueur(matches, m.playerId, rounds, bareme, bestOf).total;
  }

  return predit > 0 ? { predit, reel } : null;
}

function agreger(
  lignes: { predit: number; reel: number }[],
): Agregat {
  const predit = lignes.reduce((s, l) => s + l.predit, 0);
  const reel = lignes.reduce((s, l) => s + l.reel, 0);
  return {
    tournois: lignes.length,
    predit,
    reel,
    ecart: predit > 0 ? reel / predit - 1 : 0,
  };
}

/**
 * Compare les échelles candidates sur tous les tournois TERMINÉS.
 *
 * Un tournoi en cours a un score réel tronqué : le comparer à une espérance
 * portant sur tout le tableau donnerait un écart négatif par construction, et
 * de la même façon pour toutes les échelles — du bruit, pas de l'information.
 */
export async function comparerEchelles(): Promise<Comparaison> {
  const debut = Date.now();

  const { data, error } = await supabaseAnon()
    .from('tn_tournaments')
    .select('id, name')
    .order('start_date', { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);

  const indecis = ['scheduled', 'live'];
  const tournois: LigneTournoi[] = [];
  // Résultats par échelle, en attente d'agrégation.
  const parEchelle = new Map<number, { groupe: GroupeCategorie; predit: number; reel: number }[]>(
    ECHELLES_COMPAREES.map((e) => [e, []]),
  );

  let candidats = 0;
  let partiel = false;

  for (const t of data ?? []) {
    const engine = await loadEngineData(t.id);
    if (!engine) continue;

    const termine =
      engine.matches.length > 0 &&
      !engine.matches.some((m) => indecis.includes(m.status));
    if (!termine) continue;
    candidats++;

    // On s'arrête à une frontière de tournoi, jamais au milieu des échelles :
    // comparer des échelles sur des corpus différents n'aurait aucun sens.
    if (Date.now() - debut > BUDGET_MS) {
      partiel = true;
      continue;
    }

    const { famille } = contexteFantasy(engine.tournament);
    const preditParEchelle: Record<number, number> = {};
    let reel = 0;
    let exploitable = true;

    for (const echelle of ECHELLES_COMPAREES) {
      const r = rejouer(engine, echelle);
      if (!r) {
        exploitable = false;
        break;
      }
      preditParEchelle[echelle] = r.predit;
      reel = r.reel;
      parEchelle.get(echelle)!.push({ groupe: famille, predit: r.predit, reel: r.reel });
    }
    if (!exploitable) continue;

    tournois.push({
      tournamentId: t.id,
      nom: t.name,
      groupe: famille,
      reel,
      preditParEchelle,
    });
  }

  const groupes: GroupeCategorie[] = ['GC', 'M1000', 'AUTRE'];

  const resultats: ResultatEchelle[] = ECHELLES_COMPAREES.map((echelle) => {
    const lignes = parEchelle.get(echelle) ?? [];
    const parGroupe = groupes
      .map((groupe) => ({
        groupe,
        agregat: agreger(lignes.filter((l) => l.groupe === groupe)),
      }))
      .filter((g) => g.agregat.tournois > 0);

    return {
      echelle,
      global: agreger(lignes),
      parGroupe,
      pireEcartGroupe: parGroupe.length
        ? Math.max(...parGroupe.map((g) => Math.abs(g.agregat.ecart)))
        : 0,
    };
  });

  const argmin = (cle: (r: ResultatEchelle) => number): number =>
    resultats.reduce((a, b) => (cle(b) < cle(a) ? b : a), resultats[0]).echelle;

  return {
    echelleProduction: ECHELLE_ELO,
    simulations: N_SIMULATIONS,
    tournoisCouverts: tournois.length,
    tournoisTotal: candidats,
    partiel,
    resultats,
    tournois,
    meilleureGlobale: argmin((r) => Math.abs(r.global.ecart)),
    meilleureParGroupe: argmin((r) => r.pireEcartGroupe),
  };
}
