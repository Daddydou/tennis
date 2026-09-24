import 'server-only';

// Point d'entrée : le code vit dans deux modules, réexportés tels quels pour
// que les imports `@/db/fantasy` restent valables.
//   - fantasy-cache.ts      : espérances Fantasy depuis le tirage, cache tn_fantasy
//   - fantasy-historique.ts : équipe optimale, score réel, historique prédit/réalisé
export * from './fantasy-cache';
export * from './fantasy-historique';
