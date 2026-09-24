import { loadEngineData, surfacePourElo } from '@/db/queries';
import { eloEffectifResolu, type ElosResolus } from '@/db/elo';
import { chargerCotes } from '@/db/cotes';
import {
  creerLecteurEloAnterieur,
  eloAnterieur,
  type EloALaDate,
} from '@/db/elo-historique';
import { blendAvecCotes, pVictoire } from '@/lib/elo';
import { scorerMethode, type Prediction } from '@/lib/cotes';
import { POIDS_ELO, POIDS_ELO_MARCHE, libelleBlend } from './constantes';

/** Pourquoi un match n'entre pas dans l'évaluation propre. */
export type SansAnterieur = 'instantane' | 'joueur';

export interface LigneVue {
  nomA: string;
  nomB: string;
  favori: string | null;
  pEloFavori: number | null;
  pEloAvantFavori: number | null;
  pCotesFavori: number | null;
  /** Mélanges de l'évaluation PROPRE : ils partent de l'Elo antérieur. */
  pBlendFavori: number | null;
  pBlendMarcheFavori: number | null;
  vainqueur: string | null;
  favoriGagne: boolean | null;
  bookmakers: number;
  apparie: boolean;
  /** Relevé Elo utilisé pour ce match, quand il en existe un. */
  releveLe: string | null;
  sansAnterieur: SansAnterieur | null;
}

/**
 * Devine la clé de sport correspondant au tournoi, pour présélectionner la
 * bonne entrée dans la liste. Simple aide à la saisie : le choix reste manuel.
 */
export function sportSuggere(
  sports: { key: string; title: string }[],
  slug: string | null,
  tour: string,
): string | null {
  if (!slug) return null;
  const jetons = slug.split('-').filter((j) => j.length > 3);
  const circuit = tour.toLowerCase();
  const candidat = sports.find(
    (s) =>
      s.key.startsWith(`tennis_${circuit}`) &&
      jetons.some((j) => s.key.includes(j) || s.title.toLowerCase().includes(j)),
  );
  return candidat?.key ?? null;
}

/**
 * Confrontation des méthodes sur les matchs joués.
 *
 * DEUX ÉVALUATIONS, JAMAIS CONFONDUES.
 *
 * 1. PROPRE — l'Elo de chaque joueur tel qu'il était AVANT le match (dernier
 *    relevé Tennis Abstract strictement antérieur, cf. elo-historique.ts).
 *    C'est la seule méthodologiquement valide : les cotes, elles, sont par
 *    construction capturées avant la rencontre, et les comparer à un Elo
 *    postérieur reviendrait à faire courir les deux sur des pistes de
 *    longueurs différentes.
 *
 * 2. POUR MÉMOIRE — l'Elo COURANT, celui de `ta_elo`. Il a déjà intégré le
 *    résultat du match : le vainqueur en est ressorti relevé, le perdant
 *    abaissé, si bien qu'a posteriori le favori est en partie désigné PAR
 *    son résultat. Le biais a un sens connu — l'Elo paraît meilleur qu'il
 *    ne l'est. On garde la mesure pour pouvoir LIRE cet écart, pas pour
 *    conclure avec.
 *
 * L'archive ne remonte pas le temps (cf. migration 0010) : sur les tournois
 * déjà en base, l'évaluation propre est vide, et c'est normal. Elle se
 * remplira avec les tournois à venir.
 */
