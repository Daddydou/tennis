/**
 * Construit tools/userscript/import-auto.user.js depuis src/main.ts, en y
 * empaquetant les extracteurs partagés de lib/extract/ (aucune copie à la main).
 *
 *   npm run build:userscript           écrit le fichier
 *   npm run build:userscript -- --check  échoue si le fichier committé est périmé
 *
 * Le fichier produit ne contient AUCUN secret : le jeton est saisi dans
 * Tampermonkey à la première exécution.
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ici = (p) => fileURLToPath(new URL(p, import.meta.url));
const SORTIE = ici('./import-auto.user.js');

export const ENTETE = `// ==UserScript==
// @name         Tennis — import auto des tableaux
// @namespace    https://tennis-nine-zeta.vercel.app/
// @version      1.0.2
// @description  Réimporte les tableaux ATP (et WTA en repli) dans l'app tennis toutes les 12 h, jusqu'à la finale.
// @match        https://www.atptour.com/*
// @match        https://www.wtatennis.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_openInTab
// @grant        window.close
// @connect      tennis-nine-zeta.vercel.app
// @run-at       document-idle
// @noframes
// ==/UserScript==
//
// FICHIER GÉNÉRÉ par tools/userscript/build.mjs depuis tools/userscript/src/main.ts
// et lib/extract/ — ne pas modifier à la main (npm run build:userscript).
`;

export async function construire() {
  const r = await build({
    entryPoints: [ici('./src/main.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    charset: 'utf8',
    legalComments: 'none',
    banner: { js: ENTETE },
    logLevel: 'silent',
  });
  return r.outputFiles[0].text.replace(/\r\n/g, '\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const code = await construire();
  if (process.argv.includes('--check')) {
    let actuel = '';
    try {
      actuel = readFileSync(SORTIE, 'utf8').replace(/\r\n/g, '\n');
    } catch {
      /* absent */
    }
    if (actuel !== code) {
      console.error('import-auto.user.js est périmé : lancer npm run build:userscript');
      process.exit(1);
    }
    console.log('import-auto.user.js à jour.');
  } else {
    writeFileSync(SORTIE, code);
    console.log(`Écrit : ${SORTIE} (${code.length} octets)`);
  }
}
