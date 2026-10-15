/**
 * EXTRACTION D'UN TABLEAU ATP — portage du snippet console « BOOKMARKLET
 * D'EXTRACTION — TABLEAU ATP » en fonction pure.
 *
 * Prend un `Document` (jsdom côté serveur/tests, DOM vivant ou DOMParser dans
 * le userscript) et l'URL de la page, renvoie EXACTEMENT le JSON du snippet :
 * mêmes sélecteurs, mêmes règles (code de tour lu dans l'en-tête, BYE, statut,
 * moitié haute/basse, métadonnées /scores/(current|archive)/slug/id(/année)).
 * Le test de parité (lib/extract/__tests__) exécute le snippet d'origine sur le
 * même HTML et compare : toute divergence est un bug.
 *
 * Aucune dépendance (ni Node, ni Next, ni Supabase) : le module est aussi
 * empaqueté tel quel dans le userscript (tools/userscript/).
 */

import type { ExtraitBrut, JoueurBrut, MatchBrut } from './types';

const txt = (el: Element | null | undefined) => (el ? (el.textContent ?? '').trim() : '');

/** Extrait l'ID ATP depuis un href /en/players/{slug}/{id}/overview */
function playerIdFromHref(href: string | null): string | null {
  if (!href) return null;
  const m = href.match(/\/players\/[^/]+\/([^/]+)\/overview/i);
  return m ? m[1].toUpperCase() : null;
}

/** Extrait l'ID de match depuis un href stats-centre (.../7290/ms017) */
function matchIdFromCta(drawStats: Element): string | null {
  const a = drawStats.querySelector('a[href*="stats-centre"]');
  if (!a) return null;
  const m = (a.getAttribute('href') ?? '').match(/\/([a-z]{2}\d+)\s*$/i);
  return m ? m[1] : null;
}

/** Normalise le libellé de round vers un code interne */
function roundCode(header: string): string {
  const h = header.toLowerCase();
  if (h.includes('128')) return 'R128';
  if (h.includes('64')) return 'R64';
  if (h.includes('32')) return 'R32';
  if (h.includes('16')) return 'R16';
  if (h.includes('quarter')) return 'QF';
  if (h.includes('semi')) return 'SF';
  if (h.includes('final')) return 'F';
  return header.replace(/\s+/g, '_').toUpperCase();
}

/** Parse un bloc .stats-item -> joueur ; sets[] = [{ games, tiebreak }] */
function parseStatsItem(item: Element): JoueurBrut {
  const nameEl = item.querySelector('.name');
  const link = nameEl ? nameEl.querySelector('a') : null;
  const seedEl = nameEl ? nameEl.querySelector('span') : null;

  const rawName = link ? txt(link) : txt(nameEl);
  const isBye = /^bye$/i.test(rawName);

  // Drapeau -> code pays
  let country: string | null = null;
  const use = item.querySelector('.atp-flag use');
  if (use) {
    const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
    const m = href.match(/#flag-([a-z]{3})/i);
    if (m) country = m[1].toUpperCase();
  }

  // Scores : chaque .score-item = un set.
  // span[0] = jeux, span[1] = score du tie-break (optionnel)
  const sets: JoueurBrut['sets'] = [];
  item.querySelectorAll('.scores .score-item').forEach((si) => {
    const spans = si.querySelectorAll('span');
    const g = spans[0] ? (spans[0].textContent ?? '').trim() : '';
    const tb = spans[1] ? (spans[1].textContent ?? '').trim() : '';
    if (g === '' || g === '-') {
      sets.push({ games: null, tiebreak: null });
    } else {
      sets.push({
        games: parseInt(g, 10),
        tiebreak: tb === '' ? null : parseInt(tb, 10),
      });
    }
  });

  return {
    id: link ? playerIdFromHref(link.getAttribute('href')) : null,
    name: isBye ? 'BYE' : rawName,
    seed: seedEl ? txt(seedEl).replace(/[()]/g, '') || null : null,
    country,
    isBye,
    winner: !!item.querySelector('.winner'),
    sets,
  };
}

/** Nombre de sets gagnés par a contre b */
function countSets(a: JoueurBrut, b: JoueurBrut): number {
  let n = 0;
  for (let i = 0; i < a.sets.length; i++) {
    const ga = a.sets[i] ? a.sets[i].games : null;
    const gb = b.sets[i] ? b.sets[i].games : null;
    if (ga === null || gb === null) continue;
    if (ga > gb) n++;
  }
  return n;
}

/** Statut : bye, scheduled, live, walkover, retired, completed (cf. snippet). */
function matchStatus(p1: JoueurBrut, p2: JoueurBrut): string {
  if (p1.isBye || p2.isBye) return 'bye';

  const played = (p: JoueurBrut) => p.sets.some((s) => s.games !== null);
  const anyScore = played(p1) || played(p2);
  const hasWinner = p1.winner || p2.winner;

  if (!anyScore && !hasWinner) return 'scheduled';
  if (!anyScore && hasWinner) return 'walkover';
  if (!hasWinner) return 'live';

  // Un abandon laisse typiquement un set entamé non terminé
  const w = p1.winner ? p1 : p2;
  const l = p1.winner ? p2 : p1;
  const setsWon = countSets(w, l);
  const setsLost = countSets(l, w);
  if (setsWon < 2 && setsWon + setsLost < 3) return 'retired';

  return 'completed';
}

/**
 * Extrait le tableau ATP d'une page /scores/.../draws.
 * Renvoie null si aucun tableau n'est détecté (le snippet affichait une alerte).
 */
export function extractAtp(doc: Document, url: string, maintenant = new Date()): ExtraitBrut | null {
  const rounds = doc.querySelectorAll('.draw[class*="draw-round-"]');
  if (!rounds.length) return null;

  const matches: MatchBrut[] = [];

  rounds.forEach((roundEl) => {
    const header = txt(roundEl.querySelector('.draw-header'));
    const code = roundCode(header);
    const items = roundEl.querySelectorAll('.draw-item');

    items.forEach((item, idx) => {
      const stats = item.querySelector('.draw-stats');
      if (!stats) return;
      const players = stats.querySelectorAll('.stats-item');
      if (players.length < 2) return;

      const p1 = parseStatsItem(players[0]);
      const p2 = parseStatsItem(players[1]);

      matches.push({
        match_id: matchIdFromCta(stats),
        round: code,
        round_label: header,
        // position dans le tour : sert à déduire moitié haute / basse
        position: idx,
        half: null,
        status: matchStatus(p1, p2),
        players: [p1, p2],
      });
    });
  });

  // Moitié haute / basse, par tour
  matches.forEach((m) => {
    const sameRound = matches.filter((x) => x.round === m.round);
    m.half = m.position < sameRound.length / 2 ? 'top' : 'bottom';
  });

  // Métadonnées du tournoi depuis l'URL
  const meta = cheminDe(url).match(/\/scores\/(?:current|archive)\/([^/]+)\/(\d+)(?:\/(\d{4}))?/i);

  return {
    extracted_at: maintenant.toISOString(),
    source_url: url,
    tournament: {
      slug: meta ? meta[1] : null,
      atp_id: meta ? meta[2] : null,
      year: meta && meta[3] ? parseInt(meta[3], 10) : maintenant.getFullYear(),
    },
    tour: 'ATP',
    rounds_found: [...new Set(matches.map((m) => m.round))],
    match_count: matches.length,
    matches,
  };
}

/** Équivalent de `window.location.pathname` pour une URL absolue. */
export function cheminDe(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
