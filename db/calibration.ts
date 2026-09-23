import 'server-only';
import { supabaseAnon } from './anon';
import {
  chargerIndexElo,
  eloEffectifResolu,
  resoudreElos,
  type ElosResolus,
  type IndexElo,
} from './elo';
import { surfacePourElo, type PlayerRow, type TournamentRow } from './queries';
import type { Tour } from '@/lib/types';

/**
 * CALIBRATION DE LA COURBE ELO → PROBABILITÉ
 *
 * Le moteur convertit un écart d'Elo en probabilité de victoire par la
 * logistique standard : P = 1 / (1 + 10^(−Δ/400)). La constante 400 vient des
 * échecs et n'a jamais été vérifiée sur du tennis. On la mesure ici sur les
 * matchs réellement joués.
 *
 * ⚠ MESURE SEULEMENT. Rien n'est modifié dans `lib/elo.ts` : la fonction
 * `pVictoire` du moteur reste en 400. Ce module produit un constat, à regarder,
 * pas un réglage à appliquer tout seul.
 *
 * ── Ce que cette mesure vaut, et ce qu'elle ne vaut pas ──────────────────────
 *
 * On utilise les Elo ACTUELS, pas ceux du jour du match. Ce n'est PAS un biais
 * neutre : l'Elo d'aujourd'hui intègre le résultat du match qu'on cherche à
 * prédire. Le vainqueur d'un match en est ressorti avec un Elo relevé, le
 * perdant abaissé — si bien qu'a posteriori le « favori » d'une affiche est en
 * partie désigné PAR son résultat.
 *
 * La conséquence a un sens connu : la fréquence de victoire du favori est
 * surestimée, donc la courbe paraît plus raide qu'elle ne l'est, donc la
 * constante ajustée ressort plus BASSE que la vraie. Tout écart mesuré sous
 * 400 doit se lire avec cette réserve — une part en revient à la circularité,
 * pas au tennis.
 *
 * L'ampleur reste limitée : les Elo Tennis Abstract sont calculés sur 52
 * semaines de circuit (tour-level, qualifications, challengers, ITF 50K+), un
 * match n'y pèse qu'une fraction. Mais la direction, elle, est certaine, et
 * seule une reconstitution des Elo à la date du match la lèverait.
 *
 * Deux exclusions, en revanche, ne sont pas cosmétiques :
 *   - un joueur en Elo « défaut » n'a pas d'Elo du tout, seulement une valeur
 *     de remplissage identique pour tous. Deux joueurs par défaut donnent
 *     Δ = 0 et un résultat de pile ou face, qui atterrirait dans la tranche
 *     0-25 et l'aplatirait mécaniquement vers 50 % ;
 *   - une égalité stricte d'Elo ne désigne aucun favori : le résultat n'est
 *     alors informatif dans aucun sens.
 * Les deux sont comptés et rapportés, pas silencieusement jetés.
 */

/** En dessous, une fréquence observée n'est que du bruit. */
export const SEUIL_SIGNIFICATIF = 20;

/** Constantes explicitement demandées à la comparaison. */
export const CONSTANTES_TESTEES = [300, 350, 400, 450, 500];

/** Celle qu'utilise le moteur aujourd'hui (`pVictoire`, lib/elo.ts). */
export const CONSTANTE_MOTEUR = 400;

const BORNES: { min: number; max: number | null }[] = [
  { min: 0, max: 25 },
  { min: 25, max: 50 },
  { min: 50, max: 75 },
  { min: 75, max: 100 },
  { min: 100, max: 150 },
  { min: 150, max: 200 },
  { min: 200, max: 300 },
  { min: 300, max: null },
];

/** Logistique du moteur, généralisée à une constante quelconque. */
export function pVictoirePourConstante(delta: number, constante: number): number {
  return 1 / (1 + Math.pow(10, -delta / constante));
}

export interface TrancheCalibration {
  libelle: string;
  matchs: number;
  /** Écart moyen RÉELLEMENT observé dans la tranche. */
  deltaMoyen: number;
  /** Fréquence de victoire du joueur au plus haut Elo effectif. */
  pReelle: number;
  /** Erreur type de cette fréquence — √(p(1−p)/n). */
  erreurType: number;
  /** P prédite par la formule en 400, évaluée sur `deltaMoyen`. */
  pPredite: number;
  /** pReelle − pPredite. Positif : le favori gagne plus que prévu. */
  ecart: number;
  /** Au moins SEUIL_SIGNIFICATIF matchs. Les autres sont exclus de l'ajustement. */
  significatif: boolean;
}

