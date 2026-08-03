import 'server-only';
import { supabaseAdmin } from './server';
import { supabaseAnon } from './anon';
import { getProjections, type EngineInput } from './projections';
import {
  COMPOSITIONS,
  baremeTournoi,
  composerEquipe,
  detailReelJoueur,
  detaillerJoueur,
  famillePourCategorie,
  toursAvecBye,
  type CandidatFantasy,
  type FamilleFantasy,
  type LigneReelle,
  type LigneTour,
  type MembreEquipe,
} from '@/lib/fantasy';
import { estIndecis } from '@/lib/types';

/**
 * ESPÉRANCES FANTASY — CALCUL ET CACHE
 *
 * Le jeu Fantasy fige une équipe pour tout le tournoi : chaque joueur porte
 * UNE espérance globale, somme de ses espérances par tour pondérées par le
 * multiplicateur du tour (cf. lib/fantasy.ts).
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ESPÉRANCE A PRIORI, DEPUIS LE TIRAGE — jamais recalculée en cours de     │
 * │ route. La simulation part TOUJOURS du premier tour, tableau complet,     │
 * │ et n'injecte AUCUN résultat réel : ni points marqués, ni survivants.     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * C'est la différence de fond avec les picks, et elle vient de la règle du
 * jeu : l'équipe se compose une seule fois, avant le coup d'envoi. La bonne
 * question n'est donc pas « que rapportera cette équipe compte tenu de ce qui
 * est déjà joué », mais « quelle équipe fallait-il composer au vu du tirage ».
 * Un tournoi à venir, en cours ou terminé donne exactement le même résultat.
 *
 * Rien n'est simulé ici : on réutilise TELLES QUELLES les projections Monte
 * Carlo du premier tour (`getProjections` sur `rounds[0]`, cache
 * `tn_projections`). À ce tour de départ, `simulerDepuis` délègue à
 * `simulerTournoi`, qui repart du tableau initial — les résultats connus n'y
 * entrent pas. C'est aussi la projection qu'affiche l'écran Picks sur le
 * premier tour : le cache est partagé, pas dupliqué.
 */

export interface FantasyJoueur {
  playerId: string;
  /** Espérance de points sur tout le tournoi, multiplicateurs compris. */
  eTotal: number;
  /** Ventilation tour par tour (ce que l'écran montre au clic). */
  detail: LigneTour[];
}

export interface Fantasy {
  /**
   * Tour de départ de la simulation — toujours le premier tour du tableau.
   * Conservé pour l'affichage (« simulation depuis le tirage (R128) »), pas
   * comme un paramètre : le calcul n'en admet pas d'autre.
   */
  tirage: string;
  famille: FamilleFantasy;
  /** Multiplicateurs appliqués, du premier tour à la finale. */
  bareme: number[];
  /** Indexé par player_id. Couvre tout le tableau, pas seulement les favoris. */
  joueurs: Record<string, FantasyJoueur>;
}

interface LigneCache {
  player_id: string;
  e_total: number | string | null;
  detail: LigneTour[] | null;
}

/** Famille et barème d'un tournoi — mêmes règles partout. */
export function contexteFantasy(tournament: EngineInput['tournament']): {
  famille: FamilleFantasy;
  bareme: number[];
} {
  const rounds = tournament.rounds ?? [];
  const famille = famillePourCategorie(tournament.category, tournament.draw_size);
  return { famille, bareme: baremeTournoi(famille, rounds.length) };
}

/**
 * Premier tour du tableau — l'unique point de départ de la simulation Fantasy.
 * Renvoie null sur un tournoi sans tours connus, où il n'y a rien à calculer.
 */
function tirageDe(tournament: EngineInput['tournament']): string | null {
  return (tournament.rounds ?? [])[0] ?? null;
}

/**
 * Calcule l'espérance Fantasy de chaque joueur du tableau et la met en cache
 * dans `tn_fantasy`.
 *
 * Une seule entrée par tournoi : le calcul ne dépend pas de l'avancée du
 * tournoi, il part toujours du tirage. Rien à indexer par tour de départ.
 *
 * Le gros du coût est la simulation Monte Carlo, déjà mutualisée avec les
 * picks. Ce qui reste ici est une combinaison linéaire — mais on la stocke
 * quand même, avec sa ventilation, pour que l'écran n'ait pas à relire toute
 * la projection du tableau à chaque affichage.
 */
