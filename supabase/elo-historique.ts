import 'server-only';
import { supabaseAnon } from './anon';
import {
  INDEX_ELO_VIDE,
  resoudreElos,
  type ElosResolus,
  type IndexElo,
  type JoueurAResoudre,
  type TaEloRow,
} from './elo';
import { construireIndex } from '@/lib/matching';
import type { Tour } from '@/lib/types';

/**
 * ELO À UNE DATE PASSÉE — LECTURE DE L'ARCHIVE
 *
 * `ta_elo` ne garde qu'un instantané, celui du dernier import. L'utiliser
 * pour JUGER un match déjà joué revient à « prédire » un résultat que l'Elo a
 * déjà intégré : le vainqueur en est ressorti relevé, le perdant abaissé, si
 * bien qu'a posteriori le favori d'une affiche est en partie désigné PAR son
 * résultat. Le biais a un sens connu — le favori gagne trop souvent — et il
 * fausse la calibration des cotes comme le comparatif prédit/réalisé.
 *
 * Ce module lit l'archive `ta_elo_historique` (migration 0010) et rend l'Elo
 * tel qu'il était AVANT une date. Deux règles, toutes deux structurantes :
 *
 *   - STRICTEMENT antérieur. Tennis Abstract republie en début de semaine ;
 *     un rapport daté du jour du match peut déjà le contenir.
 *   - Par JOUEUR, pas par rapport. Un rapport hebdomadaire ne republie que
 *     les joueurs à plus de dix matchs sur 52 semaines : prendre le dernier
 *     rapport tel quel priverait d'Elo un joueur qui en a un, un peu plus
 *     ancien. C'est la règle qu'applique déjà `ta_elo`, qui ne supprime
 *     jamais un joueur absent du rapport de la semaine (cf. elo-refresh.ts).
 *
 * ⚠ MESURE SEULEMENT. Rien de production ne passe par ici : les picks, le
 * fantasy en direct et la simulation lisent `ta_elo`, l'état courant, et ils
 * ont raison de le faire — prédire un match à venir avec l'Elo du jour n'est
 * pas un biais, c'est la seule chose à faire.
 *
 * ⚠ L'ARCHIVE NE REMONTE PAS LE TEMPS. Tennis Abstract ne publie que le
 * rapport de la semaine : l'archive part de l'instantané courant et
 * n'accumule que vers l'avant. Aucun tournoi déjà en base n'a d'Elo
 * antérieur, et aucun n'en aura jamais. L'évaluation « propre » ne portera
 * que sur ce qui se jouera à partir de maintenant — d'où l'importance de
 * SIGNALER ce qui n'a pas pu être évalué plutôt que de le taire.
 */

/** Ligne renvoyée par la fonction SQL `ta_elo_a_la_date`. */
interface LigneArchive {
  ta_name: string;
  ta_name_normalized: string;
  ta_slug: string;
  tour: 'atp' | 'wta';
  elo_overall: number | string | null;
  elo_hard: number | string | null;
  elo_clay: number | string | null;
  elo_grass: number | string | null;
  atp_rank: number | null;
  /** Date du rapport d'où sort CETTE ligne — pas celle demandée. */
  releve_le: string;
}

/** Exception de rapprochement, telle que la table la porte. */
interface ExceptionRow {
  atp_name_normalized: string;
  ta_name_normalized: string | null;
  ta_slug: string | null;
  tour: string;
}

/**
 * Ligne d'archive présentée comme une ligne `ta_elo`.
 *
 * `updated_at` reçoit `releve_le` : c'est la même chose vue d'un autre
 * angle — la date à laquelle cette valeur a été publiée. Le reste de l'app
 * (résolution de la cascade, affichage de la source) travaille alors sur
 * l'archive sans savoir qu'il ne lit pas la table courante.
 */
function versLigneCourante(l: LigneArchive): TaEloRow {
  return {
    ta_name: l.ta_name,
    ta_name_normalized: l.ta_name_normalized,
    ta_slug: l.ta_slug,
    country: null, // la page Elo n'en publie pas (cf. migration 0003)
    tour: l.tour,
    elo_overall: l.elo_overall,
    elo_hard: l.elo_hard,
    elo_clay: l.elo_clay,
    elo_grass: l.elo_grass,
    atp_rank: l.atp_rank,
    updated_at: l.releve_le,
  };
}

/** L'Elo d'un circuit tel qu'il était avant une date. */
export interface EloALaDate {
  /** Date demandée (YYYY-MM-DD), exclue. */
  avantLe: string;
  /** Index de rapprochement, utilisable par `resoudreElos`. */
  index: IndexElo;
  /** Joueurs disponibles à cette date. */
  joueurs: number;
  /** Relevé le plus récent utilisé — l'âge de la photo la plus fraîche. */
  releveLePlusRecent: string | null;
}

/**
 * Lecteur d'Elo antérieurs, avec ses caches.
 *
 * Instancié par appelant (un affichage d'écran, une passe de backfill) plutôt
 * que partagé au niveau du module : un cache global survivrait à un import
 * d'Elo et servirait des valeurs périmées. Ici, il vit le temps du calcul et
 * évite seulement de relire l'archive une fois par match.
 */
export interface LecteurEloAnterieur {
  /**
   * Elo du circuit avant `date`. `null` si l'archive ne contient rien
   * d'antérieur : le match n'est PAS évaluable proprement, et l'appelant doit
   * le signaler, pas le remplacer par l'Elo courant.
   */
  avant(tour: Tour, date: string | null): Promise<EloALaDate | null>;
}

