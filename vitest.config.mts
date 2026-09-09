import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Tests de COMPOSANTS RÉACT (Vitest + React Testing Library, jsdom) — pas de
 * navigateur, pas d'authentification : ils isolent un composant client et
 * simulent les clics/sélections dessus, pour couvrir le câblage React (état,
 * re-render, callbacks) que scripts/test-bracketsim.mts (Node pur, sans
 * React) ne teste pas. Distinct de `npm run test:bracketsim`.
 */
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // Les composants testés importent (transitivement, via les Server
      // Actions qu'ils appellent) des modules marqués `import 'server-only'`
      // — jamais exécutés pour de vrai côté serveur ici. Next.js substitue
      // ce marqueur par un no-op dans SES bundles serveur (webpack/
      // Turbopack) ; Vite l'ignore et charge le vrai paquet, qui lève
      // toujours. cf. vitest.server-only-stub.ts.
      'server-only': fileURLToPath(new URL('./vitest.server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