export async function computeAndStoreFantasy(
  engine: EngineInput,
): Promise<Fantasy> {
  const { tournament, players } = engine;
  const rounds = tournament.rounds ?? [];
  const { famille, bareme } = contexteFantasy(tournament);
  const tirage = tirageDe(tournament);

  if (!tirage) return { tirage: '', famille, bareme, joueurs: {} };

  // Tour de départ = premier tour : `simulerDepuis` délègue alors à
  // `simulerTournoi`, qui repart du tableau initial. Aucun résultat réel n'est
  // injecté, que le tournoi soit à venir, en cours ou terminé.
  const { esperances, presence } = await getProjections(engine, tirage);

  const joueurs: Record<string, FantasyJoueur> = {};
  for (const playerId of Object.keys(players)) {
    // Les exemptions sont lues dans le TIRAGE, pas dans la simulation : un bye
    // est acquis dès le tableau publié, donc certain (cf. `detaillerJoueur`).
    const { lignes, eTotal } = detaillerJoueur(
      rounds,
      bareme,
      (round) => ({
        pReach: presence[playerId]?.[round] ?? 0,
        points: esperances[playerId]?.[round] ?? 0,
      }),
      toursAvecBye(engine.matches, playerId),
    );
    joueurs[playerId] = { playerId, eTotal, detail: lignes };
  }

  const sb = supabaseAdmin();
  await sb.from('tn_fantasy').delete().eq('tournament_id', tournament.id);

  const rows = Object.values(joueurs).map((j) => ({
    tournament_id: tournament.id,
    player_id: j.playerId,
    e_total: j.eTotal,
    detail: j.detail,
  }));
  if (rows.length) {
    const { error } = await sb.from('tn_fantasy').insert(rows);
    if (error) throw new Error(`Fantasy : ${error.message}`);
  }

  return { tirage, famille, bareme, joueurs };
}

/** Supprime le cache Fantasy d'un tournoi. */
export async function invaliderFantasy(tournamentId: string): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from('tn_fantasy').delete().eq('tournament_id', tournamentId);
}

/**
 * Vide tout le cache Fantasy, tous tournois confondus.
 *
 * Pendant du vidage de `tn_projections` après un rafraîchissement des Elo :
 * les espérances Fantasy en dérivent directement, les garder afficherait des
 * totaux calculés avec les Elo de la semaine précédente.
 */
export async function invaliderToutesFantasy(): Promise<void> {
  const sb = supabaseAdmin();
  // PostgREST exige un filtre sur un DELETE : celui-ci est toujours vrai.
  const { error } = await sb
    .from('tn_fantasy')
    .delete()
    .not('tournament_id', 'is', null);
  if (error) throw new Error(`tn_fantasy : ${error.message}`);
}

/**
 * La ligne en cache est-elle encore calculée selon les règles courantes ?
 *
 * Deux marqueurs, tous deux lus dans la ventilation stockée :
 *   - les multiplicateurs, qui périment le cache dès qu'un barème change
 *     (cf. BAREMES_EXPLICITES) ;
 *   - le drapeau `bye`, absent des lignes écrites avant que l'exemption ne
 *     rapporte des points. `undefined` ne peut venir que de là — les calculs
 *     actuels l'écrivent toujours, à `true` comme à `false`. Le cache se
 *     périme donc tout seul, sans invalidation manuelle à penser.
 */
function calculAJour(ligne: LigneCache, bareme: number[]): boolean {
  const detail = ligne.detail ?? [];
  if (detail.length !== bareme.length) return false;
  if (detail.some((l) => typeof l.bye !== 'boolean')) return false;
  return detail.every((l, i) => Number(l.multiplicateur) === bareme[i]);
}

/**
 * Espérances Fantasy d'un tournoi, telles qu'elles étaient au tirage.
 * Lit le cache `tn_fantasy` ; s'il est vide (import récent, rafraîchissement
 * des Elo, premier affichage), recalcule et le repeuple.
 */
export async function getFantasy(engine: EngineInput): Promise<Fantasy> {
  const { famille, bareme } = contexteFantasy(engine.tournament);
  const tirage = tirageDe(engine.tournament) ?? '';

  // Lecture en clé anon ; seul le repeuplement écrit, en service role.
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('tn_fantasy')
    .select('player_id, e_total, detail')
    .eq('tournament_id', engine.tournament.id);
  if (error) throw new Error(error.message);

  // Le cache porte la trace des règles qui l'ont produit (cf. `calculAJour`) :
  // un barème corrigé ou une ligne d'avant la règle du bye le périment
  // d'eux-mêmes, sans invalidation manuelle ni redéploiement à penser.
  if (data && data.length > 0 && calculAJour(data[0] as LigneCache, bareme)) {
    const joueurs: Record<string, FantasyJoueur> = {};
    for (const r of data as LigneCache[]) {
      joueurs[r.player_id] = {
        playerId: r.player_id,
        eTotal: Number(r.e_total ?? 0),
        detail: r.detail ?? [],
      };
    }
    return { tirage, famille, bareme, joueurs };
  }

  return computeAndStoreFantasy(engine);
}

/* -------------------------------------------------------------------------- */
/*  ÉQUIPE OPTIMALE ET SON SCORE RÉEL                                          */
/* -------------------------------------------------------------------------- */

/** Un membre de l'équipe, avec son espérance a priori et ce qu'il a marqué. */
export interface MembreAvecReel extends MembreEquipe {
  /** Points réellement marqués à ce stade, multiplicateurs compris. */
  reel: number;
  /** Ventilation réelle tour par tour. Vide si le palier n'est pas pourvu. */
  detailReel: LigneReelle[];
}

export interface EquipeEvaluee {
  membres: MembreAvecReel[];
  /** Espérance a priori de l'équipe (somme des paliers pourvus). */
  eTotal: number;
  /** Points réels de cette même équipe, à ce stade du tournoi. */
  reelTotal: number;
  /** Tous les matchs du tableau ont une issue connue. */
  termine: boolean;
}

