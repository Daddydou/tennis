// ==UserScript==
// @name         Tennis — import auto des tableaux
// @namespace    https://tennis-nine-zeta.vercel.app/
// @version      1.0.0
// @description  Réimporte les tableaux ATP (et WTA en repli) dans l'app tennis toutes les 12 h, jusqu'à la finale.
// @match        https://www.atptour.com/*
// @match        https://www.wtatennis.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      tennis-nine-zeta.vercel.app
// @run-at       document-idle
// @noframes
// ==/UserScript==
//
// FICHIER GÉNÉRÉ par tools/userscript/build.mjs depuis tools/userscript/src/main.ts
// et lib/extract/ — ne pas modifier à la main (npm run build:userscript).

"use strict";
(() => {
  // lib/parserExtraction.ts
  var ORDRE_CANONIQUE = ["R128", "R64", "R32", "R16", "QF", "SF", "F"];
  function codeRound(label) {
    const h = label.toLowerCase();
    if (h.includes("128")) return "R128";
    if (h.includes("64")) return "R64";
    if (h.includes("32")) return "R32";
    if (h.includes("16")) return "R16";
    if (h.includes("quarter")) return "QF";
    if (h.includes("semi")) return "SF";
    if (h.includes("final")) return "F";
    return label.replace(/\s+/g, "_").toUpperCase();
  }
  function trierRounds(rounds) {
    return [...rounds].sort((a, b) => {
      const ia = ORDRE_CANONIQUE.indexOf(a);
      const ib = ORDRE_CANONIQUE.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
  }
  function normaliserTour(brut, sourceUrl = "") {
    const t = String(brut ?? "").trim().toUpperCase();
    if (t === "ATP" || t === "WTA") return t;
    return /wtatennis\.com|(^|[^a-z])wta([^a-z]|$)/i.test(sourceUrl) ? "WTA" : "ATP";
  }
  function identiteDepuisUrl(url) {
    const vide = { slug: null, externalId: null, annee: null };
    if (!url) return vide;
    const chemin = url.replace(/^[a-z]+:\/\/[^/]+/i, "").split(/[?#]/)[0].toLowerCase();
    const segments = chemin.split("/").filter(Boolean);
    const ancre = segments.findIndex((s) => s === "tournaments" || s === "archive");
    if (ancre === -1) return vide;
    const suite = segments.slice(ancre + 1);
    const NON_SLUGS = /* @__PURE__ */ new Set(["draws", "draw", "results", "scores", "overview", "live"]);
    let slug = null;
    let externalId = null;
    let annee = null;
    for (const s of suite) {
      if (/^\d+$/.test(s)) {
        if (externalId === null) externalId = s;
        else if (annee === null && /^(19|20)\d{2}$/.test(s)) annee = Number(s);
        continue;
      }
      if (!NON_SLUGS.has(s)) slug ?? (slug = s);
    }
    return { slug, externalId, annee };
  }
  function parseExtract(raw) {
    const o = raw;
    const t = o.tournament ?? {};
    const matchesRaw = o.matches ?? [];
    const sourceUrl = String(o.source_url ?? o.sourceUrl ?? "");
    const matches = matchesRaw.map((m) => {
      const players = m.players ?? [];
      return {
        matchId: m.match_id ?? m.matchId ?? null,
        round: codeRound(String(m.round ?? m.round_label ?? "")),
        roundLabel: String(m.round_label ?? m.roundLabel ?? m.round ?? ""),
        position: Number(m.position ?? 0),
        half: m.half ?? "top",
        status: m.status ?? "completed",
        players: [normaliserJoueur(players[0]), normaliserJoueur(players[1])]
      };
    });
    const roundsFound = trierRounds([...new Set(matches.map((m) => m.round))]);
    const url = identiteDepuisUrl(sourceUrl);
    return {
      extractedAt: String(o.extracted_at ?? o.extractedAt ?? (/* @__PURE__ */ new Date()).toISOString()),
      sourceUrl,
      tournament: {
        slug: (t.slug ?? url.slug) || null,
        // Le bookmarklet WTA reprend le format ATP (`atp_id`) ; on accepte
        // néanmoins les clés propres au circuit féminin si elles apparaissent.
        externalId: t.atp_id ?? t.atpId ?? t.wta_id ?? t.wtaId ?? t.tournament_id ?? url.externalId ?? null,
        year: Number(t.year ?? url.annee ?? (/* @__PURE__ */ new Date()).getFullYear())
      },
      tour: normaliserTour(o.tour, sourceUrl),
      roundsFound,
      matchCount: matches.length,
      matches
    };
  }
  function normaliserJoueur(p) {
    const sets = (p?.sets ?? []).map((s) => ({
      games: s.games === null || s.games === void 0 ? null : Number(s.games),
      tiebreak: s.tiebreak === null || s.tiebreak === void 0 ? null : Number(s.tiebreak)
    }));
    return {
      id: p?.id ?? null,
      name: String(p?.name ?? ""),
      seed: p?.seed ?? null,
      country: p?.country ?? null,
      isBye: Boolean(p?.isBye ?? p?.is_bye ?? false),
      winner: Boolean(p?.winner ?? false),
      sets
    };
  }

  // lib/types.ts
  var STATUTS_EN_COURS = ["live", "in_progress"];
  var STATUTS_INDECIS = [
    "scheduled",
    ...STATUTS_EN_COURS
  ];
  var STATUTS_DECIDES = [
    "completed",
    "walkover",
    "retired",
    "bye"
  ];

  // lib/parserControles.ts
  var STATUTS_CONNUS = [...STATUTS_INDECIS, ...STATUTS_DECIDES];
  function estJoueurNomme(name) {
    const n = name.trim().toLowerCase();
    if (!n || n === "-") return false;
    return !["bye", "qualifier", "qualificato", "q", "tbd", "to be determined"].includes(n);
  }
  function verifierExtraction(extract) {
    const av = [];
    const parTour = {};
    for (const m of extract.matches) parTour[m.round] = (parTour[m.round] ?? 0) + 1;
    const rounds = extract.roundsFound;
    for (let i = 0; i < rounds.length - 1; i++) {
      const attendu = parTour[rounds[i + 1]] * 2;
      if (parTour[rounds[i]] !== attendu) {
        av.push(
          `${rounds[i]} : ${parTour[rounds[i]]} matchs, attendu ${attendu} (d'après ${rounds[i + 1]})`
        );
      }
    }
    const sansId = extract.matches.flatMap(
      (m) => m.players.filter((p) => !p.id && !p.isBye && estJoueurNomme(p.name))
    );
    if (sansId.length) {
      const noms = [...new Set(sansId.map((p) => p.name))];
      av.push(`${sansId.length} joueur(s) sans ID ${extract.tour} : ${noms.join(", ")}`);
    }
    const incomplets = extract.matches.filter(
      (m) => m.status === "completed" && !m.players.some((p) => p.winner)
    );
    if (incomplets.length) {
      av.push(`${incomplets.length} match(s) terminé(s) sans vainqueur désigné`);
    }
    const inconnus = [
      ...new Set(
        extract.matches.map((m) => m.status).filter((s) => !STATUTS_CONNUS.includes(s))
      )
    ];
    if (inconnus.length) {
      av.push(
        `Statut(s) de match inconnu(s) : ${inconnus.join(", ")} — à ajouter dans MatchStatus (lib/types.ts) et dans la contrainte tn_matches_status_check.`
      );
    }
    return { ok: av.length === 0, avertissements: av };
  }

  // lib/extract/atp.ts
  var txt = (el) => el ? (el.textContent ?? "").trim() : "";
  function playerIdFromHref(href) {
    if (!href) return null;
    const m = href.match(/\/players\/[^/]+\/([^/]+)\/overview/i);
    return m ? m[1].toUpperCase() : null;
  }
  function matchIdFromCta(drawStats) {
    const a = drawStats.querySelector('a[href*="stats-centre"]');
    if (!a) return null;
    const m = (a.getAttribute("href") ?? "").match(/\/([a-z]{2}\d+)\s*$/i);
    return m ? m[1] : null;
  }
  function roundCode(header) {
    const h = header.toLowerCase();
    if (h.includes("128")) return "R128";
    if (h.includes("64")) return "R64";
    if (h.includes("32")) return "R32";
    if (h.includes("16")) return "R16";
    if (h.includes("quarter")) return "QF";
    if (h.includes("semi")) return "SF";
    if (h.includes("final")) return "F";
    return header.replace(/\s+/g, "_").toUpperCase();
  }
  function parseStatsItem(item) {
    const nameEl = item.querySelector(".name");
    const link = nameEl ? nameEl.querySelector("a") : null;
    const seedEl = nameEl ? nameEl.querySelector("span") : null;
    const rawName = link ? txt(link) : txt(nameEl);
    const isBye = /^bye$/i.test(rawName);
    let country = null;
    const use = item.querySelector(".atp-flag use");
    if (use) {
      const href = use.getAttribute("href") || use.getAttribute("xlink:href") || "";
      const m = href.match(/#flag-([a-z]{3})/i);
      if (m) country = m[1].toUpperCase();
    }
    const sets = [];
    item.querySelectorAll(".scores .score-item").forEach((si) => {
      const spans = si.querySelectorAll("span");
      const g = spans[0] ? (spans[0].textContent ?? "").trim() : "";
      const tb = spans[1] ? (spans[1].textContent ?? "").trim() : "";
      if (g === "" || g === "-") {
        sets.push({ games: null, tiebreak: null });
      } else {
        sets.push({
          games: parseInt(g, 10),
          tiebreak: tb === "" ? null : parseInt(tb, 10)
        });
      }
    });
    return {
      id: link ? playerIdFromHref(link.getAttribute("href")) : null,
      name: isBye ? "BYE" : rawName,
      seed: seedEl ? txt(seedEl).replace(/[()]/g, "") || null : null,
      country,
      isBye,
      winner: !!item.querySelector(".winner"),
      sets
    };
  }
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
  function matchStatus(p1, p2) {
    if (p1.isBye || p2.isBye) return "bye";
    const played = (p) => p.sets.some((s) => s.games !== null);
    const anyScore = played(p1) || played(p2);
    const hasWinner = p1.winner || p2.winner;
    if (!anyScore && !hasWinner) return "scheduled";
    if (!anyScore && hasWinner) return "walkover";
    if (!hasWinner) return "live";
    const w = p1.winner ? p1 : p2;
    const l = p1.winner ? p2 : p1;
    const setsWon = countSets(w, l);
    const setsLost = countSets(l, w);
    if (setsWon < 2 && setsWon + setsLost < 3) return "retired";
    return "completed";
  }
  function extractAtp(doc, url, maintenant = /* @__PURE__ */ new Date()) {
    const rounds = doc.querySelectorAll('.draw[class*="draw-round-"]');
    if (!rounds.length) return null;
    const matches = [];
    rounds.forEach((roundEl) => {
      const header = txt(roundEl.querySelector(".draw-header"));
      const code = roundCode(header);
      const items = roundEl.querySelectorAll(".draw-item");
      items.forEach((item, idx) => {
        const stats = item.querySelector(".draw-stats");
        if (!stats) return;
        const players = stats.querySelectorAll(".stats-item");
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
          players: [p1, p2]
        });
      });
    });
    matches.forEach((m) => {
      const sameRound = matches.filter((x) => x.round === m.round);
      m.half = m.position < sameRound.length / 2 ? "top" : "bottom";
    });
    const meta = cheminDe(url).match(/\/scores\/(?:current|archive)\/([^/]+)\/(\d+)(?:\/(\d{4}))?/i);
    return {
      extracted_at: maintenant.toISOString(),
      source_url: url,
      tournament: {
        slug: meta ? meta[1] : null,
        atp_id: meta ? meta[2] : null,
        year: meta && meta[3] ? parseInt(meta[3], 10) : maintenant.getFullYear()
      },
      tour: "ATP",
      rounds_found: [...new Set(matches.map((m) => m.round))],
      match_count: matches.length,
      matches
    };
  }
  function cheminDe(url) {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }

  // lib/extract/wta.ts
  var txt2 = (el) => el ? (el.textContent ?? "").trim() : "";
  function playerIdFromRow(row) {
    const a = row.querySelector("a.match-table__player--link");
    if (a) {
      const m = (a.getAttribute("href") ?? "").match(/\/players\/(\d+)\//);
      if (m) return m[1];
    }
    const attr = row.getAttribute("data-player-row-id");
    if (attr) {
      const m = attr.match(/(\d+)/);
      if (m) return m[1];
    }
    return null;
  }
  function countryFromRow(row) {
    const flag = row.querySelector('[class*="match-table__player-flag--"]');
    if (!flag) return null;
    const m = (flag.getAttribute("class") ?? "").match(/match-table__player-flag--([A-Z]{2,3})/);
    return m ? m[1] : null;
  }
  function seedFromRow(row) {
    const s = txt2(row.querySelector(".match-table__player-seed"));
    if (!s) return null;
    const m = s.match(/\(?([A-Za-z0-9]+)\)?/);
    return m ? m[1] : null;
  }
  function nameFromRow(row) {
    return txt2(row.querySelector(".match-table__player-fullname"));
  }
  function setsFromRow(row, side) {
    const sets = [];
    for (let i = 1; i <= 5; i++) {
      const cell = row.querySelector(`.js-score-set-${i}${side}`);
      if (!cell) continue;
      const sup = cell.querySelector("sup");
      const tb = sup ? parseInt(txt2(sup), 10) : null;
      let main = txt2(cell);
      if (sup) main = main.replace(txt2(sup), "").trim();
      main = main.replace(/[^\d]/g, "");
      sets.push({
        games: main === "" ? null : parseInt(main, 10),
        tiebreak: tb === null || isNaN(tb) ? null : tb
      });
    }
    return sets;
  }
  function sideOfRow(row) {
    if (row.classList.contains("js-team-a")) return "a";
    if (row.classList.contains("js-team-b")) return "b";
    return null;
  }
  function parseRow(row) {
    const side = sideOfRow(row);
    const rawName = nameFromRow(row);
    const isBye = /^bye$/i.test(rawName) || rawName === "";
    return {
      id: playerIdFromRow(row),
      name: isBye ? "BYE" : rawName,
      seed: seedFromRow(row),
      country: countryFromRow(row),
      isBye,
      winner: row.classList.contains("is-winner"),
      sets: setsFromRow(row, side)
    };
  }
  function roundCodeFromSize(nbMatches) {
    switch (nbMatches) {
      case 64:
        return "R128";
      case 32:
        return "R64";
      case 16:
        return "R32";
      case 8:
        return "R16";
      case 4:
        return "QF";
      case 2:
        return "SF";
      case 1:
        return "F";
      default:
        return `R_${nbMatches * 2}`;
    }
  }
  function countSets2(a, b) {
    let n = 0;
    for (let i = 0; i < a.sets.length; i++) {
      const ga = a.sets[i] ? a.sets[i].games : null;
      const gb = b.sets[i] ? b.sets[i].games : null;
      if (ga !== null && gb !== null && ga > gb) n++;
    }
    return n;
  }
  function matchStatus2(p1, p2) {
    if (p1.isBye || p2.isBye) return "bye";
    const played = (p) => p.sets.some((s) => s.games !== null);
    const hasWinner = p1.winner || p2.winner;
    if (!played(p1) && !played(p2)) return hasWinner ? "walkover" : "scheduled";
    if (!hasWinner) return "in_progress";
    const w = p1.winner ? p1 : p2;
    const l = p1.winner ? p2 : p1;
    const setsWon = countSets2(w, l);
    const setsLost = countSets2(l, w);
    if (setsWon < 2 && setsWon + setsLost < 3) return "retired";
    return "completed";
  }
  function metaDepuisChemin(chemin) {
    let slug = null;
    let id = null;
    let year = null;
    const long = chemin.match(/\/tournaments\/(\d+)\/([^/]+)\/(\d{4})/i);
    if (long) {
      id = long[1];
      slug = long[2];
      year = parseInt(long[3], 10);
    } else {
      const parts = chemin.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p.toLowerCase() === "tournaments");
      if (idx !== -1) {
        const after = parts.slice(idx + 1).filter((p) => p.toLowerCase() !== "draws");
        for (const seg of after) {
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
  function extractWta(doc, url, maintenant = /* @__PURE__ */ new Date()) {
    const allRounds = Array.from(doc.querySelectorAll(".tournament-draw__round"));
    if (!allRounds.length) return null;
    const sized = allRounds.map((el) => ({
      el,
      rows: el.querySelectorAll(".js-player-row").length
    }));
    const simple = [];
    let prev = Infinity;
    for (const r of sized) {
      if (r.rows === 0) continue;
      if (r.rows < prev) {
        simple.push(r);
        prev = r.rows;
        if (r.rows === 2) break;
      } else {
        break;
      }
    }
    if (!simple.length) return null;
    const matches = [];
    simple.forEach((round) => {
      const rows = Array.from(round.el.querySelectorAll(".js-player-row"));
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
          status: matchStatus2(p1, p2),
          players: [p1, p2]
        });
      }
    });
    matches.forEach((m) => {
      const sameRound = matches.filter((x) => x.round === m.round);
      m.half = m.position < sameRound.length / 2 ? "top" : "bottom";
    });
    const meta = metaDepuisChemin(cheminDe(url));
    let slug = meta.slug;
    if (!slug) {
      const h1 = doc.querySelector('h1, .tournament-title, [class*="tournament"][class*="name"]');
      if (h1 && (h1.textContent ?? "").trim()) {
        slug = (h1.textContent ?? "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      }
    }
    return {
      extracted_at: maintenant.toISOString(),
      source_url: url,
      tournament: {
        slug: slug || null,
        atp_id: meta.id || null,
        // id WTA, même champ pour compat
        year: meta.year || maintenant.getFullYear()
      },
      tour: "WTA",
      rounds_found: [...new Set(matches.map((m) => m.round))],
      match_count: matches.length,
      matches
    };
  }

  // lib/extract/index.ts
  function circuitDeUrl(url) {
    let hote;
    try {
      hote = new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
    if (hote === "www.atptour.com" || hote === "atptour.com") return "ATP";
    if (hote === "www.wtatennis.com" || hote === "wtatennis.com") return "WTA";
    return null;
  }
  function extraireDepuisDocument(doc, url, maintenant = /* @__PURE__ */ new Date()) {
    const circuit = circuitDeUrl(url);
    if (circuit === "ATP") return extractAtp(doc, url, maintenant);
    if (circuit === "WTA") return extractWta(doc, url, maintenant);
    return null;
  }
  function controlerExtrait(brut) {
    if (!brut || typeof brut !== "object") return { ok: false, erreur: "Extraction absente." };
    let extract;
    try {
      extract = parseExtract(brut);
    } catch (e) {
      return { ok: false, erreur: `Extraction illisible : ${e.message}` };
    }
    if (extract.matches.length === 0) return { ok: false, erreur: "Aucun match dans cette extraction." };
    return { ok: true, avertissements: verifierExtraction(extract).avertissements, matchs: extract.matches.length };
  }

  // tools/userscript/src/main.ts
  var BASE = "https://tennis-nine-zeta.vercel.app";
  var CLE_JETON = "importAuto.jeton";
  var CLE_REFUS = "importAuto.jetonRefuseLe";
  var CLE_VERROU = "importAuto.verrou";
  var CLE_DERNIER = "importAuto.dernier";
  var INTERVALLE_MS = 30 * 60 * 1e3;
  var VERROU_MS = 10 * 60 * 1e3;
  var UNE_JOURNEE = 24 * 60 * 60 * 1e3;
  function jeton() {
    const j = GM_getValue(CLE_JETON, "");
    if (j) return j;
    if (Date.now() - GM_getValue(CLE_REFUS, 0) < UNE_JOURNEE) return null;
    const saisi = (window.prompt(
      "Import auto tennis : colle le jeton IMPORT_AUTO_TOKEN.\nIl est rangé dans Tampermonkey (pas dans le fichier du script)."
    ) ?? "").trim();
    if (saisi.length < 32) {
      GM_setValue(CLE_REFUS, Date.now());
      return null;
    }
    GM_setValue(CLE_JETON, saisi);
    return saisi;
  }
  function appeler(methode, chemin, j, corps) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: methode,
        url: `${BASE}${chemin}`,
        headers: { "x-import-token": j, "Content-Type": "application/json" },
        data: corps === void 0 ? void 0 : JSON.stringify(corps),
        timeout: 18e4,
        onload: (r) => {
          let json = null;
          try {
            json = JSON.parse(r.responseText);
          } catch {
          }
          resolve({ status: r.status, json });
        },
        onerror: () => reject(new Error("réseau")),
        ontimeout: () => reject(new Error("délai dépassé"))
      });
    });
  }
  function afficherBadge(d) {
    let el = document.getElementById("tennis-import-auto-badge");
    if (!el) {
      el = document.createElement("div");
      el.id = "tennis-import-auto-badge";
      el.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:2147483647;pointer-events:none;font:11px/1.3 system-ui,sans-serif;padding:3px 7px;border-radius:6px;opacity:.85;color:#fff;max-width:60vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
      document.body.appendChild(el);
    }
    if (!d) {
      el.style.background = "#52525b";
      el.textContent = "Import auto : en attente";
      return;
    }
    const heure = new Date(d.quand).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    el.style.background = d.ok ? "#15803d" : "#b91c1c";
    el.textContent = `Import auto ${d.ok ? "OK" : "ERREUR"} · ${heure} · ${d.texte}`;
  }
  function noter(ok, texte) {
    const d = { ok, quand: Date.now(), texte };
    GM_setValue(CLE_DERNIER, d);
    afficherBadge(d);
  }
  async function prendreVerrou() {
    const actuel = GM_getValue(CLE_VERROU, null);
    if (actuel && Date.now() - actuel.quand < VERROU_MS) return null;
    const id = Math.random().toString(36).slice(2);
    GM_setValue(CLE_VERROU, { id, quand: Date.now() });
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));
    return GM_getValue(CLE_VERROU, null)?.id === id ? id : null;
  }
  function rendreVerrou(id) {
    if (GM_getValue(CLE_VERROU, null)?.id === id) GM_setValue(CLE_VERROU, null);
  }
  var sansSlashFinal = (s) => s.replace(/\/+$/, "");
  function surCettePage(url) {
    try {
      const u = new URL(url);
      return u.origin === location.origin && sansSlashFinal(u.pathname) === sansSlashFinal(location.pathname);
    } catch {
      return false;
    }
  }
  async function documentDe(url) {
    if (surCettePage(url)) return document;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status} sur la page draws`);
    return new DOMParser().parseFromString(await res.text(), "text/html");
  }
  async function traiter(t, j) {
    let doc;
    try {
      doc = await documentDe(t.source_url);
    } catch (e) {
      await appeler("POST", "/api/import-auto/ingest", j, { tournament_id: t.tournament_id, echec: e.message });
      throw e;
    }
    const extrait = extraireDepuisDocument(doc, t.source_url);
    const controle = controlerExtrait(extrait);
    if (!controle.ok) {
      await appeler("POST", "/api/import-auto/ingest", j, { tournament_id: t.tournament_id, echec: controle.erreur });
      throw new Error(controle.erreur);
    }
    const r = await appeler("POST", "/api/import-auto/ingest", j, { tournament_id: t.tournament_id, json: extrait });
    if (r.status !== 200) throw new Error(String(r.json?.detail ?? r.json?.error ?? `HTTP ${r.status}`));
    return r.json?.statut === "inchange" ? "inchangé" : `${r.json?.matchs_changes ?? "?"} matchs changés`;
  }
  async function cycle() {
    const circuit = circuitDeUrl(location.href);
    if (!circuit) return;
    const j = jeton();
    if (!j) return;
    const verrou = await prendreVerrou();
    if (!verrou) return;
    try {
      const etat = await appeler("GET", "/api/import-auto/etat", j);
      if (etat.status === 404) {
        GM_setValue(CLE_JETON, "");
        noter(false, "jeton refusé — il sera redemandé");
        return;
      }
      if (etat.status !== 200 || !etat.json) {
        noter(false, `état HTTP ${etat.status}`);
        return;
      }
      const tournois = (etat.json.tournois ?? []).filter(
        (t) => t.du && circuitDeUrl(t.source_url) === circuit && (t.tour === "ATP" || t.mode === "navigateur")
      );
      for (const t of tournois) {
        const nom = (() => {
          try {
            return new URL(t.source_url).pathname.split("/").filter(Boolean).slice(-3, -1).join("/");
          } catch {
            return t.tournament_id.slice(0, 8);
          }
        })();
        try {
          noter(true, `${nom} : ${await traiter(t, j)}`);
        } catch (e) {
          noter(false, `${nom} : ${e.message}`);
        }
      }
    } catch (e) {
      noter(false, e.message);
    } finally {
      rendreVerrou(verrou);
    }
  }
  afficherBadge(GM_getValue(CLE_DERNIER, null));
  setTimeout(cycle, 5e3);
  setInterval(cycle, INTERVALLE_MS);
})();
