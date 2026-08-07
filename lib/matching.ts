/**
 * RAPPROCHEMENT DES NOMS DE JOUEURS — ATP / WTA ↔ TENNIS ABSTRACT
 *
 * Le module est indifférent au circuit : il travaille sur l'index qu'on lui
 * donne, et `chargerIndexElo` n'y met que les lignes `ta_elo` du circuit du
 * tournoi. Les deux ne se croisent donc jamais.
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
 * désigne UN SEUL joueur.
 *
 * Le circuit féminin ajoute une troisième source d'écart, les noms composés
 * (« Beatriz Haddad Maia », « Maria Camila Osorio Serrano ») : la clé lâche du
 * dernier jeton et celle du premier jeton du nom les couvrent aux mêmes
 * conditions que côté masculin, le reste relève de `ta_name_exceptions`.
 *
 * HOMONYMES — « a martin » désigne Andrej Martin (SVK) ET Andres Martin (USA),
 * « d blanch » Darwin ET Dali Blanch. Le rapport Elo ne publie pas le pays :
 * rien dans la source ne permet de trancher. Le rapprochement renvoie alors
 * `ambigu` avec la liste des candidats, l'écran Picks le signale, et
 * l'utilisateur déclare le bon `ta_slug` dans `ta_name_exceptions`.
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

/**
 * Ligne indexable.
 *
 * `ta_slug` est l'IDENTITÉ (player.cgi?p=AndresMartin), `ta_name_normalized`
 * la clé de RAPPROCHEMENT. Les deux ne se confondent pas : deux homonymes
 * partagent la clé et se distinguent par le slug.
 */
export interface LigneTa {
  ta_name: string;
  ta_name_normalized: string;
  ta_slug: string;
}

/** Exception de correspondance : vise un slug, ou à défaut une clé. */
export interface ExceptionNom {
  atp_name_normalized: string;
  ta_slug?: string | null;
  ta_name_normalized?: string | null;
}

export interface IndexTa<T extends LigneTa> {
  /** Slug → ligne. Identité, donc toujours unique. */
  parSlug: Map<string, T>;
  /** Clé candidate (toutes variantes) → lignes. Une clé ambiguë en a plusieurs. */
  parVariante: Map<string, T[]>;
  /** atp_name_normalized → cible de l'exception. */
  exceptions: Map<string, ExceptionNom>;
}

/**
 * Construit l'index de rapprochement.
 * @param lignes      Lignes `ta_elo` d'un circuit.
 * @param exceptions  Lignes `ta_name_exceptions` du même circuit.
 */
export function construireIndex<T extends LigneTa>(
  lignes: T[],
  exceptions: ExceptionNom[] = [],
): IndexTa<T> {
  const parSlug = new Map<string, T>();
  const parVariante = new Map<string, T[]>();

  for (const l of lignes) {
    parSlug.set(l.ta_slug, l);
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
    parSlug,
    parVariante,
    exceptions: new Map(exceptions.map((e) => [e.atp_name_normalized, e])),
  };
}

/**
 * Issue d'un rapprochement.
 *
 * `ambigu` est un résultat à part entière, pas un échec : plusieurs joueurs
 * Tennis Abstract portent ce nom et RIEN ne permet de trancher (le rapport ne
 * publie pas le pays). Choisir au hasard donnerait un Elo faux et silencieux ;
 * on remonte donc les candidats pour que l'utilisateur déclare une exception.
 */
export type Resolution<T> =
  | { statut: 'trouve'; ligne: T; via: string; exception: boolean }
  | { statut: 'ambigu'; candidats: T[]; via: string }
  | { statut: 'absent' };

/**
 * Cherche la ligne Tennis Abstract correspondant à un nom ATP.
 *
 * Ordre : exception déclarée (par slug, ou par clé pour les anciennes lignes),
 * puis clés candidates de la plus spécifique à la plus lâche.
 */