export interface ConstanteEvaluee {
  constante: number;
  /** Somme des carrés des écarts sur les tranches significatives. */
  sse: number;
  /** Même somme, chaque tranche pesant son nombre de matchs. */
  ssePondere: number;
}

export interface Calibration {
  /** Matchs terminés lus en base (completed + retired). */
  matchsCharges: number;
  /** Matchs effectivement analysés. */
  matchsRetenus: number;
  exclusDonneesIncompletes: number;
  exclusEloDefaut: number;
  exclusEgalite: number;
  /** Matchs dont les DEUX joueurs ont un Elo Tennis Abstract. */
  matchsDeuxEloTa: number;
  tranches: TrancheCalibration[];
  constantes: ConstanteEvaluee[];
  /** Meilleure des constantes testées, moindres carrés simples. */
  meilleure: number;
  /** Meilleure des constantes testées, moindres carrés pondérés par l'effectif. */
  meilleurePonderee: number;
  /** Minimum sur un balayage fin, pour situer l'optimum entre deux paliers. */
  optimumFin: number;
  optimumFinPondere: number;
  seuilSignificatif: number;
  constanteMoteur: number;
}

interface MatchCalibration {
  tournament_id: string;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  status: string;
}

/**
 * Lit une table entière, par pages.
 *
 * PostgREST plafonne une réponse à 1000 lignes : une lecture simple
 * tronquerait silencieusement le corpus, et une calibration sur un
 * sous-ensemble arbitraire des matchs ne voudrait rien dire.
 */
async function lireTout<T>(table: string, colonnes: string): Promise<T[]> {
  const sb = supabaseAnon();
  const taille = 1000;
  const out: T[] = [];
  for (let debut = 0; ; debut += taille) {
    const { data, error } = await sb
      .from(table)
      .select(colonnes)
      .range(debut, debut + taille - 1);
    if (error) throw new Error(`${table} : ${error.message}`);
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < taille) return out;
  }
}

/**
 * Mesure la calibration de la courbe sur tous les matchs terminés en base.
 */
