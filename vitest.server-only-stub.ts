// Stub pour les tests (Vitest/Vite) : le vrai paquet `server-only` lève
// TOUJOURS une erreur à l'import — Next.js le remplace par un no-op
// uniquement dans les bundles serveur de SON propre bundler (webpack/
// Turbopack), une substitution que Vite ignore. Voir vitest.config.mts
// (resolve.alias) : les composants testés importent des modules marqués
// `import 'server-only'` (Server Actions) sans jamais l'exécuter réellement
// côté serveur — ce fichier vide suffit donc pour les tests.
export {};
