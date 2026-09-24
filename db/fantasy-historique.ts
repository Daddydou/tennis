import 'server-only';
import { supabaseAdmin } from './server';
import { supabaseAnon } from './anon';
import type { EngineInput } from './projections';
import type { Fantasy } from './fantasy-cache';
import {
  COMPOSITIONS,
  composerEquipe,
  detailReelJoueur,
  type CandidatFantasy,
  type LigneReelle,
  type MembreEquipe,
} from '@/lib/fantasy';
import { estIndecis } from '@/lib/types';

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
 *     bouge plus (cf. l'encadré en tête de db/fantasy-cache.ts) ;
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
 * Volet « sans look-ahead » du même tournoi : la même équipe recomposée sur
 * l'Elo qui précédait le tirage (cf. db/fantasy-anterieur.ts).
 *
 * Facultatif, et son absence veut dire quelque chose : aucun relevé Elo n'est
 * antérieur à ce tournoi, il n'entre donc pas dans l'évaluation propre.
 */
export interface VoletAnterieur {
  releveLe: string;
  ePredit: number;
  reel: number;
  joueursSansElo: number;
  equipe: LigneHistorique['equipe'];
}

/**
 * Enregistre (ou met à jour) le couple prédit/réalisé d'un tournoi.
 * Ne lève jamais : l'historique est une collecte annexe, il ne doit pas faire
 * échouer l'import qui le déclenche.
 *
 * `anterieur` omis laisse les colonnes propres INTACTES plutôt que de les
 * effacer : le chemin d'import ne les calcule pas (il coûterait une simulation
 * de plus à chaque import), et il ne doit pas défaire ce que le backfill a
 * écrit.
 */
export async function enregistrerHistorique(
  engine: EngineInput,
  evaluation: EquipeEvaluee,
  anterieur?: VoletAnterieur | null,
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
        ...(anterieur ? colonnesAnterieures(anterieur) : {}),
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

function colonnesAnterieures(a: VoletAnterieur) {
  return {
    e_predit_anterieur: a.ePredit,
    score_reel_anterieur: a.reel,
    equipe_anterieure: a.equipe,
    elo_releve_le: a.releveLe,
    joueurs_sans_elo: a.joueursSansElo,
  };
}

/**
 * Met à jour le SEUL volet propre d'un tournoi déjà enregistré.
 *
 * Cas d'un tournoi terminé dont le couple courant est définitif : rejouer le
 * calcul de production pour n'en changer que les colonnes propres serait une
 * simulation Monte Carlo pour rien.
 */
export async function enregistrerAnterieur(
  tournamentId: string,
  anterieur: VoletAnterieur,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabaseAdmin()
      .from('tn_fantasy_historique')
      .update(colonnesAnterieures(anterieur))
      .eq('tournament_id', tournamentId);
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
  /**
   * Volet sans look-ahead. NULL = aucun relevé Elo n'est antérieur à ce
   * tournoi, il n'entre pas dans l'évaluation propre (cf. migration 0010).
   */
  e_predit_anterieur: number | string | null;
  score_reel_anterieur: number | string | null;
  equipe_anterieure: LigneHistorique['equipe'] | null;
  elo_releve_le: string | null;
  joueurs_sans_elo: number | null;
}

/** Tout l'historique, du tournoi le plus récent au plus ancien. */
export async function listerHistorique(): Promise<HistoriqueRow[]> {
  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('tn_fantasy_historique')
    .select(
      'tournament_id, e_predit, score_reel, termine, equipe, computed_at, e_predit_anterieur, score_reel_anterieur, equipe_anterieure, elo_releve_le, joueurs_sans_elo',
    );
  if (error) throw new Error(error.message);
  return (data ?? []) as HistoriqueRow[];
}
