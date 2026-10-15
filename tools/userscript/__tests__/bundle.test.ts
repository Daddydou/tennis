// @vitest-environment node
/**
 * Le userscript committé doit être EXACTEMENT le bundle des sources actuelles
 * (src/main.ts + lib/extract/) : pas de copie divergente des extracteurs.
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
      '// @match        https://www.atptour.com/*',
      '// @match        https://www.wtatennis.com/*',
      '// @grant        GM_xmlhttpRequest',
      '// @grant        GM_getValue',
      '// @grant        GM_setValue',
      '// @connect      tennis-nine-zeta.vercel.app',
    ]) {
      expect(f).toContain(ligne);
    }
    expect(f).not.toMatch(/IMPORT_AUTO_TOKEN\s*=/);
    expect(f).not.toMatch(/process\.env/);
  });
});

describe('voie userscript sur une vraie page ATP (Shanghai 2026)', () => {
  // Valeur de TEST, pas le vrai jeton.
  const JETON = 'jeton-userscript-de-test-'.padEnd(48, 'u');
  const URL_ATP = 'https://www.atptour.com/en/scores/current/shanghai/5014/draws';
  const TOURNOI = 'd09b52ac-f4cb-4610-8413-7fdb12514548';
  const html = readFileSync(
    fileURLToPath(new URL('../../../lib/extract/__tests__/fixtures/atp-shanghai-2026.html', import.meta.url)),
    'utf8',
  );

  /**
   * Exécute le BUNDLE committé dans jsdom, sur la page draws ouverte (voie
   * « DOM vivant »), avec un faux Tampermonkey : /etat annonce Shanghai dû,
   * et on capture le corps envoyé à /ingest.
   */
  async function executerBundle() {
    const { window } = new JSDOM(html, { url: URL_ATP, runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
    const stock = new Map<string, unknown>([['importAuto.jeton', JETON]]);
    const envois: { url: string; corps: unknown; jeton: string; anonyme: boolean }[] = [];
    const w = window as unknown as Record<string, unknown>;
    w.GM_getValue = (cle: string, defaut: unknown) => (stock.has(cle) ? stock.get(cle) : defaut);
    w.GM_setValue = (cle: string, valeur: unknown) => stock.set(cle, valeur);
    w.GM_xmlhttpRequest = (d: {
      method: string;
      url: string;
      headers: Record<string, string>;
      data?: string;
      anonymous?: boolean;
      onload: (r: { status: number; responseText: string }) => void;
    }) => {
      const corps = d.data ? JSON.parse(d.data) : null;
      envois.push({ url: `${d.method} ${d.url}`, corps, jeton: d.headers['x-import-token'], anonyme: !!d.anonymous });
      const reponse = d.url.endsWith('/api/import-auto/etat')
        ? { ok: true, tournois: [{ tournament_id: TOURNOI, tour: 'ATP', source_url: URL_ATP, mode: 'navigateur', du: true }] }
        : { ok: true, statut: 'importe', matchs_changes: 0 };
      setTimeout(() => d.onload({ status: 200, responseText: JSON.stringify(reponse) }), 0);
    };
    // Délais du script (5 s au démarrage, verrou, 30 min) ramenés à 0.
    w.setTimeout = (fn: () => void) => setTimeout(fn, 0);
    w.setInterval = () => 0;
    window.eval(fichier());
    // Fin du cycle : le badge a noté le résultat de /ingest.
    for (let i = 0; i < 100 && !stock.has('importAuto.dernier'); i++) await new Promise((r) => setTimeout(r, 10));
    return { envois, stock };
  }

  it('envoie exactement le JSON de extractAtp, avec le jeton et sans cookies', async () => {
    const { envois, stock } = await executerBundle();
    expect(envois.map((e) => e.url)).toEqual([
      'GET https://tennis-nine-zeta.vercel.app/api/import-auto/etat',
      'POST https://tennis-nine-zeta.vercel.app/api/import-auto/ingest',
    ]);
    expect(envois.every((e) => e.jeton === JETON && e.anonyme)).toBe(true);

    const { json, tournament_id } = envois[1].corps as { json: { extracted_at: string }; tournament_id: string };
    expect(tournament_id).toBe(TOURNOI);
    const attendu = extractAtp(new JSDOM(html, { url: URL_ATP }).window.document, URL_ATP)!;
    expect({ ...json, extracted_at: null }).toEqual({ ...attendu, extracted_at: null });
    expect((stock.get('importAuto.dernier') as { ok: boolean }).ok).toBe(true);
  });
});
