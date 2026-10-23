/**
 * ELO MAISON — identités des joueurs (module PUR : ni Next, ni Supabase).
 *
 * Deux problèmes que le seul rapprochement par nom (lib/matching.ts) ne règle pas avec les
 * lignes de `tn_elo_maison` :
 *
 *  1. HOMONYMES. La clé « initiale + nom » désigne souvent plusieurs joueurs (« A. Popyrin » :
 *     Alexei, 534 matchs, et Anthony, 3 matchs). Tennis Abstract, lui, a `ta_name_exceptions`
 *     (ta_slug à la main) ; la table maison, elle, porte le pays, le nombre de matchs et le
 *     dernier jour joué, qui permettent de trancher SANS intervention humaine dans les cas
 *     nets — et seulement ceux-là. Un cas douteux reste « ambigu » (jamais de choix au hasard).
 *
 *  2. ÉCHELLE. L'Elo d'un joueur INCONNU doit être de la même famille que les autres : les
 *     colonnes `elo_*` de tn_elo_maison ont leur propre échelle (médiane des joueurs d'un
 *     tableau ≈ 2100 ATP / 2200 WTA, leaders > 2600), très au-dessus de Tennis Abstract
 *     (médiane ≈ 1700, leaders ≈ 2300). Le défaut de 1650, bon pour TA, y serait le niveau
 *     d'un joueur de bas de classement Challenger.
 *
 * Mesures : recherche/elo-maison/diagnostic-echelle.mts (23/10/2026). À refaire si les
 * paramètres de lib/eloMaison.ts changent.
 */

/**
 * Elo (colonnes `elo_*`, échelle maison) d'un joueur absent de la table : ≈ 25e centile des
 * joueurs réellement présents dans les tableaux de l'app (ATP 2006, WTA 2113 au 23/10/2026).
 * Même rang relatif que le 1650 de Tennis Abstract (≈ 35e centile, médiane 1696) : un joueur
 * inconnu du circuit est plutôt un qualifié ou un invité qu'un joueur médian.
 */
export const ELO_DEFAUT_MAISON = { atp: 2000, wta: 2100 } as const;

/** Codes pays écrits différemment par l'archive (IOC) et l'API pour un même pays. */
const ALIAS_PAYS: Record<string, string> = { LBN: 'LIB', TWN: 'TPE', DEU: 'GER', HOL: 'NED' };
export const normPays = (p: string | null | undefined): string => (p ? (ALIAS_PAYS[p.toUpperCase()] ?? p.toUpperCase()) : '');

/** Ce que la résolution lit d'une ligne candidate. */
export interface CandidatIdentite {
  ta_slug: string;
  country?: string | null;
  /** Matchs joués (tn_elo_maison.n). */
  n?: number | null;
  /** Jour (depuis 1970) du dernier match (tn_elo_maison.dernier_jour). */
  dernier_jour?: number | null;
}

/** Seuils de la règle « candidat dominant » (cf. departagerHomonymes). */
export const DOMINANT_MIN_MATCHS = 30;
export const DOMINANT_RAPPORT = 4;
export const DOMINANT_ECART_JOURS = 30;
export const DOMINANT_INACTIF_JOURS = 400;

/**
 * Tranche des homonymes, ou renvoie null (reste ambigu).
 *
 *  1. Pays du joueur connu : s'il désigne UN seul candidat, c'est lui ; s'il en désigne
 *     plusieurs, la suite ne regarde qu'eux ; s'il n'en désigne aucun, il est ignoré
 *     (changement de nationalité, code pays différent).
 *  2. Candidat dominant : un seul candidat a au moins 30 matchs ET au moins 4 fois plus de
 *     matchs que le suivant, ET il a joué dans les 400 derniers jours, ET il est parmi les
 *     plus récents (dernier match à 30 jours du plus récent des candidats). Sinon les
 *     homonymes sont de poids comparable — ou le plus gros est un fantôme : on ne devine pas.
 *
 * @param aujourdhui  jour courant (depuis 1970), paramètre pour rester pur et testable.
 */
export function departagerHomonymes<T extends CandidatIdentite>(
  candidats: T[],
  pays: string | null | undefined,
  aujourdhui: number,
): T | null {
  if (candidats.length < 2) return candidats[0] ?? null;

  let pool = candidats;
  if (pays) {
    const memePays = candidats.filter((c) => c.country && normPays(c.country) === normPays(pays));
    if (memePays.length === 1) return memePays[0];
    if (memePays.length > 1) pool = memePays;
  }

  if (pool.some((c) => c.n == null || c.dernier_jour == null)) return null;
  const tries = [...pool].sort((a, b) => (b.n ?? 0) - (a.n ?? 0));
  const [premier, second] = tries;
  if ((premier.n ?? 0) < DOMINANT_MIN_MATCHS) return null;
  if ((premier.n ?? 0) < DOMINANT_RAPPORT * (second.n ?? 0)) return null;
  const dernierVu = Math.max(...pool.map((c) => c.dernier_jour ?? 0));
  if (aujourdhui - (premier.dernier_jour ?? 0) > DOMINANT_INACTIF_JOURS) return null;
  if (dernierVu - (premier.dernier_jour ?? 0) > DOMINANT_ECART_JOURS) return null;
  return premier;
}
