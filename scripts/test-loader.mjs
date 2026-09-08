/**
 * Loader ESM minimal pour exécuter les scripts de test (scripts/test-*.mts)
 * avec `node` tout court : résout les imports relatifs sans extension et
 * l'alias `@/` — Next.js les résout à la compilation (tsconfig
 * `moduleResolution: bundler`), mais `node` seul ne le fait pas.
 *
 * Usage : node --experimental-loader ./scripts/test-loader.mjs <fichier.mts>
 * (cf. package.json, script `test:bracketsim`).
 */
import { pathToFileURL } from 'node:url';

const ROOT = pathToFileURL(process.cwd() + '/').href;

async function tryResolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch {
    if (!specifier.match(/\.[a-z]+$/)) {
      return nextResolve(specifier + '.ts', context);
    }
    throw new Error('module introuvable : ' + specifier);
  }
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    return tryResolve(ROOT + specifier.slice(2), context, nextResolve);
  }
  return tryResolve(specifier, context, nextResolve);
}
