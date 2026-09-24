/**
 * Point d'entrée des lectures en base et de la reconstruction du moteur.
 * Le code vit dans quatre modules, réexportés tels quels pour que les imports
 * `@/db/queries` restent valables :
 *   - types.ts    : types des lignes DB (tables tn_*)
 *   - lectures.ts : requêtes de lecture (clé anon, policies RLS de lecture)
 *   - tableau.ts  : faits du tableau (joueurs en lice, tour courant, slots)
 *   - moteur.ts   : reconstruction des structures de lib/ et loadEngineData
 */
export * from './types';
export * from './lectures';
export * from './tableau';
export * from './moteur';
