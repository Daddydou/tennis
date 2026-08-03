/**
 * PARSER — JSON DU BOOKMARKLET → STRUCTURES DU MOTEUR
 *
 * Les bookmarklets ATP et WTA produisent le MÊME JSON brut, au champ `tour`
 * près ('ATP' / 'WTA'). Ce module le normalise, en déduit les joueurs, les
 * moitiés de tableau et l'ordre des tours.
 */

import { eloDepuisRang, ELO_DEFAUT } from './elo';
import { STATUTS_DECIDES, STATUTS_INDECIS } from './types';
import type {
  DrawExtract,
  Half,
  Match,
  MatchStatus,
  Player,
  Surface,
  Tour,
} from './types';

/** Vocabulaire complet des statuts acceptés (cf. lib/types.ts). */
const STATUTS_CONNUS: MatchStatus[] = [...STATUTS_INDECIS, ...STATUTS_DECIDES];

/** Ordre canonique des tours, du plus large au plus étroit. */
const ORDRE_CANONIQUE = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'];

/** Normalise un libellé de tour ATP vers un code interne. */
export function codeRound(label: string): string {
  const h = label.toLowerCase();
  if (h.includes('128')) return 'R128';
  if (h.includes('64')) return 'R64';
  if (h.includes('32')) return 'R32';
  if (h.includes('16')) return 'R16';
  if (h.includes('quarter')) return 'QF';
  if (h.includes('semi')) return 'SF';
  if (h.includes('final')) return 'F';
  return label.replace(/\s+/g, '_').toUpperCase();
}