export async function calibrerElo(): Promise<Calibration> {
  const [matchs, tournois, joueurs] = await Promise.all([
    lireTout<MatchCalibration>(
      'tn_matches',
      'tournament_id, player1_id, player2_id, winner_id, status',
    ),
    lireTout<TournamentRow>('tn_tournaments', 'id, surface, tour'),
    lireTout<PlayerRow>(
      'tn_players',
      'id, tour, name, rank, elo_overall, elo_hard, elo_clay, elo_grass',
    ),
  ]);

  // Un match n'est informatif que si le résultat s'est joué sur le court :
  // walkovers et byes sont écartés, comme dans le calcul d'Elo lui-même.
  const termines = matchs.filter(
    (m) => m.status === 'completed' || m.status === 'retired',
  );

  const tournoiDe = new Map(tournois.map((t) => [t.id, t]));
  const joueurDe = new Map(joueurs.map((p) => [p.id, p]));

  // Un index Elo par circuit : un tableau WTA ne doit jamais être rapproché
  // des joueurs du circuit masculin.
  const index: Record<Tour, IndexElo> = {
    ATP: await chargerIndexElo('ATP'),
    WTA: await chargerIndexElo('WTA'),
  };

  // Le rapprochement de noms est coûteux et ne dépend pas du match : on le
  // fait une fois par joueur.
  const resolus = new Map<string, ElosResolus>();
  const resoudre = (id: string): ElosResolus | null => {
    const cache = resolus.get(id);
    if (cache) return cache;
    const p = joueurDe.get(id);
    if (!p) return null;
    const e = resoudreElos(p, index[p.tour] ?? index.ATP);
    resolus.set(id, e);
    return e;
  };

  let exclusDonneesIncompletes = 0;
  let exclusEloDefaut = 0;
  let exclusEgalite = 0;
  let matchsDeuxEloTa = 0;

  const cumuls = BORNES.map(() => ({ n: 0, victoires: 0, sommeDelta: 0 }));

  for (const m of termines) {
    const t = m.tournament_id ? tournoiDe.get(m.tournament_id) : undefined;
    if (!t || !m.player1_id || !m.player2_id || !m.winner_id) {
      exclusDonneesIncompletes++;
      continue;
    }
    if (m.winner_id !== m.player1_id && m.winner_id !== m.player2_id) {
      exclusDonneesIncompletes++;
      continue;
    }

    const e1 = resoudre(m.player1_id);
    const e2 = resoudre(m.player2_id);
    if (!e1 || !e2) {
      exclusDonneesIncompletes++;
      continue;
    }

    // Un Elo « défaut » n'est pas un Elo : c'est la même valeur pour tous les
    // joueurs inconnus des deux sources. Le garder reviendrait à injecter des
    // pile ou face dans les tranches basses.
    if (e1.source === 'defaut' || e2.source === 'defaut') {
      exclusEloDefaut++;
      continue;
    }
    if (e1.source === 'ta' && e2.source === 'ta') matchsDeuxEloTa++;

    // Elo effectif : exactement celui de la simulation (surface pondérée 0.6).
    const surface = surfacePourElo(t.surface);
    const v1 = eloEffectifResolu(e1, surface);
    const v2 = eloEffectifResolu(e2, surface);
    const delta = Math.abs(v1 - v2);

    if (delta === 0) {
      exclusEgalite++;
      continue;
    }

    // LE FAVORI EST CELUI AU PLUS HAUT ELO EFFECTIF — pas la tête de série,
    // pas le mieux classé. C'est la prédiction du moteur qu'on teste.
    const favoriId = v1 > v2 ? m.player1_id : m.player2_id;

    const i = BORNES.findIndex(
      (b) => delta >= b.min && (b.max === null || delta < b.max),
    );
    if (i < 0) continue;

    cumuls[i].n++;
    cumuls[i].sommeDelta += delta;
    if (m.winner_id === favoriId) cumuls[i].victoires++;
  }

  const tranches: TrancheCalibration[] = BORNES.map((b, i) => {
    const c = cumuls[i];
    const pReelle = c.n > 0 ? c.victoires / c.n : 0;
    // La formule est évaluée sur l'écart MOYEN observé, pas sur le centre
    // nominal : la dernière tranche est ouverte (300+) et n'a pas de centre,
    // et une tranche large n'est pas forcément peuplée uniformément.
    const deltaMoyen = c.n > 0 ? c.sommeDelta / c.n : 0;
    const pPredite = pVictoirePourConstante(deltaMoyen, CONSTANTE_MOTEUR);
    return {
      libelle: b.max === null ? `${b.min}+` : `${b.min}–${b.max}`,
      matchs: c.n,
      deltaMoyen,
      pReelle,
      erreurType: c.n > 0 ? Math.sqrt((pReelle * (1 - pReelle)) / c.n) : 0,
      pPredite,
      ecart: pReelle - pPredite,
      significatif: c.n >= SEUIL_SIGNIFICATIF,
    };
  });

  // L'ajustement ne porte que sur les tranches significatives : une tranche à
  // 3 matchs vaut 0 %, 33 % ou 100 % et tirerait n'importe quelle constante.
  const retenues = tranches.filter((t) => t.significatif);

  const evaluer = (constante: number): ConstanteEvaluee => {
    let sse = 0;
    let ssePondere = 0;
    for (const t of retenues) {
      const d = t.pReelle - pVictoirePourConstante(t.deltaMoyen, constante);
      sse += d * d;
      ssePondere += t.matchs * d * d;
    }
    return { constante, sse, ssePondere };
  };

  const constantes = CONSTANTES_TESTEES.map(evaluer);
  const argmin = (
    liste: ConstanteEvaluee[],
    cle: 'sse' | 'ssePondere',
  ): number =>
    liste.reduce((a, b) => (b[cle] < a[cle] ? b : a), liste[0]).constante;

  // Balayage fin : les cinq valeurs demandées sont espacées de 50, l'optimum
  // réel tombe rarement pile dessus. Sert à savoir de combien on s'en écarte.
  const fin: ConstanteEvaluee[] = [];
  for (let c = 200; c <= 900; c += 5) fin.push(evaluer(c));

  return {
    matchsCharges: termines.length,
    matchsRetenus: cumuls.reduce((s, c) => s + c.n, 0),
    exclusDonneesIncompletes,
    exclusEloDefaut,
    exclusEgalite,
    matchsDeuxEloTa,
    tranches,
    constantes,
    meilleure: retenues.length ? argmin(constantes, 'sse') : CONSTANTE_MOTEUR,
    meilleurePonderee: retenues.length
      ? argmin(constantes, 'ssePondere')
      : CONSTANTE_MOTEUR,
    optimumFin: retenues.length ? argmin(fin, 'sse') : CONSTANTE_MOTEUR,
    optimumFinPondere: retenues.length
      ? argmin(fin, 'ssePondere')
      : CONSTANTE_MOTEUR,
    seuilSignificatif: SEUIL_SIGNIFICATIF,
    constanteMoteur: CONSTANTE_MOTEUR,
  };
}
