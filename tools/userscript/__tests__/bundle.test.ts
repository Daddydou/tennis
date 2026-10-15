// @vitest-environment node
/**
 * Le userscript committé doit être EXACTEMENT le bundle des sources actuelles
 * (src/main.ts + lib/extract/) : pas de copie divergente des extracteurs.
 *
 * Le bundle est aussi EXÉCUTÉ dans jsdom avec un faux Tampermonkey (GM_*,
 * fetch, window.close) : page draws ouverte, fetch du HTML brut, onglet
 * d'arrière-plan et ses verrous.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import { construire } from '../build.mjs';
import { extractAtp } from '../../../lib/extract';

const fichier = () =>
  readFileSync(fileURLToPath(new URL('../import-auto.user.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

describe('import-auto.user.js', () => {
  it('à jour (sinon : npm run build:userscript)', async () => {
    expect(fichier()).toBe(await construire());
  });

  it('en-tête Tampermonkey attendu, aucun jeton en dur', () => {
    const f = fichier();
    for (const ligne of [
      '// @version      1.0.2',
      '// @match        https://www.atptour.com/*',
      '// @match        https://www.wtatennis.com/*',
      '// @grant        GM_xmlhttpRequest',
      '// @grant        GM_getValue',
      '// @grant        GM_setValue',
      '// @grant        GM_openInTab',
      '// @grant        window.close',
      '// @connect      tennis-nine-zeta.vercel.app',
    ]) {
      expect(f).toContain(ligne);
    }
    expect(f).not.toMatch(/IMPORT_AUTO_TOKEN\s*=/);
    expect(f).not.toMatch(/process\.env/);
  });
});

/* -------------------------------------------------------------------------- */
/*  Exécution du bundle dans jsdom, avec un faux Tampermonkey                  */
/* -------------------------------------------------------------------------- */

// Valeur de TEST, pas le vrai jeton.
const JETON = 'jeton-userscript-de-test-'.padEnd(48, 'u');
const URL_ATP = 'https://www.atptour.com/en/scores/current/shanghai/5014/draws';
const URL_AUTRE = 'https://www.atptour.com/en/players';
const TOURNOI = 'd09b52ac-f4cb-4610-8413-7fdb12514548';
const BASE = 'https://tennis-nine-zeta.vercel.app/api/import-auto';
const HTML_DRAWS = readFileSync(
  fileURLToPath(new URL('../../../lib/extract/__tests__/fixtures/atp-shanghai-2026.html', import.meta.url)),
  'utf8',
);
/** HTML brut sans tableau (cas d'un tableau injecté par JavaScript). */
const HTML_SANS_TABLEAU = '<!doctype html><html><body><div id="draws-app"></div></body></html>';
const attendu = () => ({
  ...extractAtp(new JSDOM(HTML_DRAWS, { url: URL_ATP }).window.document, URL_ATP)!,
  extracted_at: null,
});

type Envoi = { url: string; corps: Record<string, unknown> | null; jeton: string; anonyme: boolean };
type Ouverture = { url: string; options: unknown };

/**
 * Charge le bundle dans un « onglet » jsdom. `stock` = stockage GM partagé
 * entre onglets ; `pageFetch` = ce que renvoie fetch(source_url) ; `du` =
 * ce que répond /etat pour Shanghai.
 */
