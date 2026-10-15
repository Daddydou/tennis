// @vitest-environment node
/**
 * Le userscript committé doit être EXACTEMENT le bundle des sources actuelles
 * (src/main.ts + lib/extract/) : pas de copie divergente des extracteurs.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { construire } from '../build.mjs';

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
