import type { SupabaseClient } from '@supabase/supabase-js';
import {
  desaccordsResultat,
  recalculerPointsTotaux,
  statistiquesPronostics,
  validerBracket,
  type BracketThomas,
} from '@/lib/thomasApi';

/**
 * STOCKAGE DU BRACKET DE THOMAS — tables tn_bracket_externe_* (migration 0022).
 *
 * Le client Supabase est INJECTÉ : ce module n'importe ni Next ni
 * `server-only`, pour servir à la fois
 *   - à db/bracketExterne.ts (app : `exigerSession()` puis `supabaseAdmin()`),
 *   - au script manuel scripts/sync-bracket-thomas.mts (hors Next, client
 *     service role construit comme scripts/backfill-tournois.mts).
 * Ne JAMAIS l'appeler avec un client obtenu autrement.
 *
 * UPSERT PARTOUT (jamais d'insert sec) : relancer la synchro ne duplique
 * rien. AUCUNE SUPPRESSION : une ligne disparue chez Thomas reste chez nous.
 */

export interface EcartPoints {
  userId: string;
  pseudo: string;
  thomas: number | null;
  calcule: number;
}

export interface ResumeSynchro {
  tournoiId: string;
  nom: string;
  verrouille: boolean;
  lockAt: string | null;
  tours: number;
  matchs: number;
  pronostics: number;
  joueurAbsent: number;
  participants: { userId: string; pseudo: string; thomas: number | null; calcule: number }[];
  /** Participants dont pointsTotaux (Thomas) ≠ notre recalcul : erreur de mapping probable. */
  ecartsPoints: EcartPoints[];
  /** Pronostics dont le `resultat` de Thomas contredit notre jugement. */
  desaccordsResultat: number;
}

/** Incohérences qui bloquent l'écriture : rien n'est écrit. */
export class BracketIncoherent extends Error {
  readonly erreurs: string[];

  constructor(erreurs: string[]) {
    super(`Bracket incohérent (${erreurs.length} erreur(s)) : rien n'a été écrit.`);
    this.name = 'BracketIncoherent';
    this.erreurs = erreurs;
  }
}

/** Résumé et lignes à écrire, sans toucher à la base. Pur. */
export function preparerSynchro(b: BracketThomas, maintenant = new Date().toISOString()) {
  const erreurs = validerBracket(b);
  if (erreurs.length) throw new BracketIncoherent(erreurs);

  const t = b.tournoi;
  const calcules = recalculerPointsTotaux(b.tours);
  const participants = b.participants.map((p) => ({
    userId: p.userId,
    pseudo: p.pseudo,
    thomas: p.pointsTotaux,
    calcule: calcules.get(p.userId) ?? 0,
  }));

  const lignes = {
    tournoi: {
      id: t.id,
      nom: t.nom,
      tour: t.tour,
      annee: t.annee,
      type: t.type,
      surface: t.surface,
      lieu: t.lieu,
      draw_size: t.drawSize,
      statut: t.statut,
      verrouille: t.verrouille,
      lock_at: t.lockAt,
      // tournament_id_interne volontairement ABSENT : posé à la main, jamais
      // écrasé par une synchro.
      updated_at: maintenant,
    },
    participants: participants.map((p) => ({
      tournoi_id: t.id,
      user_id: p.userId,
      pseudo: p.pseudo,
      rempli: b.participants.find((x) => x.userId === p.userId)!.rempli,
      points_totaux_thomas: p.thomas,
      points_totaux_calcule: p.calcule,
      updated_at: maintenant,
    })),
    joueurs: b.joueurs.map((j) => ({
      tournoi_id: t.id,
      position: j.position,
      prenom: j.prenom,
      nom: j.nom,
      tete: j.tete,
      statut: j.statut,
      pays: j.pays,
      classement: j.classement,
      api_player_id: j.apiPlayerId,
      updated_at: maintenant,
    })),
    matchs: b.tours.flatMap((tr) =>
      tr.matchs.map((m) => ({
        tournoi_id: t.id,
        tour: tr.tour,
        match_index: m.index,
        position1: m.position1,
        position2: m.position2,
        vainqueur: m.vainqueur,
        score: m.score,
        updated_at: maintenant,
      })),
    ),
    pronostics: b.tours.flatMap((tr) =>
      tr.matchs.flatMap((m) =>
        m.pronostics.map((p) => ({
          tournoi_id: t.id,
          tour: tr.tour,
          match_index: m.index,
          user_id: p.userId,
          position: p.position,
          resultat: p.resultat,
          joueur_absent: p.joueurAbsent,
          updated_at: maintenant,
        })),
      ),
    ),
  };

  const stats = [...statistiquesPronostics(b.tours).values()];
  const resume: ResumeSynchro = {
    tournoiId: t.id,
    nom: t.nom,
    verrouille: t.verrouille,
    lockAt: t.lockAt,
    tours: b.tours.length,
    matchs: lignes.matchs.length,
    pronostics: lignes.pronostics.length,
    joueurAbsent: stats.reduce((s, x) => s + x.rateJoueurAbsent, 0),
    participants,
    ecartsPoints: participants.filter((p) => p.thomas !== p.calcule),
    desaccordsResultat: desaccordsResultat(b.tours).length,
  };
  return { lignes, resume };
}

/** Taille des lots d'upsert (un tableau de 128 a ~380 pronostics). */
const LOT = 500;

async function upsert(
  sb: SupabaseClient,
  table: string,
  lignes: Record<string, unknown>[],
  onConflict: string,
): Promise<void> {
  for (let i = 0; i < lignes.length; i += LOT) {
    const { error } = await sb.from(table).upsert(lignes.slice(i, i + LOT), { onConflict });
    if (error) throw new Error(`${table} : ${error.message}`);
  }
}

/**
 * Écrit un bracket dans les 5 tables, dans l'ordre des clés étrangères.
 * Valide AVANT d'écrire : un bracket incohérent lève `BracketIncoherent`
 * sans rien écrire. Pas de transaction côté PostgREST : une panne réseau en
 * cours de route laisse une synchro partielle, que relancer la même synchro
 * complète (upsert).
 */
export async function ecrireBracketExterne(sb: SupabaseClient, b: BracketThomas): Promise<ResumeSynchro> {
  const { lignes, resume } = preparerSynchro(b);
  await upsert(sb, 'tn_bracket_externe_tournois', [lignes.tournoi], 'id');
  await upsert(sb, 'tn_bracket_externe_participants', lignes.participants, 'tournoi_id,user_id');
  await upsert(sb, 'tn_bracket_externe_joueurs', lignes.joueurs, 'tournoi_id,position');
  await upsert(sb, 'tn_bracket_externe_matchs', lignes.matchs, 'tournoi_id,tour,match_index');
  await upsert(sb, 'tn_bracket_externe_pronostics', lignes.pronostics, 'tournoi_id,tour,match_index,user_id');
  return resume;
}

/** Tournois déjà synchronisés : id, nom, date de dernière synchro. Lecture. */
export async function tournoisSynchronises(
  sb: SupabaseClient,
): Promise<{ id: string; nom: string; updated_at: string }[]> {
  const { data, error } = await sb
    .from('tn_bracket_externe_tournois')
    .select('id, nom, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`tn_bracket_externe_tournois : ${error.message}`);
  return (data ?? []) as { id: string; nom: string; updated_at: string }[];
}
