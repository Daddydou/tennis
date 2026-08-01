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
import { pointsAtRound } from '@/lib/scoring';

/**
 * ESPÉRANCES FANTASY — CALCUL ET CACHE
 *
 * Le jeu Fantasy fige une équipe pour tout le tournoi : chaque joueur porte
 * UNE espérance globale, somme de ses espérances par tour pondérées par le
 * multiplicateur du tour (cf. lib/fantasy.ts).
 *
 * Rien n'est simulé ici : on réutilise TELLES QUELLES les projections Monte
 * Carlo des picks (`getProjections`, cache `tn_projections`). Un tournoi déjà
 * consulté côté Picks ou Prédictions ne relance donc aucune simulation.
 *
 * Deux régimes cohabitent dans un même total :
 *   - les tours ANTÉRIEURS au tour de départ sont joués : on prend les points
 *     réellement marqués (lib/scoring.ts), pas une espérance ;
 *   - les tours restants sont estimés par la simulation.
 * Le total est donc « ce que l'équipe rapportera sur tout le tournoi, compte
 * tenu de ce qui est déjà acquis » — et redevient une espérance pure avant le
 * premier tour, quand rien n'est joué.
 */

export interface FantasyJoueur {
  playerId: string;
  /** Espérance de points sur tout le tournoi, multiplicateurs compris. */
  eTotal: number;
  /** Ventilation tour par tour (ce que l'écran montre au clic). */
  detail: LigneTour[];
}

export interface Fantasy {
  /** Tour depuis lequel la simulation part (cf. `simulerDepuis`). */
  fromRound: string;
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
 * Calcule l'espérance Fantasy de chaque joueur du tableau et la met en cache
 * dans `tn_fantasy`, indexée par (tournoi, tour de départ).
 *
 * Le gros du coût est la simulation Monte Carlo, déjà mutualisée avec les
 * picks. Ce qui reste ici est une combinaison linéaire — mais on la stocke
 * quand même, avec sa ventilation, pour que l'écran n'ait pas à relire toute
 * la projection du tableau à chaque affichage.
 */
export async function computeAndStoreFantasy(
  engine: EngineInput,
  fromRound: string,
): Promise<Fantasy> {
  const { tournament, matches, players } = engine;
  const rounds = tournament.rounds ?? [];
  const bestOf = (tournament.best_of ?? 3) as 3 | 5;
  const { famille, bareme } = contexteFantasy(tournament);

  const { esperances, presence } = await getProjections(engine, fromRound);

  // Tours déjà joués : ceux qui précèdent le tour de départ de la simulation.
  const depart = rounds.indexOf(fromRound);
  const premierSimule = depart < 0 ? 0 : depart;

  const joueurs: Record<string, FantasyJoueur> = {};
  for (const playerId of Object.keys(players)) {
    const { lignes, eTotal } = detaillerJoueur(rounds, bareme, (round, i) => {
      if (i < premierSimule) {
        return {
          pReach: null,
          points: pointsAtRound(matches, playerId, round, bestOf),
          acquis: true,
        };
      }
      return {
        pReach: presence[playerId]?.[round] ?? 0,
        points: esperances[playerId]?.[round] ?? 0,
        acquis: false,
      };
    });
    joueurs[playerId] = { playerId, eTotal, detail: lignes };
  }

  const sb = supabaseAdmin();
  await sb
    .from('tn_fantasy')
    .delete()
    .eq('tournament_id', tournament.id)
    .eq('from_round', fromRound);

  const rows = Object.values(joueurs).map((j) => ({
    tournament_id: tournament.id,
    from_round: fromRound,
    player_id: j.playerId,
    e_total: j.eTotal,
    detail: j.detail,
  }));
  if (rows.length) {
    const { error } = await sb.from('tn_fantasy').insert(rows);
    if (error) throw new Error(`Fantasy : ${error.message}`);
  }

  return { fromRound, famille, bareme, joueurs };
}

/** Supprime tout le cache Fantasy d'un tournoi (tous les tours de départ). */
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
 * Espérances Fantasy pour un tour de départ donné.
 * Lit le cache `tn_fantasy` ; s'il est vide (import récent, rafraîchissement
 * des Elo, premier affichage de ce tour), recalcule et le repeuple.
 */
export async function getFantasy(
  engine: EngineInput,
  fromRound: string,
): Promise<Fantasy> {
  const { famille, bareme } = contexteFantasy(engine.tournament);

  // Lecture en clé anon ; seul le repeuplement écrit, en service role.
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('tn_fantasy')
    .select('player_id, e_total, detail')
    .eq('tournament_id', engine.tournament.id)
    .eq('from_round', fromRound);
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
    return { fromRound, famille, bareme, joueurs };
  }

  return computeAndStoreFantasy(engine, fromRound);
}
