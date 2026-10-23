import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Copies VERBATIM des snippets console (tests de parité) : à ne pas retoucher.
    "lib/extract/__tests__/fixtures/**",
    // Bundle généré du userscript (npm run build:userscript).
    "tools/userscript/import-auto.user.js",
  ]),
  // Scripts de recherche (hors app, lecture de JSON/CSV bruts) : 'any' toléré.
  {
    files: ["recherche/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
]);

export default eslintConfig;