export function chercherCorrespondance<T extends LigneTa>(
  index: IndexTa<T>,
  nomAtp: string,
): Resolution<T> {
  const canonique = normaliserNom(nomAtp);

  const forcee = index.exceptions.get(canonique);
  if (forcee?.ta_slug) {
    const ligne = index.parSlug.get(forcee.ta_slug);
    if (ligne) return { statut: 'trouve', ligne, via: forcee.ta_slug, exception: true };
    // Slug absent du rapport (joueur sorti de la liste, ou faute de frappe) :
    // on ne s'arrête pas là, le rapprochement automatique reste une chance.
  }
  if (forcee?.ta_name_normalized) {
    const bucket = index.parVariante.get(forcee.ta_name_normalized);
    if (bucket?.length === 1) {
      return {
        statut: 'trouve',
        ligne: bucket[0],
        via: forcee.ta_name_normalized,
        exception: true,
      };
    }
  }

  for (const cle of clesCandidates(nomAtp)) {
    const bucket = index.parVariante.get(cle);
    if (!bucket || bucket.length === 0) continue;
    if (bucket.length === 1) {
      return { statut: 'trouve', ligne: bucket[0], via: cle, exception: false };
    }
    // Plusieurs joueurs sous cette clé. Inutile d'essayer les clés plus
    // lâches : elles ne peuvent que ramener au moins les mêmes candidats.
    return { statut: 'ambigu', candidats: bucket, via: cle };
  }

  return { statut: 'absent' };
}

/* -------------------------------------------------------------------------- */
/*  CAS PARTICULIER : LES JOUEURS D'UN TABLEAU                                 */
/* -------------------------------------------------------------------------- */

/**
 * Rapprocher un nom d'une source externe (The Odds API) des joueurs d'un
 * tableau est le même problème, avec une autre identité : ce n'est plus un
 * slug Tennis Abstract mais l'ID officiel du joueur. Les deux fonctions qui
 * suivent ne font que présenter ces joueurs au module sous la forme qu'il
 * attend, et vivent ici pour être utilisables hors du serveur — c'est ce qui
 * permet de rejouer l'appariement sur des lignes déjà en cache, sans rappeler
 * l'API (cf. scripts/reapparier-cotes.mts).
 */

/** Joueur d'un tableau, indexable. Son ID lui sert d'identité. */
export interface JoueurIndexe extends LigneTa {
  id: string;
}

/**
 * Indexe les joueurs d'un tableau. On récupère telles quelles les clés
 * candidates ci-dessus (initiale + nom, seconds prénoms, noms composés
 * tronqués) qui rapprochent déjà « J. Sinner » de « Jannik Sinner ».
 *
 * Aucune exception n'est passée : `ta_name_exceptions` vise des slugs Tennis
 * Abstract, pas des IDs de joueurs — les deux espaces d'identité ne se
 * recouvrent pas.
 */
export function indexerJoueursTableau(
  joueurs: { id: string; name: string }[],
): IndexTa<JoueurIndexe> {
  const lignes: JoueurIndexe[] = joueurs.map((p) => ({
    id: p.id,
    ta_name: p.name,
    ta_name_normalized: normaliserNom(p.name),
    ta_slug: p.id,
  }));
  return construireIndex(lignes);
}

/** Pourquoi un nom n'a pas été rattaché à un joueur du tableau. */
export interface EchecAppariement {
  nom: string;
  raison: 'absent' | 'ambigu';
  /** Noms des joueurs candidats, quand la clé en désigne plusieurs. */
  candidats?: string[];
}

/**
 * Rattache un nom externe à un joueur du tableau.
 *
 * `ambigu` n'est pas rabattu sur un choix par défaut : deux joueuses partageant
 * la clé (« X. Wang »), rien dans le seul nom ne permet de trancher. Un mauvais
 * lien serait silencieux et fausserait la mesure ; un NULL, lui, se voit.
 */
export function apparierNom(
  index: IndexTa<JoueurIndexe>,
  nom: string,
): { id: string | null; echec?: EchecAppariement } {
  const r = chercherCorrespondance(index, nom);
  if (r.statut === 'trouve') return { id: r.ligne.id };
  if (r.statut === 'ambigu') {
    return {
      id: null,
      echec: { nom, raison: 'ambigu', candidats: r.candidats.map((c) => c.ta_name) },
    };
  }
  return { id: null, echec: { nom, raison: 'absent' } };
}
