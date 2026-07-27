/**
 * RAPPROCHEMENT DES NOMS DE JOUEURS — ATP ↔ TENNIS ABSTRACT
 *
 * Les tableaux ATP portent un ID officiel (`GC88`) et un nom court
 * (« M. Giron »). Tennis Abstract ne publie aucun ID : seulement un nom
 * complet, accents et traits d'union déjà retirés (« Marcos Giron »).
 * Le seul point commun exploitable est donc le nom, qu'il faut réduire à une
 * forme canonique commune aux deux sources.
 *
 * Clé canonique : INITIALE DU PRÉNOM + NOM COLLÉ.
 *   « J. Sinner » et « Jannik Sinner »                 → « j sinner »
 *   « F. Auger-Aliassime » / « Felix Auger Aliassime » → « f augeraliassime »
 *
 * Deux divergences résistent à cette seule clé, mesurées sur les 544 joueurs
 * du rapport ATP et les joueurs déjà en base :
 *
 *   1. SECONDS PRÉNOMS — TA écrit « Juan Manuel Cerundolo », l'ATP
 *      « J. Cerundolo ». La clé canonique donne « j manuelcerundolo » ≠
 *      « j cerundolo ».
 *   2. NOMS COMPOSÉS TRONQUÉS — TA écrit « Daniel Merida Aguilar », l'ATP
 *      « D. Merida ».
 *
 * On génère donc plusieurs clés candidates par nom, de la plus spécifique à
 * la plus lâche, et on ne retient une correspondance que si la clé essayée
 * désigne UN SEUL joueur. Une clé ambiguë (« a martin » = Andrej Martin ET
 * Andres Martin) ne produit aucune correspondance : le joueur retombe sur son
 * Elo maison et apparaît dans la liste à compléter dans `ta_name_exceptions`,
 * plutôt que d'hériter silencieusement de l'Elo d'un homonyme.
 */

/** Espace insécable, diacritiques combinants, apostrophes typographiques. */
const NBSP = /&nbsp;| /g;
const DIACRITIQUES = /[̀-ͯ]/g;
const APOSTROPHES_ET_TIRETS = /['`‘’ʼ-]/g;

/** Découpe un nom en jetons alphanumériques minuscules, sans diacritiques. */
function jetons(nom: string): string[] {
  return String(nom ?? '')
    // Tennis Abstract sépare les mots par des espaces insécables.
    .replace(NBSP, ' ')
    .normalize('NFD')
    .replace(DIACRITIQUES, '')
    .toLowerCase()
    // Traits d'union et apostrophes disparaissent : « auger-aliassime » →
    // « augeraliassime », « o'connell » → « oconnell ». TA les a déjà retirés.
    .replace(APOSTROPHES_ET_TIRETS, '')
    // Le point d'une initiale est un séparateur, pas une lettre : « J.M. » → « j m ».
    .replace(/\./g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Clé canonique d'un nom : initiale du prénom + tout le reste collé.
 * C'est elle qui est stockée dans `ta_elo.ta_name_normalized` et dans les
 * deux colonnes de `ta_name_exceptions`.
 */
export function normaliserNom(nom: string): string {
  const t = jetons(nom);
  if (t.length === 0) return '';
  if (t.length === 1) return t[0];
  return `${t[0][0]} ${t.slice(1).join('')}`;
}

/**
 * Clés candidates d'un nom, de la plus spécifique à la plus lâche.
 * La première est toujours la clé canonique.
 */
export function clesCandidates(nom: string): string[] {
  const t = jetons(nom);
  if (t.length === 0) return [];
  if (t.length === 1) return [t[0]];

  const initiale = t[0][0];
  const cles = [`${initiale} ${t.slice(1).join('')}`];

  // Second prénom côté TA : on ne garde que le dernier jeton.
  const dernier = `${initiale} ${t[t.length - 1]}`;
  if (!cles.includes(dernier)) cles.push(dernier);

  // Nom composé tronqué côté ATP : on ne garde que le premier jeton du nom.
  // Restreint aux noms de 3 jetons — au-delà, le 2e jeton est presque
  // toujours un second prénom (« Juan Carlos Prado Angelo »), et la clé
  // produite serait un prénom.
  if (t.length === 3) {
    const premier = `${initiale} ${t[1]}`;
    if (!cles.includes(premier)) cles.push(premier);
  }

  return cles;
}

/** Ligne indexable : tout objet portant le nom TA et sa clé canonique. */
export interface LigneTa {
  ta_name: string;
  ta_name_normalized: string;
}

export interface IndexTa<T extends LigneTa> {
  /** Clé canonique → ligne. */
  parCle: Map<string, T>;
  /** Clé candidate (toutes variantes) → lignes. Une clé ambiguë en a plusieurs. */
  parVariante: Map<string, T[]>;
  /** atp_name_normalized → ta_name_normalized. */
  exceptions: Map<string, string>;
}

/**
 * Construit l'index de rapprochement.
 * @param lignes      Lignes `ta_elo` d'un circuit.
 * @param exceptions  Lignes `ta_name_exceptions` du même circuit.
 */
export function construireIndex<T extends LigneTa>(
  lignes: T[],
  exceptions: { atp_name_normalized: string; ta_name_normalized: string }[] = [],
): IndexTa<T> {
  const parCle = new Map<string, T>();
  const parVariante = new Map<string, T[]>();

  for (const l of lignes) {
    parCle.set(l.ta_name_normalized, l);
    for (const c of clesCandidates(l.ta_name)) {
      const bucket = parVariante.get(c);
      if (bucket) {
        if (!bucket.includes(l)) bucket.push(l);
      } else {
        parVariante.set(c, [l]);
      }
    }
  }

  return {
    parCle,
    parVariante,
    exceptions: new Map(
      exceptions.map((e) => [e.atp_name_normalized, e.ta_name_normalized]),
    ),
  };
}

export interface Correspondance<T> {
  ligne: T;
  /** Clé qui a permis le rapprochement — utile pour diagnostiquer un faux positif. */
  via: string;
  /** true si la correspondance vient de `ta_name_exceptions`. */
  exception: boolean;
}

/**
 * Cherche la ligne Tennis Abstract correspondant à un nom ATP.
 *
 * Ordre : exception déclarée, puis clés candidates de la plus spécifique à la
 * plus lâche. Une clé qui désigne plusieurs joueurs est ignorée (ambiguë).
 * Retourne null si rien ne correspond — l'appelant retombe sur l'Elo maison.
 */
export function chercherCorrespondance<T extends LigneTa>(
  index: IndexTa<T>,
  nomAtp: string,
): Correspondance<T> | null {
  const canonique = normaliserNom(nomAtp);

  const forcee = index.exceptions.get(canonique);
  if (forcee) {
    const ligne = index.parCle.get(forcee);
    if (ligne) return { ligne, via: forcee, exception: true };
    // Exception pointant vers un nom TA absent du rapport : on ne s'arrête pas
    // là, le rapprochement automatique reste la meilleure chance.
  }

  for (const cle of clesCandidates(nomAtp)) {
    const bucket = index.parVariante.get(cle);
    if (bucket?.length === 1) return { ligne: bucket[0], via: cle, exception: false };
  }

  return null;
}
