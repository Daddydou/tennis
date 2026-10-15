/**
 * EXTRACTION D'UN TABLEAU WTA — portage du snippet console « BOOKMARKLET
 * D'EXTRACTION — TABLEAU WTA » en fonction pure.
 *
 * Même contrat que `extractAtp` (lib/extract/atp.ts) : un `Document` + l'URL
 * de la page, et EXACTEMENT le JSON du snippet. Règles reprises telles quelles :
 *  - le tableau est un ensemble de conteneurs .tournament-draw__round ;
 *  - le SIMPLE = la première séquence strictement décroissante de nombres de
 *    lignes (64 -> 32 -> ... -> 2) ; la suite (double, qualifs) est ignorée ;
 *  - deux lignes .js-player-row consécutives (team-a puis team-b) = un match ;
 *  - code de tour déduit du NOMBRE DE MATCHS du tour ;
 *  - URL longue /tournaments/{id}/{slug}/{année}/draws ou courte
 *    /tournaments/{slug}/draws, repli sur le titre de la page pour le slug.
 */

import { cheminDe } from './atp';
import type { ExtraitBrut, JoueurBrut, MatchBrut } from './types';

const txt = (el: Element | null | undefined) => (el ? (el.textContent ?? '').trim() : '');

/** ID WTA depuis un href /players/{id}/{slug} ou data-player-row-id */
function playerIdFromRow(row: Element): string | null {
  const a = row.querySelector('a.match-table__player--link');
  if (a) {
    const m = (a.getAttribute('href') ?? '').match(/\/players\/(\d+)\//);
    if (m) return m[1];
  }
  const attr = row.getAttribute('data-player-row-id'); // "player-328139"
  if (attr) {
    const m = attr.match(/(\d+)/);
    if (m) return m[1];
  }
  return null;
}

/** Pays depuis la classe match-table__player-flag--XXX */
function countryFromRow(row: Element): string | null {
  const flag = row.querySelector('[class*="match-table__player-flag--"]');
  if (!flag) return null;
  const m = (flag.getAttribute('class') ?? '').match(/match-table__player-flag--([A-Z]{2,3})/);
  return m ? m[1] : null;
}

/** Tête de série "(1)" -> "1" ; sinon null */
function seedFromRow(row: Element): string | null {
  const s = txt(row.querySelector('.match-table__player-seed'));
  if (!s) return null;
  const m = s.match(/\(?([A-Za-z0-9]+)\)?/);
  return m ? m[1] : null;
}

/** Nom affiché */
function nameFromRow(row: Element): string {
  return txt(row.querySelector('.match-table__player-fullname'));
}

/** Scores d'une ligne : cellules .js-score-set-N{a|b}, tie-break en <sup>. */
function setsFromRow(row: Element, side: 'a' | 'b' | null): JoueurBrut['sets'] {
  const sets: JoueurBrut['sets'] = [];
  for (let i = 1; i <= 5; i++) {
    const cell = row.querySelector(`.js-score-set-${i}${side}`);
    if (!cell) continue;
    const sup = cell.querySelector('sup');
    const tb = sup ? parseInt(txt(sup), 10) : null;
    let main = txt(cell);
    if (sup) main = main.replace(txt(sup), '').trim();
    main = main.replace(/[^\d]/g, ''); // enlève le "." des sets non joués
    sets.push({
      games: main === '' ? null : parseInt(main, 10),
      tiebreak: tb === null || isNaN(tb) ? null : tb,
    });
  }
  return sets;
}

/** Une ligne est-elle team-a ou team-b ? */
function sideOfRow(row: Element): 'a' | 'b' | null {
  if (row.classList.contains('js-team-a')) return 'a';
  if (row.classList.contains('js-team-b')) return 'b';
  return null;
}

/** Parse une <tr> -> objet joueur au format ATP */
function parseRow(row: Element): JoueurBrut {
  const side = sideOfRow(row);
  const rawName = nameFromRow(row);
  const isBye = /^bye$/i.test(rawName) || rawName === '';
  return {
    id: playerIdFromRow(row),
    name: isBye ? 'BYE' : rawName,
    seed: seedFromRow(row),
    country: countryFromRow(row),
    isBye,
    winner: row.classList.contains('is-winner'),
    sets: setsFromRow(row, side),
  };
}

/** Code de round depuis la taille du tour (nb de matchs) */
function roundCodeFromSize(nbMatches: number): string {
  switch (nbMatches) {
    case 64: return 'R128';
    case 32: return 'R64';
    case 16: return 'R32';
    case 8: return 'R16';
    case 4: return 'QF';
    case 2: return 'SF';
    case 1: return 'F';
    default: return `R_${nbMatches * 2}`;
  }
}

function countSets(a: JoueurBrut, b: JoueurBrut): number {
  let n = 0;
  for (let i = 0; i < a.sets.length; i++) {
    const ga = a.sets[i] ? a.sets[i].games : null;
    const gb = b.sets[i] ? b.sets[i].games : null;
    if (ga !== null && gb !== null && ga > gb) n++;
  }
  return n;
}

/** Statut du match à partir des deux joueuses (cf. snippet : `in_progress`). */
function matchStatus(p1: JoueurBrut, p2: JoueurBrut): string {
  if (p1.isBye || p2.isBye) return 'bye';
  const played = (p: JoueurBrut) => p.sets.some((s) => s.games !== null);
  const hasWinner = p1.winner || p2.winner;
  if (!played(p1) && !played(p2)) return hasWinner ? 'walkover' : 'scheduled';
  if (!hasWinner) return 'in_progress';
  const w = p1.winner ? p1 : p2;
  const l = p1.winner ? p2 : p1;
  const setsWon = countSets(w, l);
  const setsLost = countSets(l, w);
  if (setsWon < 2 && setsWon + setsLost < 3) return 'retired';
  return 'completed';
}

/** Identité du tournoi depuis le chemin de l'URL (formats long et court). */
function metaDepuisChemin(chemin: string): { slug: string | null; id: string | null; year: number | null } {
  let slug: string | null = null;
  let id: string | null = null;
  let year: number | null = null;

  const long = chemin.match(/\/tournaments\/(\d+)\/([^/]+)\/(\d{4})/i);
  if (long) {
    id = long[1];
    slug = long[2];
    year = parseInt(long[3], 10);
  } else {
    const parts = chemin.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => p.toLowerCase() === 'tournaments');
    if (idx !== -1) {
      const after = parts.slice(idx + 1).filter((p) => p.toLowerCase() !== 'draws');
      for (const seg of after) {
        // Ordre du snippet conservé : /^\d+$/ capte aussi les années, la
        // seconde branche n'est donc jamais prise (comportement d'origine).
        if (/^\d+$/.test(seg)) {
          id = seg;
        } else if (/^\d{4}$/.test(seg)) {
          year = parseInt(seg, 10);
        } else if (!slug) {
          slug = seg;
        }
      }
    }
  }
  return { slug, id, year };
}