/** Trie les tours dans l'ordre du tournoi. */
export function trierRounds(rounds: string[]): string[] {
  return [...rounds].sort((a, b) => {
    const ia = ORDRE_CANONIQUE.indexOf(a);
    const ib = ORDRE_CANONIQUE.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Circuit d'une extraction.
 *
 * Le champ décide de TOUT ce qui sépare les deux circuits en aval : le
 * `tour` stocké sur le tournoi et les joueurs, le nombre de sets gagnants,
 * la fiche calendrier, et surtout le rapport Elo interrogé
 * (`chargerIndexElo` filtre `ta_elo` sur ce circuit). Un tour faux ferait
 * chercher l'Elo d'une joueuse parmi les hommes — jamais silencieusement.
 *
 * À défaut de champ exploitable, on tranche sur l'URL source plutôt que de
 * supposer l'ATP : le bookmarklet WTA est le seul à produire des URL wtatennis.
 */
export function normaliserTour(brut: unknown, sourceUrl = ''): Tour {
  const t = String(brut ?? '').trim().toUpperCase();
  if (t === 'ATP' || t === 'WTA') return t;
  return /wtatennis\.com|(^|[^a-z])wta([^a-z]|$)/i.test(sourceUrl) ? 'WTA' : 'ATP';
}

/**
 * Identité d'un tournoi lue dans l'URL d'où vient l'extraction.
 *
 * Le bookmarklet WTA ne renseigne PAS `tournament.slug` : ses extractions
 * arrivaient donc sans slug ni identifiant, ce qui laissait un tournoi
 * « Tournoi 2026 » sans surface ni catégorie — et, faute de clé, une nouvelle
 * ligne insérée à chaque réimport. L'URL, elle, porte les deux.
 *
 *   WTA court  /tournaments/madrid-open/draws
 *   WTA long   /tournaments/1075/wuhan/2026/draws
 *   ATP        /en/scores/archive/madrid/1536/2026/draws
 *
 * Le PREMIER segment numérique est l'identifiant du tournoi, les suivants sont
 * l'année. On ne peut pas les distinguer à leur forme : les identifiants WTA
 * récents (2014 Adélaïde, 2042 Hambourg, 2088 Abu Dhabi…) ressemblent tous à
 * des années. Seule la position tranche, et elle suffit : l'identifiant précède
 * l'année sur les deux sites, que le slug vienne avant (ATP) ou après (WTA).
 *
 * Rien n'est deviné : sans URL reconnaissable, on renvoie deux `null`.
 */
export function identiteDepuisUrl(url: string): {
  slug: string | null;
  externalId: string | null;
  annee: number | null;
} {
  const vide = { slug: null, externalId: null, annee: null };
  if (!url) return vide;

  // On travaille sur le chemin seul : un slug ne doit jamais être capté dans
  // le nom d'hôte ni dans une chaîne de requête.
  const chemin = url
    .replace(/^[a-z]+:\/\/[^/]+/i, '')
    .split(/[?#]/)[0]
    .toLowerCase();

  const segments = chemin.split('/').filter(Boolean);
  const ancre = segments.findIndex((s) => s === 'tournaments' || s === 'archive');
  if (ancre === -1) return vide;

  const suite = segments.slice(ancre + 1);
  // « draws », « scores », « results »… ne sont pas des slugs.
  const NON_SLUGS = new Set(['draws', 'draw', 'results', 'scores', 'overview', 'live']);

  let slug: string | null = null;
  let externalId: string | null = null;
  let annee: number | null = null;
  for (const s of suite) {
    if (/^\d+$/.test(s)) {
      // Premier nombre : l'identifiant. Ceux d'après : l'année, quand ils en
      // ont la forme. Une extraction d'archive sans année (le bookmarklet WTA
      // n'en produit pas) se retrouvait sinon datée de l'année courante — un
      // tableau de 2022 rangé en 2026.
      if (externalId === null) externalId = s;
      else if (annee === null && /^(19|20)\d{2}$/.test(s)) annee = Number(s);
      continue;
    }
    if (!NON_SLUGS.has(s)) slug ??= s;
  }

  return { slug, externalId, annee };
}

/**
 * Parse le JSON du bookmarklet.
 * Tolérant aux variations de casse des clés (camelCase / snake_case).
 */
export function parseExtract(raw: unknown): DrawExtract {
  const o = raw as Record<string, unknown>;
  const t = (o.tournament ?? {}) as Record<string, unknown>;
  const matchesRaw = (o.matches ?? []) as Record<string, unknown>[];
  const sourceUrl = String(o.source_url ?? o.sourceUrl ?? '');

  const matches: Match[] = matchesRaw.map((m) => {
    const players = (m.players ?? []) as Record<string, unknown>[];
    return {
      matchId: (m.match_id ?? m.matchId ?? null) as string | null,
      round: codeRound(String(m.round ?? m.round_label ?? '')),
      roundLabel: String(m.round_label ?? m.roundLabel ?? m.round ?? ''),
      position: Number(m.position ?? 0),
      half: (m.half ?? 'top') as Half,
      status: (m.status ?? 'completed') as MatchStatus,
      players: [normaliserJoueur(players[0]), normaliserJoueur(players[1])],
    };
  });

  const roundsFound = trierRounds([...new Set(matches.map((m) => m.round))]);

  // Repli sur l'URL source quand l'extraction ne porte ni slug ni identifiant
  // — c'est le cas de toutes les extractions WTA. Le champ explicite prime
  // toujours : l'URL ne sert qu'à combler un trou.
  const url = identiteDepuisUrl(sourceUrl);

  return {
    extractedAt: String(o.extracted_at ?? o.extractedAt ?? new Date().toISOString()),
    sourceUrl,
    tournament: {
      slug: ((t.slug ?? url.slug) || null) as string | null,
      // Le bookmarklet WTA reprend le format ATP (`atp_id`) ; on accepte
      // néanmoins les clés propres au circuit féminin si elles apparaissent.
      externalId: (t.atp_id ??
        t.atpId ??
        t.wta_id ??
        t.wtaId ??
        t.tournament_id ??
        url.externalId ??
        null) as string | null,
      year: Number(t.year ?? url.annee ?? new Date().getFullYear()),
    },
    tour: normaliserTour(o.tour, sourceUrl),
    roundsFound,
    matchCount: matches.length,
    matches,
  };
}

function normaliserJoueur(p: Record<string, unknown> | undefined) {
  const sets = ((p?.sets ?? []) as Record<string, unknown>[]).map((s) => ({
    games: s.games === null || s.games === undefined ? null : Number(s.games),
    tiebreak:
      s.tiebreak === null || s.tiebreak === undefined ? null : Number(s.tiebreak),
  }));

  return {
    id: (p?.id ?? null) as string | null,
    name: String(p?.name ?? ''),
    seed: (p?.seed ?? null) as string | null,
    country: (p?.country ?? null) as string | null,
    isBye: Boolean(p?.isBye ?? p?.is_bye ?? false),
    winner: Boolean(p?.winner ?? false),
    sets,
  };
}

/**
 * Extrait les joueurs d'un tableau, avec leur moitié.
 *
 * La moitié se déduit du PREMIER tour uniquement : un joueur appartient
 * à la moitié haute ou basse pour toute la durée du tournoi.
 */
export function extraireJoueurs(
  extract: DrawExtract,
  ranks: Record<string, number> = {},
  elos: Record<string, { overall: number; hard: number; clay: number; grass: number }> = {}
): Record<string, Player> {
  const joueurs: Record<string, Player> = {};
  const rounds = extract.roundsFound;
  const premier = rounds[0];

  // Moitié de tableau, déduite du premier tour
  const moities: Record<string, Half> = {};
  for (const m of extract.matches) {
    if (m.round !== premier) continue;
    for (const p of m.players) {
      if (p.id && !p.isBye) moities[p.id] = m.half;
    }
  }

  for (const m of extract.matches) {
    for (const p of m.players) {
      if (!p.id || p.isBye || joueurs[p.id]) continue;

      const seed = p.seed && /^\d+$/.test(p.seed) ? parseInt(p.seed, 10) : null;
      const rank = ranks[p.id] ?? null;
      const e = elos[p.id];
      const base = e?.overall ?? (rank ? eloDepuisRang(rank) : ELO_DEFAUT);

      joueurs[p.id] = {
        id: p.id,
        tour: extract.tour,
        name: p.name,
        country: p.country,
        rank,
        seed,
        half: moities[p.id] ?? m.half,
        eloOverall: base,
        eloHard: e?.hard ?? base,
        eloClay: e?.clay ?? base,
        eloGrass: e?.grass ?? base,
      };
    }
  }

  return joueurs;
}

/** Joueurs effectivement en lice à chaque tour, byes exclus. */
export function joueursParTour(extract: DrawExtract): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of extract.matches) {
    // Un exempté ne joue pas : le picker à ce tour rapporte 0
    if (m.status === 'bye') continue;
    for (const p of m.players) {
      if (p.id && !p.isBye) (out[m.round] ??= []).push(p.id);
    }
  }
  return out;
}

/** Adversaire d'un joueur à un tour donné. */
export function adversaireDe(
  extract: DrawExtract,
  playerId: string,
  round: string
): string | null {
  for (const m of extract.matches) {
    if (m.round !== round) continue;
    const idx = m.players.findIndex((p) => p.id === playerId);
    if (idx === -1) continue;
    return m.players[1 - idx].id;
  }
  return null;
}

/**
 * Déduit la surface depuis le slug du tournoi (heuristique).
 *
 * Le circuit compte : un même slug peut désigner deux surfaces selon le
 * tableau. Stuttgart est sur terre battue indoor en avril chez les femmes et
 * sur gazon en juin chez les hommes ; Lyon sur dur en février côté WTA contre
 * terre en mai côté ATP. Les fiches féminines sont donc consultées d'abord.
 */
export function devinerSurface(
  slug: string | null,
  mois?: number,
  tour: Tour = 'ATP',
): Surface {
  if (!slug) return 'hard';
  const s = slug.toLowerCase();

  const terre = ['madrid', 'rome', 'monte-carlo', 'roland-garros', 'barcelona',
                 'hamburg', 'estoril', 'munich', 'gstaad', 'kitzbuhel', 'umag',
                 'bastad', 'geneva', 'lyon', 'houston', 'buenos-aires', 'rio',
                 'santiago', 'cordoba', 'marrakech'];
  const gazon = ['wimbledon', 'queens', 'halle', 'stuttgart', 'eastbourne',
                 'mallorca', 'newport', 's-hertogenbosch'];

  if (tour === 'WTA') {
    const terreW = ['charleston', 'stuttgart', 'bogota', 'rouen', 'strasbourg',
                    'rabat', 'palermo', 'iasi', 'budapest', 'prague', 'warsaw',
                    'makarska'];
    const gazonW = ['nottingham', 'birmingham', 'berlin', 'bad-homburg', 'ilkley'];
    const durW = ['lyon'];
    if (terreW.some((t) => s.includes(t))) return 'clay';
    if (gazonW.some((g) => s.includes(g))) return 'grass';
    if (durW.some((d) => s.includes(d))) return 'hard';
  }

  if (terre.some((t) => s.includes(t))) return 'clay';
  if (gazon.some((g) => s.includes(g))) return 'grass';

  // Repli sur le calendrier : avril-mai = terre, juin-juillet = gazon
  if (mois !== undefined) {
    if (mois >= 4 && mois <= 5) return 'clay';
    if (mois === 6 || mois === 7) return 'grass';
  }
  return 'hard';
}

/**
 * Nombre de sets gagnants selon le tournoi.
 *
 * Le circuit féminin se joue en deux sets gagnants PARTOUT, Grand Chelem
 * compris : le test sur le tour passe donc avant celui sur le slug, sans quoi
 * Roland-Garros ou l'US Open féminin repartiraient en bo5.
 */
export function devinerBestOf(tour: Tour, slug: string | null): 3 | 5 {
  if (tour === 'WTA') return 3;
  const gs = ['australian-open', 'roland-garros', 'wimbledon', 'us-open'];
  return slug && gs.some((g) => slug.toLowerCase().includes(g)) ? 5 : 3;
}

/**
 * Un slot de match désigne-t-il un joueur identifiable ?
 *
 * Les tableaux en cours contiennent des slots d'attente : vides pour les
 * tours pas encore alimentés, ou étiquetés (« Qualifier », « TBD »). Aucun
 * n'est un joueur dont l'ID manquerait — il n'y a simplement personne encore.
 */
function estJoueurNomme(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n || n === '-') return false;
  return !['bye', 'qualifier', 'qualificato', 'q', 'tbd', 'to be determined'].includes(n);
}

/**
 * Contrôle de cohérence d'une extraction.
 * À appeler après chaque import : une donnée manquante fausse un classement.
 */
export function verifierExtraction(extract: DrawExtract): {
  ok: boolean;
  avertissements: string[];
} {
  const av: string[] = [];
  const parTour: Record<string, number> = {};
  for (const m of extract.matches) parTour[m.round] = (parTour[m.round] ?? 0) + 1;

  const rounds = extract.roundsFound;
  for (let i = 0; i < rounds.length - 1; i++) {
    const attendu = parTour[rounds[i + 1]] * 2;
    if (parTour[rounds[i]] !== attendu) {
      av.push(
        `${rounds[i]} : ${parTour[rounds[i]]} matchs, attendu ${attendu} ` +
          `(d'après ${rounds[i + 1]})`
      );
    }
  }

  // Un slot sans ID n'est un problème que s'il désigne un vrai joueur. Les
  // tours à venir d'un tableau en cours arrivent avec deux slots vides : les
  // compter signalait « 15 joueurs sans ID » sur un tableau de 32 parfaitement
  // extrait (R16+QF+SF+F). On ne retient donc que les slots NOMMÉS.
  const sansId = extract.matches.flatMap((m) =>
    m.players.filter((p) => !p.id && !p.isBye && estJoueurNomme(p.name))
  );
  if (sansId.length) {
    const noms = [...new Set(sansId.map((p) => p.name))];
    av.push(`${sansId.length} joueur(s) sans ID ${extract.tour} : ${noms.join(', ')}`);
  }

  const incomplets = extract.matches.filter(
    (m) => m.status === 'completed' && !m.players.some((p) => p.winner)
  );
  if (incomplets.length) {
    av.push(`${incomplets.length} match(s) terminé(s) sans vainqueur désigné`);
  }

  // Un statut hors vocabulaire fait échouer l'insertion sur la contrainte
  // tn_matches_status_check, avec un message SQL brut. On le nomme ici : c'est
  // ainsi qu'`in_progress` s'était présenté, sur un tableau en direct.
  const inconnus = [
    ...new Set(
      extract.matches
        .map((m) => m.status)
        .filter((s) => !STATUTS_CONNUS.includes(s))
    ),
  ];
  if (inconnus.length) {
    av.push(
      `Statut(s) de match inconnu(s) : ${inconnus.join(', ')} — à ajouter dans ` +
        'MatchStatus (lib/types.ts) et dans la contrainte tn_matches_status_check.'
    );
  }

  return { ok: av.length === 0, avertissements: av };
}
