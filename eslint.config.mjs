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
]);

export default eslintConfig;