/**
 * Extrait le tableau de SIMPLE d'une page /tournaments/.../draws de wtatennis.com.
 * Renvoie null si aucun tableau (ou aucun simple) n'est trouvé.
 */
export function extractWta(doc: Document, url: string, maintenant = new Date()): ExtraitBrut | null {
  const allRounds = Array.from(doc.querySelectorAll('.tournament-draw__round'));
  if (!allRounds.length) return null;

  const sized = allRounds.map((el) => ({
    el,
    rows: el.querySelectorAll('.js-player-row').length,
  }));

  // Le SIMPLE = la première séquence strictement décroissante en partant du
  // premier conteneur (64 -> 32 -> 16 -> 8 -> 4 -> 2).
  const simple: typeof sized = [];
  let prev = Infinity;
  for (const r of sized) {
    if (r.rows === 0) continue;
    if (r.rows < prev) {
      simple.push(r);
      prev = r.rows;
      if (r.rows === 2) break; // finale atteinte
    } else {
      break; // la taille remonte -> double/qualifs
    }
  }
  if (!simple.length) return null;

  const matches: MatchBrut[] = [];
  simple.forEach((round) => {
    const rows = Array.from(round.el.querySelectorAll('.js-player-row'));
    const nbMatches = rows.length / 2;
    const code = roundCodeFromSize(nbMatches);

    for (let i = 0; i < rows.length; i += 2) {
      const p1 = parseRow(rows[i]);
      const p2 = parseRow(rows[i + 1]);
      matches.push({
        match_id: null,
        round: code,
        round_label: code,
        position: i / 2,
        half: null,
        status: matchStatus(p1, p2),
        players: [p1, p2],
      });
    }
  });

  matches.forEach((m) => {
    const sameRound = matches.filter((x) => x.round === m.round);
    m.half = m.position < sameRound.length / 2 ? 'top' : 'bottom';
  });

  const meta = metaDepuisChemin(cheminDe(url));
  let slug = meta.slug;

  // Repli sur le titre de la page si le slug reste introuvable
  if (!slug) {
    const h1 = doc.querySelector('h1, .tournament-title, [class*="tournament"][class*="name"]');
    if (h1 && (h1.textContent ?? '').trim()) {
      slug = (h1.textContent ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }
  }

  return {
    extracted_at: maintenant.toISOString(),
    source_url: url,
    tournament: {
      slug: slug || null,
      atp_id: meta.id || null, // id WTA, même champ pour compat
      year: meta.year || maintenant.getFullYear(),
    },
    tour: 'WTA',
    rounds_found: [...new Set(matches.map((m) => m.round))],
    match_count: matches.length,
    matches,
  };
}