export async function evaluerCotes(
  engine: Awaited<ReturnType<typeof loadEngineData>> | null,
  cotes: Awaited<ReturnType<typeof chargerCotes>>,
) {
  const surfElo = engine ? surfacePourElo(engine.tournament.surface) : 'hard';
  const eloDe = (pid: string): number | null => {
    const e = engine?.elos[pid] as ElosResolus | undefined;
    return e ? eloEffectifResolu(e, surfElo) : null;
  };

  const lecteur = creerLecteurEloAnterieur();
  const joueurDe = new Map((engine?.playerRows ?? []).map((p) => [p.id, p]));

  /** Elo effectif d'un joueur dans un état daté. null s'il n'y figure pas. */
  const eloAvantDe = (pid: string | null, etat: EloALaDate | null): number | null => {
    const p = pid ? joueurDe.get(pid) : undefined;
    const e = p ? eloAnterieur(p, etat) : null;
    return e ? eloEffectifResolu(e, surfElo) : null;
  };

  const vues: LigneVue[] = [];

  // Corpus « pour mémoire » : Elo courant.
  const predElo: Prediction[] = [];
  const predCotes: Prediction[] = [];
  const predBlend: Prediction[] = [];
  const predBlendMarche: Prediction[] = [];

  // Corpus « propre » : Elo antérieur au match. Sous-ensemble du précédent.
  const predEloAvant: Prediction[] = [];
  const predCotesPropre: Prediction[] = [];
  const predBlendAvant: Prediction[] = [];
  const predBlendMarcheAvant: Prediction[] = [];

  // Matchs évaluables aujourd'hui mais exclus de l'évaluation propre, par
  // motif. Comptés et affichés : une mesure qui porte silencieusement sur un
  // sous-ensemble ne vaut rien.
  let sansInstantane = 0;
  let sansEloJoueur = 0;

  for (const c of cotes) {
    const a = c.player_a_id;
    const b = c.player_b_id;
    const apparie = Boolean(a && b);

    const eloA = a ? eloDe(a) : null;
    const eloB = b ? eloDe(b) : null;
    const pEloA = eloA !== null && eloB !== null ? pVictoire(eloA, eloB) : null;
    const pCotesA = c.proba_a;
    const melangeable = pEloA !== null && pCotesA !== null;
    const pBlendA = melangeable ? blendAvecCotes(pEloA, pCotesA, POIDS_ELO) : null;
    const pBlendMarcheA = melangeable
      ? blendAvecCotes(pEloA, pCotesA, POIDS_ELO_MARCHE)
      : null;

    // Date du match : l'heure de coup d'envoi annoncée par le bookmaker, la
    // seule date par match dont on dispose. À défaut, le début du tournoi —
    // antérieur à toutes ses rencontres, donc jamais optimiste.
    const dateMatch = c.commence_time ?? engine?.tournament.start_date ?? null;
    const etat = engine
      ? await lecteur.avant(engine.tournament.tour, dateMatch)
      : null;

    const eloAvantA = eloAvantDe(a, etat);
    const eloAvantB = eloAvantDe(b, etat);
    const pEloAvantA =
      eloAvantA !== null && eloAvantB !== null
        ? pVictoire(eloAvantA, eloAvantB)
        : null;
    const melangeableAvant = pEloAvantA !== null && pCotesA !== null;
    const pBlendAvantA = melangeableAvant
      ? blendAvecCotes(pEloAvantA, pCotesA, POIDS_ELO)
      : null;
    const pBlendMarcheAvantA = melangeableAvant
      ? blendAvecCotes(pEloAvantA, pCotesA, POIDS_ELO_MARCHE)
      : null;

    // Résultat réel : on lit ici le vainqueur, ce que les écrans de pronostic
    // s'interdisent — c'est précisément l'objet de la mesure.
    const match =
      apparie && engine
        ? engine.matches.find(
            (m) =>
              m.players.some((p) => p.id === a) && m.players.some((p) => p.id === b),
          )
        : undefined;
    const vainqueurId = match?.players.find((p) => p.winner)?.id ?? null;
    const aGagne = vainqueurId === null ? null : vainqueurId === a;

    const evaluable =
      aGagne !== null &&
      pEloA !== null &&
      pCotesA !== null &&
      pBlendA !== null &&
      pBlendMarcheA !== null;

    if (evaluable) {
      predElo.push({ p: pEloA, gagne: aGagne });
      predCotes.push({ p: pCotesA, gagne: aGagne });
      predBlend.push({ p: pBlendA, gagne: aGagne });
      predBlendMarche.push({ p: pBlendMarcheA, gagne: aGagne });
    }

    // Un match n'est exclu de l'évaluation propre que s'il aurait pu y entrer :
    // compter comme « sans Elo antérieur » une rencontre non appariée ou non
    // jouée mélangerait deux motifs différents.
    let sansAnterieur: SansAnterieur | null = null;
    if (evaluable) {
      if (pEloAvantA !== null && pBlendAvantA !== null && pBlendMarcheAvantA !== null) {
        predEloAvant.push({ p: pEloAvantA, gagne: aGagne });
        predCotesPropre.push({ p: pCotesA, gagne: aGagne });
        predBlendAvant.push({ p: pBlendAvantA, gagne: aGagne });
        predBlendMarcheAvant.push({ p: pBlendMarcheAvantA, gagne: aGagne });
      } else if (etat === null) {
        sansAnterieur = 'instantane';
        sansInstantane++;
      } else {
        sansAnterieur = 'joueur';
        sansEloJoueur++;
      }
    }

    // Affichage orienté sur le favori de l'Elo — celui d'AVANT le match quand
    // on l'a, sinon celui d'aujourd'hui. Les scores, eux, sont indifférents à
    // l'orientation (cf. lib/cotes.ts) : elle ne joue que sur la lisibilité.
    const pOrientation = pEloAvantA ?? pEloA;
    const favoriEstA = pOrientation === null ? true : pOrientation >= 0.5;
    const orienter = (p: number | null) =>
      p === null ? null : favoriEstA ? p : 1 - p;
    const nomJoueur = (pid: string | null, repli: string) =>
      (pid && engine?.players[pid]?.name) || repli;
    vues.push({
      nomA: nomJoueur(a, c.nom_a),
      nomB: nomJoueur(b, c.nom_b),
      favori: favoriEstA ? nomJoueur(a, c.nom_a) : nomJoueur(b, c.nom_b),
      pEloFavori: orienter(pEloA),
      pEloAvantFavori: orienter(pEloAvantA),
      pCotesFavori: orienter(pCotesA),
      // Le détail montre les mélanges de l'évaluation propre : ceux de l'Elo
      // courant n'existent que pour situer le biais, en agrégé.
      pBlendFavori: orienter(pBlendAvantA),
      pBlendMarcheFavori: orienter(pBlendMarcheAvantA),
      vainqueur: vainqueurId ? nomJoueur(vainqueurId, '—') : null,
      favoriGagne:
        aGagne === null ? null : favoriEstA ? aGagne : !aGagne,
      bookmakers: c.bookmakers,
      apparie,
      releveLe: etat?.releveLePlusRecent ?? null,
      sansAnterieur,
    });
  }

  /** Les quatre méthodes d'un corpus, la première servant de référence. */
  const scorer = (libelleElo: string, p: Prediction[][]) => {
    const scores = [
      scorerMethode(libelleElo, p[0]),
      scorerMethode('Cotes seules', p[1]),
      scorerMethode(libelleBlend(POIDS_ELO), p[2]),
      scorerMethode(libelleBlend(POIDS_ELO_MARCHE), p[3]),
    ];
    const evalues = scores.filter((s) => s.n > 0);
    return {
      scores,
      refBrier: scores[0].brier,
      refLog: scores[0].logLoss,
      meilleurBrier: evalues.length
        ? Math.min(...evalues.map((s) => s.brier))
        : null,
    };
  };

  const propre = scorer('Elo antérieur au match', [
    predEloAvant,
    predCotesPropre,
    predBlendAvant,
    predBlendMarcheAvant,
  ]);
  const courant = scorer('Elo courant', [
    predElo,
    predCotes,
    predBlend,
    predBlendMarche,
  ]);

  const nonApparies = vues.filter((v) => !v.apparie);
  /** Relevés effectivement utilisés — l'âge des Elo qui ont servi. */
  const relevesUtilises = [
    ...new Set(vues.map((v) => v.releveLe).filter((r): r is string => r !== null)),
  ].sort();

  return {
    vues,
    propre,
    courant,
    sansInstantane,
    sansEloJoueur,
    nonApparies,
    relevesUtilises,
  };
}
