/**
 * PARSER — heuristiques de tournoi (surface, format) et contrôle de cohérence
 * d'une extraction. Cf. l'en-tête de lib/parser.ts, point d'entrée qui
 * réexporte ce fichier.
 */

import { STATUTS_DECIDES, STATUTS_INDECIS } from './types';
import type { DrawExtract, MatchStatus, Surface, Tour } from './types';

/** Vocabulaire complet des statuts acceptés (cf. lib/types.ts). */
const STATUTS_CONNUS: MatchStatus[] = [...STATUTS_INDECIS, ...STATUTS_DECIDES];

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
