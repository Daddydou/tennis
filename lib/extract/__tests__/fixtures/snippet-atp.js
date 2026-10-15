/**
 * BOOKMARKLET D'EXTRACTION — TABLEAU ATP
 * ======================================
 * Usage : coller le code minifié (voir bookmarklet-atp.min.txt) dans un favori,
 * puis cliquer sur une page /scores/.../draws de atptour.com
 *
 * Sortie : JSON copié dans le presse-papier + affiché en console
 */

(function () {
  'use strict';

  // ---------- Utilitaires ----------

  const txt = (el) => (el ? el.textContent.trim() : '');

  /** Extrait l'ID ATP depuis un href /en/players/{slug}/{id}/overview */
  function playerIdFromHref(href) {
    if (!href) return null;
    const m = href.match(/\/players\/[^/]+\/([^/]+)\/overview/i);
    return m ? m[1].toUpperCase() : null;
  }

  /** Extrait l'ID de match depuis un href stats-centre (.../7290/ms017) */
  function matchIdFromCta(drawStats) {
    const a = drawStats.querySelector('a[href*="stats-centre"]');
    if (!a) return null;
    const m = a.getAttribute('href').match(/\/([a-z]{2}\d+)\s*$/i);
    return m ? m[1] : null;
  }

  /** Normalise le libellé de round vers un code interne */
  function roundCode(header) {
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

  /**
   * Parse un bloc .stats-item -> { id, name, seed, country, winner, sets[] }
   * sets[] = [{ games, tiebreak }] ; games null si set non joué
   */
  function parseStatsItem(item) {
    const nameEl = item.querySelector('.name');
    const link = nameEl ? nameEl.querySelector('a') : null;
    const seedEl = nameEl ? nameEl.querySelector('span') : null;

    const rawName = link ? txt(link) : txt(nameEl);
    const isBye = /^bye$/i.test(rawName);

    // Drapeau -> code pays
    let country = null;
    const use = item.querySelector('.atp-flag use');
    if (use) {
      const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
      const m = href.match(/#flag-([a-z]{3})/i);
      if (m) country = m[1].toUpperCase();
    }

    // Scores : chaque .score-item = un set.
    // span[0] = jeux, span[1] = score du tie-break (optionnel)
    const sets = [];
    item.querySelectorAll('.scores .score-item').forEach((si) => {
      const spans = si.querySelectorAll('span');
      const g = spans[0] ? spans[0].textContent.trim() : '';
      const tb = spans[1] ? spans[1].textContent.trim() : '';
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

  /**
   * Détermine le statut d'un match.
   * - bye        : un des deux camps est un BYE
   * - scheduled  : aucun score saisi
   * - live       : scores partiels, aucun vainqueur désigné
   * - walkover   : vainqueur désigné mais aucun jeu joué
   * - retired    : vainqueur désigné, sets incomplets par rapport au format
   * - completed  : cas normal
   */
  function matchStatus(p1, p2) {
    if (p1.isBye || p2.isBye) return 'bye';

    const played = (p) => p.sets.some((s) => s.games !== null);
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

  /** Nombre de sets gagnés par a contre b */
  function countSets(a, b) {
    let n = 0;
    for (let i = 0; i < a.sets.length; i++) {
      const ga = a.sets[i] ? a.sets[i].games : null;
      const gb = b.sets[i] ? b.sets[i].games : null;
      if (ga === null || gb === null) continue;
      if (ga > gb) n++;
    }
    return n;
  }

  // ---------- Extraction principale ----------

  function extract() {
    const rounds = document.querySelectorAll('.draw[class*="draw-round-"]');
    if (!rounds.length) {
      alert('Aucun tableau détecté. Es-tu bien sur une page /draws ?');
      return null;
    }

    const matches = [];

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
          half: null, // rempli plus bas
          status: matchStatus(p1, p2),
          players: [p1, p2],
        });
      });
    });

    // Moitié haute / basse : déterminée sur le tour le plus large
    const firstRound = matches.length ? matches[0].round : null;
    const firstRoundMatches = matches.filter((m) => m.round === firstRound);
    const half = firstRoundMatches.length / 2;
    matches.forEach((m) => {
      const sameRound = matches.filter((x) => x.round === m.round);
      m.half = m.position < sameRound.length / 2 ? 'top' : 'bottom';
    });

    // Métadonnées du tournoi depuis l'URL
    const url = window.location.pathname;
    const meta = url.match(/\/scores\/(?:current|archive)\/([^/]+)\/(\d+)(?:\/(\d{4}))?/i);

    return {
      extracted_at: new Date().toISOString(),
      source_url: window.location.href,
      tournament: {
        slug: meta ? meta[1] : null,
        atp_id: meta ? meta[2] : null,
        year: meta && meta[3] ? parseInt(meta[3], 10) : new Date().getFullYear(),
      },
      tour: 'ATP',
      rounds_found: [...new Set(matches.map((m) => m.round))],
      match_count: matches.length,
      matches,
    };
  }

  // ---------- Sortie ----------

  const data = extract();
  if (!data) return;

  const json = JSON.stringify(data, null, 2);
  console.log('%c✅ Extraction terminée', 'color:#0a0;font-size:14px;font-weight:bold');
  console.log(`${data.match_count} matchs · rounds : ${data.rounds_found.join(', ')}`);
  console.log(data);

  // Copie presse-papier
  const copy = () =>
    navigator.clipboard.writeText(json).then(
      () => alert(`✅ ${data.match_count} matchs copiés dans le presse-papier.`),
      () => fallback()
    );

  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = json;
    ta.style.cssText = 'position:fixed;top:10px;left:10px;width:90vw;height:80vh;z-index:99999';
    document.body.appendChild(ta);
    ta.select();
    alert('Sélectionne et copie le JSON affiché, puis appuie sur Échap.');
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') {
        ta.remove();
        document.removeEventListener('keydown', esc);
      }
    });
  };

  copy();
})();


