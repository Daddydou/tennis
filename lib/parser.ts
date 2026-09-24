/**
 * PARSER — JSON DU BOOKMARKLET → STRUCTURES DU MOTEUR
 *
 * Les bookmarklets ATP et WTA produisent le MÊME JSON brut, au champ `tour`
 * près ('ATP' / 'WTA'). Ce module le normalise, en déduit les joueurs, les
 * moitiés de tableau et l'ordre des tours.
 */

// Point d'entrée : le code vit dans trois modules, réexportés tels quels pour
// que les imports `@/lib/parser` restent valables.
//   - parserExtraction.ts : JSON brut → DrawExtract (tours, circuit, identité)
//   - parserJoueurs.ts    : joueurs, réconciliation d'IDs, présence par tour
//   - parserControles.ts  : surface, best-of, contrôle de cohérence
export * from './parserExtraction';
export * from './parserJoueurs';
export * from './parserControles';
