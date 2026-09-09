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
  test: {
    environment: 'jsdom',
    include: ['**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
