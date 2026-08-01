import 'server-only';
import { supabaseAdmin } from './server';
import { supabaseAnon } from './anon';
import { getProjections, type EngineInput } from './projections';
import {
  baremeTournoi,
  detaillerJoueur,
  famillePourCategorie,
  type FamilleFantasy,
  type LigneTour,
} from '@/lib/fantasy';

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
    const { lignes, eTotal } = detaillerJoueur(rounds, bareme, (round) => ({
      pReach: presence[playerId]?.[round] ?? 0,
      points: esperances[playerId]?.[round] ?? 0,
    }));
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

/** La ligne en cache a-t-elle été calculée avec le barème courant ? */
function baremeInchange(ligne: LigneCache, bareme: number[]): boolean {
  const detail = ligne.detail ?? [];
  if (detail.length !== bareme.length) return false;
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

  // Le cache porte les multiplicateurs avec lesquels il a été calculé : une
  // correction du barème (cf. BAREMES_EXPLICITES, lib/fantasy.ts) le périme
  // donc d'elle-même, sans invalidation manuelle ni redéploiement à penser.
  if (data && data.length > 0 && baremeInchange(data[0] as LigneCache, bareme)) {
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
