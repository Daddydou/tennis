/**
 * BOOKMARKLET D'EXTRACTION — TABLEAU WTA
 * ======================================
 * Usage : coller ce code dans un snippet Chrome nomme `extract-wta`
 *         (F12 -> Sources -> Snippets), puis l'executer sur une page
 *         /tournaments/{id}/{slug}/{annee}/draws de wtatennis.com
 *
 * Sortie : meme format JSON que le bookmarklet ATP, copie dans le
 *          presse-papier + affiche en console. Le parser existant
 *          l'avale sans modification.
 *
 * Structure du site WTA (differente de l'ATP) :
 *  - Le tableau est un ensemble de conteneurs .tournament-draw__round
 *  - Les 5 premiers (pour un draw 32) sont le SIMPLE : 32,16,8,4,2 lignes
 *  - Les suivants sont double / qualifs -> a ignorer
 *  - Chaque joueuse est une ligne <tr class="js-player-row js-team-a|b">
 *  - Deux lignes consecutives (team-a puis team-b) = un match
 */

(function () {
  'use strict';

  const txt = (el) => (el ? el.textContent.trim() : '');

  /** ID WTA depuis un href /players/{id}/{slug} ou data-player-row-id */
  function playerIdFromRow(row) {
    const a = row.querySelector('a.match-table__player--link');
    if (a) {
      const m = a.getAttribute('href').match(/\/players\/(\d+)\//);
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
  function countryFromRow(row) {
    const flag = row.querySelector('[class*="match-table__player-flag--"]');
    if (!flag) return null;
    const m = flag.className.match(/match-table__player-flag--([A-Z]{2,3})/);
    return m ? m[1] : null;
  }

  /** Tete de serie "(1)" -> "1" ; sinon null */
  function seedFromRow(row) {
    const s = txt(row.querySelector('.match-table__player-seed'));
    if (!s) return null;
    const m = s.match(/\(?([A-Za-z0-9]+)\)?/);
    return m ? m[1] : null;
  }

  /** Nom affiche */
  function nameFromRow(row) {
    return txt(row.querySelector('.match-table__player-fullname'));
  }

  /**
   * Scores d'une ligne : lit les cellules .js-score-set-N{a|b}
   * @param row  la <tr>
   * @param side 'a' ou 'b'
   * Retourne [{ games, tiebreak }] ; games null si set non joue.
   */
  function setsFromRow(row, side) {
    const sets = [];
    // Les cellules sont .js-score-set-1a, -2a, -3a (ou b)
    for (let i = 1; i <= 5; i++) {
      const cell = row.querySelector(`.js-score-set-${i}${side}`);
      if (!cell) continue;
      // Un tie-break peut etre en <sup> ; le chiffre principal est le reste
      const sup = cell.querySelector('sup');
      const tb = sup ? parseInt(txt(sup), 10) : null;
      let main = txt(cell);
      if (sup) main = main.replace(txt(sup), '').trim();
      main = main.replace(/[^\d]/g, ''); // enleve le "." des sets non joues
      sets.push({
        games: main === '' ? null : parseInt(main, 10),
        tiebreak: isNaN(tb) ? null : tb,
      });
    }
    return sets;
  }

  /** Une ligne est-elle team-a ou team-b ? */
  function sideOfRow(row) {
    if (row.classList.contains('js-team-a')) return 'a';
    if (row.classList.contains('js-team-b')) return 'b';
    return null;
  }

  /** Parse une <tr> -> objet joueur au format ATP */
  function parseRow(row) {
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
  function roundCodeFromSize(nbMatches) {
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

  /** Statut du match a partir des deux joueuses */
  function matchStatus(p1, p2) {
    if (p1.isBye || p2.isBye) return 'bye';
    const played = (p) => p.sets.some((s) => s.games !== null);
    const hasWinner = p1.winner || p2.winner;
    if (!played(p1) && !played(p2)) return hasWinner ? 'walkover' : 'scheduled';
    if (!hasWinner) return 'in_progress';
    // retired : vainqueur mais sets incomplets
    const countSets = (a, b) => {
      let n = 0;
      for (let i = 0; i < a.sets.length; i++) {
        const ga = a.sets[i] ? a.sets[i].games : null;
        const gb = b.sets[i] ? b.sets[i].games : null;
        if (ga !== null && gb !== null && ga > gb) n++;
      }
      return n;
    };
    const w = p1.winner ? p1 : p2;
    const l = p1.winner ? p2 : p1;
    const setsWon = countSets(w, l);
    const setsLost = countSets(l, w);
    if (setsWon < 2 && setsWon + setsLost < 3) return 'retired';
    return 'completed';
  }

  // ---------- Extraction ----------

  function extract() {
    const allRounds = Array.from(
      document.querySelectorAll('.tournament-draw__round')
    );
    if (!allRounds.length) {
      alert('Aucun tableau trouve. Es-tu sur la page /draws ?');
      return null;
    }

    // Mesurer la taille (nb de lignes joueuses) de chaque conteneur
    const sized = allRounds.map((el) => ({
      el,
      rows: el.querySelectorAll('.js-player-row').length,
    }));

    // Le SIMPLE = la premiere sequence strictement decroissante par moitie
    // en partant du premier conteneur (32 -> 16 -> 8 -> 4 -> 2).
    const simple = [];
    let prev = Infinity;
    for (const r of sized) {
      if (r.rows === 0) continue;
      if (r.rows < prev) {
        simple.push(r);
        prev = r.rows;
        if (r.rows === 2) break; // finale atteinte
      } else {
        break; // la taille remonte -> on quitte le simple (double/qualifs)
      }
    }

    if (!simple.length) {
      alert('Tableau de simple introuvable.');
      return null;
    }

    const matches = [];
    simple.forEach((round) => {
      const rows = Array.from(round.el.querySelectorAll('.js-player-row'));
      const nbMatches = rows.length / 2;
      const code = roundCodeFromSize(nbMatches);

      // Apparier les lignes deux par deux (team-a puis team-b)
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

    // Moitie haute / basse par tour
    matches.forEach((m) => {
      const sameRound = matches.filter((x) => x.round === m.round);
      m.half = m.position < sameRound.length / 2 ? 'top' : 'bottom';
    });

    // Metadonnees depuis l'URL. Le site WTA a DEUX formats :
    //  - long  : /tournaments/{id}/{slug}/{annee}/draws   (ex. .../2042/hamburg/2026/draws)
    //  - court : /tournaments/{slug}/draws                (ex. .../canadian-open/draws)
    // On extrait id (si present), slug, et annee (si presente).
    const url = window.location.pathname;
    let slug = null;
    let id = null;
    let year = null;

    const long = url.match(/\/tournaments\/(\d+)\/([^/]+)\/(\d{4})/i);
    if (long) {
      id = long[1];
      slug = long[2];
      year = parseInt(long[3], 10);
    } else {
      // Format court ou variantes : recuperer tous les segments apres "tournaments"
      const parts = url.split('/').filter(Boolean); // enleve les vides
      const idx = parts.findIndex((p) => p.toLowerCase() === 'tournaments');
      if (idx !== -1) {
        const after = parts.slice(idx + 1).filter((p) => p.toLowerCase() !== 'draws');
        for (const seg of after) {
          if (/^\d+$/.test(seg)) {
            id = seg; // segment purement numerique = id
          } else if (/^\d{4}$/.test(seg)) {
            year = parseInt(seg, 10); // annee
          } else if (!slug) {
            slug = seg; // premier segment non numerique = slug
          }
        }
      }
    }

    // Repli sur le titre de la page si le slug reste introuvable
    if (!slug) {
      const h1 = document.querySelector('h1, .tournament-title, [class*="tournament"][class*="name"]');
      if (h1 && h1.textContent.trim()) {
        slug = h1.textContent.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      }
    }

    return {
      extracted_at: new Date().toISOString(),
      source_url: window.location.href,
      tournament: {
        slug: slug || null,
        atp_id: id || null, // id WTA, meme champ pour compat
        year: year || new Date().getFullYear(),
      },
      tour: 'WTA',
      rounds_found: [...new Set(matches.map((m) => m.round))],
      match_count: matches.length,
      matches,
    };
  }

  // ---------- Sortie ----------

  const data = extract();
  if (!data) return;

  const json = JSON.stringify(data, null, 2);
  console.log('%c✅ Extraction WTA terminée', 'color:#0a0;font-size:14px;font-weight:bold');
  console.log(`${data.match_count} matchs · rounds : ${data.rounds_found.join(', ')}`);
  console.log(data);

  navigator.clipboard.writeText(json).then(
    () => alert(`✅ ${data.match_count} matchs WTA copiés dans le presse-papier.`),
    () => {
      const ta = document.createElement('textarea');
      ta.value = json;
      ta.style.cssText =
        'position:fixed;top:10px;left:10px;width:90vw;height:80vh;z-index:99999';
      document.body.appendChild(ta);
      ta.select();
      alert('Sélectionne et copie le JSON affiché, puis appuie sur Échap.');
      document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') {
          ta.remove();
          document.removeEventListener('keydown', esc);
        }
      });
    }
  );
})();