/**
 * Équipe optimale d'un tournoi, et ce qu'elle a réellement marqué.
 *
 * Deux mesures d'une SEULE ET MÊME équipe, jamais deux équipes :
 *   - `eTotal` : l'espérance a priori, qui a servi à la composer et qui ne
 *     bouge plus (cf. l'encadré en tête de module) ;
 *   - `reelTotal` : ce que cette composition figée a marqué sur les résultats
 *     importés, qui monte à chaque import jusqu'au score final.
 *
 * La composition n'est jamais recalculée à partir des résultats : elle sort
 * des seules espérances, exactement comme avant le coup d'envoi.
 */
export function equipeEvaluee(
  engine: EngineInput,
  fantasy: Fantasy,
): EquipeEvaluee {
  const { tournament, matches, players } = engine;
  const rounds = tournament.rounds ?? [];
  const bestOf = (tournament.best_of ?? 3) as 3 | 5;

  const candidats: CandidatFantasy[] = Object.keys(players).map((playerId) => ({
    playerId,
    rang: players[playerId]?.rank ?? null,
    eTotal: fantasy.joueurs[playerId]?.eTotal ?? 0,
  }));

  const membres = composerEquipe(COMPOSITIONS[fantasy.famille], candidats).map(
    (m): MembreAvecReel => {
      if (!m.playerId) return { ...m, reel: 0, detailReel: [] };
      const r = detailReelJoueur(
        matches,
        m.playerId,
        rounds,
        fantasy.bareme,
        bestOf,
      );
      return { ...m, reel: r.total, detailReel: r.lignes };
    },
  );

  return {
    membres,
    eTotal: membres.reduce((s, m) => s + (m.playerId ? m.eTotal : 0), 0),
    reelTotal: membres.reduce((s, m) => s + m.reel, 0),
    // Un tableau vide n'est pas un tournoi terminé, seulement un tournoi
    // sans matchs connus.
    termine: matches.length > 0 && !matches.some((m) => estIndecis(m.status)),
  };
}

/* -------------------------------------------------------------------------- */
/*  HISTORIQUE PRÉDIT / RÉALISÉ                                                */
/* -------------------------------------------------------------------------- */

/**
 * Couple (prédit, réalisé) d'un tournoi — matière première d'une future
 * évaluation de calibration.
 *
 * On ENREGISTRE, on n'ajuste rien. Aucun paramètre du modèle n'est dérivé de
 * ces lignes : sur quelques tournois, l'écart prédit/réalisé est surtout du
 * bruit, et s'y ajuster serait du sur-apprentissage. La décision d'en tirer
 * quelque chose reste humaine, une fois le volume atteint.
 */
export interface LigneHistorique {
  tournamentId: string;
  /** Espérance a priori de l'équipe optimale. */
  ePredit: number;
  /** Points réels de cette équipe. Partiel tant que `termine` est faux. */
  reel: number;
  /**
   * Le tournoi est allé à son terme. SEULES ces lignes forment des couples
   * comparables : un tournoi à mi-parcours a un `reel` tronqué, qui tirerait
   * mécaniquement toute moyenne vers le bas.
   */
  termine: boolean;
  /** Composition retenue, pour pouvoir revenir sur un écart surprenant. */
  equipe: {
    palier: number;
    playerId: string | null;
    nom: string | null;
    rang: number | null;
    ePoints: number;
    reel: number;
  }[];
}

/**
 * Enregistre (ou met à jour) le couple prédit/réalisé d'un tournoi.
 * Ne lève jamais : l'historique est une collecte annexe, il ne doit pas faire
 * échouer l'import qui le déclenche.
 */
export async function enregistrerHistorique(
  engine: EngineInput,
  evaluation: EquipeEvaluee,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { tournament, players } = engine;
    const sb = supabaseAdmin();
    const { error } = await sb.from('tn_fantasy_historique').upsert(
      {
        tournament_id: tournament.id,
        e_predit: evaluation.eTotal,
        score_reel: evaluation.reelTotal,
        termine: evaluation.termine,
        equipe: evaluation.membres.map((m) => ({
          palier: m.palier.numero,
          playerId: m.playerId,
          nom: m.playerId ? (players[m.playerId]?.name ?? m.playerId) : null,
          rang: m.playerId ? (players[m.playerId]?.rank ?? null) : null,
          ePoints: m.playerId ? m.eTotal : 0,
          reel: m.reel,
        })),
        computed_at: new Date().toISOString(),
      },
      { onConflict: 'tournament_id' },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface HistoriqueRow {
  tournament_id: string;
  e_predit: number | string | null;
  score_reel: number | string | null;
  termine: boolean;
  equipe: LigneHistorique['equipe'] | null;
  computed_at: string | null;
}

/** Tout l'historique, du tournoi le plus récent au plus ancien. */
export async function listerHistorique(): Promise<HistoriqueRow[]> {
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('tn_fantasy_historique')
    .select('tournament_id, e_predit, score_reel, termine, equipe, computed_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as HistoriqueRow[];
}