/** Ramène une date ISO (avec ou sans heure) à sa seule partie calendaire. */
function jour(date: string): string {
  return date.slice(0, 10);
}

export function creerLecteurEloAnterieur(): LecteurEloAnterieur {
  const sb = supabaseAnon();

  // Relevé le plus ancien de l'archive, par circuit. Répond sans requête à la
  // question « ce tournoi est-il antérieur à toute l'archive ? », vraie pour
  // tout ce qui est déjà en base — sans lui, chaque tournoi du backfill
  // coûterait un aller-retour pour s'entendre dire non.
  const debutArchive = new Map<string, Promise<string | null>>();
  const parDate = new Map<string, Promise<EloALaDate | null>>();
  // Exceptions de nom : courantes, pas historisées. Ce sont des règles de
  // rapprochement (« Y. Bu » = « Bu Yunchaokete »), pas des valeurs : les
  // dater n'aurait pas de sens.
  let exceptions: Promise<ExceptionRow[]> | null = null;

  async function lireExceptions(): Promise<ExceptionRow[]> {
    const { data, error } = await sb
      .from('ta_name_exceptions')
      .select('atp_name_normalized, ta_name_normalized, ta_slug, tour');
    if (error && error.code !== '42P01') {
      throw new Error(`ta_name_exceptions : ${error.message}`);
    }
    return (data ?? []) as ExceptionRow[];
  }

  async function chargerExceptions(t: string): Promise<ExceptionRow[]> {
    exceptions ??= lireExceptions();
    return (await exceptions).filter((e) => e.tour === t);
  }

  async function lirePremierReleve(t: string): Promise<string | null> {
    const { data, error } = await sb
      .from('ta_elo_historique')
      .select('releve_le')
      .eq('tour', t)
      .order('releve_le', { ascending: true })
      .limit(1);
    // 42P01 : migration 0010 pas encore jouée. L'app doit continuer de
    // fonctionner — sans évaluation propre, mais sans planter.
    if (error) {
      if (error.code === '42P01') return null;
      throw new Error(`ta_elo_historique : ${error.message}`);
    }
    return (data?.[0]?.releve_le as string | undefined) ?? null;
  }

  function premierReleve(t: string): Promise<string | null> {
    const p = debutArchive.get(t);
    if (p) return p;
    const q = lirePremierReleve(t);
    debutArchive.set(t, q);
    return q;
  }

  async function charger(t: string, avantLe: string): Promise<EloALaDate | null> {
    // PostgREST plafonne une réponse à 1000 lignes et un rapport en compte
    // déjà ~550 : la pagination n'est pas une précaution de style, c'est ce
    // qui empêche l'index d'être silencieusement tronqué le jour où
    // l'archive dépasse le seuil.
    const taille = 1000;
    const lignes: LigneArchive[] = [];
    for (let debut = 0; ; debut += taille) {
      const { data, error } = await sb
        .rpc('ta_elo_a_la_date', { p_tour: t, p_date: avantLe })
        .range(debut, debut + taille - 1);
      if (error) {
        // 42883 : fonction inexistante — même raison que 42P01 ci-dessus.
        if (error.code === '42P01' || error.code === '42883') return null;
        throw new Error(`ta_elo_a_la_date : ${error.message}`);
      }
      const page = (data ?? []) as LigneArchive[];
      lignes.push(...page);
      if (page.length < taille) break;
    }

    if (lignes.length === 0) return null;

    return {
      avantLe,
      index: construireIndex(
        lignes.map(versLigneCourante),
        await chargerExceptions(t),
      ),
      joueurs: lignes.length,
      releveLePlusRecent: lignes.reduce<string | null>(
        (max, l) => (max === null || l.releve_le > max ? l.releve_le : max),
        null,
      ),
    };
  }

  return {
    async avant(tour, date) {
      if (!date) return null;
      const t = tour.toLowerCase();
      const j = jour(date);

      // Rien d'antérieur dans l'archive : inutile d'interroger la fonction.
      const debut = await premierReleve(t);
      if (debut === null || j <= debut) return null;

      const cle = `${t}|${j}`;
      const cache = parDate.get(cle);
      if (cache) return cache;

      const p = charger(t, j);
      parDate.set(cle, p);
      return p;
    },
  };
}

/**
 * Elo Tennis Abstract d'un joueur dans un état daté.
 *
 * Renvoie `null` dès que la source n'est pas Tennis Abstract, et c'est
 * volontaire : les replis de la cascade (`resoudreElos`) ne sont PAS
 * utilisables ici.
 *   - l'Elo maison (colonnes `elo_*` de `tn_players`) est recalculé sur les
 *     matchs importés — il contient donc le résultat qu'on cherche à prédire,
 *     exactement le biais qu'on retire ;
 *   - l'Elo par défaut n'est pas un Elo, seulement une valeur de remplissage
 *     identique pour tous.
 * Un joueur sans Elo antérieur doit se signaler, pas se remplir.
 */
export function eloAnterieur(
  joueur: JoueurAResoudre,
  etat: EloALaDate | null,
): ElosResolus | null {
  if (!etat) return null;
  const e = resoudreElos(joueur, etat.index ?? INDEX_ELO_VIDE);
  return e.source === 'ta' ? e : null;
}