async function onglet({
  url,
  html = '<!doctype html><html><body></body></html>',
  stock,
  du = true,
  pageFetch = HTML_DRAWS,
}: {
  url: string;
  html?: string;
  stock: Map<string, unknown>;
  du?: boolean;
  pageFetch?: string;
}) {
  const { window } = new JSDOM(html, { url, runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const envois: Envoi[] = [];
  const ouverts: Ouverture[] = [];
  let ferme = false;
  let fetchs = 0;
  const delaisLongs: number[] = [];
  const w = window as unknown as Record<string, unknown>;
  w.GM_getValue = (cle: string, defaut: unknown) => (stock.has(cle) ? stock.get(cle) : defaut);
  w.GM_setValue = (cle: string, valeur: unknown) => stock.set(cle, valeur);
  w.GM_openInTab = (u: string, options: unknown) => (ouverts.push({ url: u, options }), { close: () => {} });
  w.GM_xmlhttpRequest = (d: {
    method: string;
    url: string;
    headers: Record<string, string>;
    data?: string;
    anonymous?: boolean;
    onload: (r: { status: number; responseText: string }) => void;
  }) => {
    envois.push({
      url: `${d.method} ${d.url}`,
      corps: d.data ? JSON.parse(d.data) : null,
      jeton: d.headers['x-import-token'],
      anonyme: !!d.anonymous,
    });
    const reponse = d.url.endsWith('/etat')
      ? { ok: true, tournois: [{ tournament_id: TOURNOI, tour: 'ATP', source_url: URL_ATP, mode: 'navigateur', du }] }
      : { ok: true, statut: 'importe', matchs_changes: 0 };
    setTimeout(() => d.onload({ status: 200, responseText: JSON.stringify(reponse) }), 0);
  };
  w.fetch = async () => {
    fetchs++;
    return { ok: true, status: 200, text: async () => pageFetch };
  };
  w.close = () => {
    ferme = true;
  };
  // Délais courts (démarrage, verrou, attente du tableau) ramenés à 0 ; les
  // délais de sécurité (≥ 30 s) sont NOTÉS mais jamais déclenchés : une
  // fermeture observée vient donc forcément de la fin du traitement.
  w.setTimeout = (fn: () => void, ms = 0) => {
    if (ms >= 30_000) {
      delaisLongs.push(ms);
      return 0;
    }
    return setTimeout(fn, 0);
  };
  w.setInterval = () => 0;
  window.eval(fichier());
  // Fin : le badge a noté un résultat, ou l'onglet s'est fermé.
  const avant = stock.get('importAuto.dernier');
  for (let i = 0; i < 200 && stock.get('importAuto.dernier') === avant && !ferme; i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
  await new Promise((r) => setTimeout(r, 30));
  const ingest = envois.filter((e) => e.url === `POST ${BASE}/ingest`);
  return { envois, ingest, ouverts, delaisLongs, ferme: () => ferme, fetchs: () => fetchs };
}

const stockNeuf = () => new Map<string, unknown>([['importAuto.jeton', JETON]]);
const jsonEnvoye = (e: Envoi) => ({ ...(e.corps?.json as object), extracted_at: null });

describe('voie userscript sur une vraie page ATP (Shanghai 2026)', () => {
  it('page draws ouverte : envoie exactement le JSON de extractAtp, avec le jeton et sans cookies', async () => {
    const stock = stockNeuf();
    const o = await onglet({ url: URL_ATP, html: HTML_DRAWS, stock });
    expect(o.envois.map((e) => e.url)).toEqual([`GET ${BASE}/etat`, `POST ${BASE}/ingest`]);
    expect(o.envois.every((e) => e.jeton === JETON && e.anonyme)).toBe(true);
    expect(o.ingest[0].corps?.tournament_id).toBe(TOURNOI);
    expect(jsonEnvoye(o.ingest[0])).toEqual(attendu());
    expect(o.fetchs()).toBe(0);
    expect(o.ouverts).toEqual([]);
    expect((stock.get('importAuto.dernier') as { ok: boolean }).ok).toBe(true);
  });
});

describe('page draws non ouverte : fetch, puis onglet d’arrière-plan', () => {
  it('fetch réussi : import direct, aucun onglet ouvert', async () => {
    const o = await onglet({ url: URL_AUTRE, stock: stockNeuf() });
    expect(o.fetchs()).toBe(1);
    expect(o.ouverts).toEqual([]);
    expect(o.ingest).toHaveLength(1);
    expect(jsonEnvoye(o.ingest[0])).toEqual(attendu());
  });

  it('fetch sans tableau : un onglet d’arrière-plan, sans signaler d’échec au serveur', async () => {
    const stock = stockNeuf();
    const o = await onglet({ url: URL_AUTRE, stock, pageFetch: HTML_SANS_TABLEAU });
    expect(o.ouverts).toHaveLength(1);
    expect(o.ouverts[0].url).toMatch(/^https:\/\/www\.atptour\.com\/en\/scores\/current\/shanghai\/5014\/draws#tennis-import-auto=[a-z0-9]+$/);
    expect(o.ouverts[0].options).toEqual({ active: false, insert: false });
    expect(o.delaisLongs).toContain(75_000); // l'ouvreur referme l'onglet s'il est resté ouvert
    // Ni import du vide, ni échec (qui mettrait le tournoi en pause une heure).
    expect(o.ingest).toEqual([]);
    expect(stock.get('importAuto.dernier')).toMatchObject({ enCours: true });
  });

  it('verrou : un second échec juste après n’ouvre pas d’autre onglet et signale l’échec', async () => {
    const stock = stockNeuf();
    await onglet({ url: URL_AUTRE, stock, pageFetch: HTML_SANS_TABLEAU });
    const o2 = await onglet({ url: URL_AUTRE, stock, pageFetch: HTML_SANS_TABLEAU });
    expect(o2.ouverts).toEqual([]);
    expect(o2.ingest).toHaveLength(1);
    expect(o2.ingest[0].corps).toMatchObject({ tournament_id: TOURNOI, echec: 'Extraction absente.' });
  });

  it('verrou horaire : dernier échec fetch ancien, mais onglet ouvert il y a < 1 h → pas d’onglet', async () => {
    const stock = stockNeuf();
    stock.set(`importAuto.echecFetchLe.${TOURNOI}`, Date.now() - 45 * 60_000);
    stock.set(`importAuto.ongletOuvertLe.${TOURNOI}`, Date.now() - 50 * 60_000);
    const o = await onglet({ url: URL_AUTRE, stock, pageFetch: HTML_SANS_TABLEAU });
    expect(o.ouverts).toEqual([]);
    expect(o.ingest[0].corps).toMatchObject({ echec: 'Extraction absente.' });
  });

  it('dernier échec fetch < 30 min : pas d’onglet, même sans ouverture récente', async () => {
    const stock = stockNeuf();
    stock.set(`importAuto.echecFetchLe.${TOURNOI}`, Date.now() - 20 * 60_000);
    const o = await onglet({ url: URL_AUTRE, stock, pageFetch: HTML_SANS_TABLEAU });
    expect(o.ouverts).toEqual([]);
    expect(o.ingest[0].corps).toMatchObject({ echec: 'Extraction absente.' });
  });

  it('plus d’une heure après : un nouvel onglet est permis', async () => {
    const stock = stockNeuf();
    stock.set(`importAuto.echecFetchLe.${TOURNOI}`, Date.now() - 61 * 60_000);
    stock.set(`importAuto.ongletOuvertLe.${TOURNOI}`, Date.now() - 61 * 60_000);
    const o = await onglet({ url: URL_AUTRE, stock, pageFetch: HTML_SANS_TABLEAU });
    expect(o.ouverts).toHaveLength(1);
  });

  it('tournoi pas dû (ou arrêté, donc absent) : ni fetch, ni onglet', async () => {
    const o = await onglet({ url: URL_AUTRE, stock: stockNeuf(), du: false, pageFetch: HTML_SANS_TABLEAU });
    expect(o.fetchs()).toBe(0);
    expect(o.ouverts).toEqual([]);
    expect(o.ingest).toEqual([]);
  });
});

describe('dans l’onglet d’arrière-plan', () => {
  /** Onglet tel que l'ouvreur l'a préparé : marque dans le stockage + ancre. */
  async function ongletDeFond({ du = true, nonce = 'abc123', marqueNonce = 'abc123' } = {}) {
    const stock = stockNeuf();
    stock.set('importAuto.ongletDeFond', { nonce: marqueNonce, tournament_id: TOURNOI, quand: Date.now() });
    const o = await onglet({ url: `${URL_ATP}#tennis-import-auto=${nonce}`, html: HTML_DRAWS, stock, du });
    return { ...o, stock };
  }

  it('lit le DOM vivant, envoie à /ingest une seule fois, puis se ferme', async () => {
    const o = await ongletDeFond();
    expect(o.ingest).toHaveLength(1);
    expect(jsonEnvoye(o.ingest[0])).toEqual(attendu());
    expect(o.fetchs()).toBe(0);
    expect(o.ouverts).toEqual([]);
    expect(o.ferme()).toBe(true);
    expect(o.delaisLongs).toContain(60_000); // fermeture de sécurité programmée
    expect(o.stock.get('importAuto.ongletDeFond')).toBeNull(); // marque à usage unique
  });

  it('tournoi arrêté ou plus dû : rien envoyé, onglet fermé', async () => {
    const o = await ongletDeFond({ du: false });
    expect(o.ingest).toEqual([]);
    expect(o.ferme()).toBe(true);
  });

  it('ancre sans marque correspondante (page ouverte à la main) : cycle normal, jamais fermée', async () => {
    const o = await ongletDeFond({ marqueNonce: 'autre' });
    expect(o.ferme()).toBe(false);
    expect(o.ingest).toHaveLength(1);
  });
});
