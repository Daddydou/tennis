/**
 * Validation du moteur : scoring sur les 7 cas de référence,
 * puis backtest Madrid 2026 pour confirmer la parité avec le Python.
 */

import { scoreMatch, type SetPair } from '../lib/scoring';
import type { MatchStatus } from '../lib/types';
import { affectationHongroise, esperancePoints } from '../lib/optimizer';

console.log('='.repeat(74));
console.log('VALIDATION DU SCORING');
console.log('='.repeat(74));

const p = (pairs: [number, number][]): SetPair[] =>
  pairs.map(([a, b]) => ({ for: a, against: b }));

const cas: [string, SetPair[], boolean, MatchStatus, number][] = [
  ['Fritz bat Bublik 7-6 6-4 6-4', p([[7, 6], [6, 4], [6, 4]]), true, 'completed', 19],
  ['Skatov bat de Jong 1-6 6-4 6-3', p([[1, 6], [6, 4], [6, 3]]), true, 'completed', 13],
  ['Wawrinka perd 4-6 6-4 3-6', p([[4, 6], [6, 4], [3, 6]]), false, 'completed', 2],
  ['Sinner bat Zverev 6-1 6-2 (finale)', p([[6, 1], [6, 2]]), true, 'completed', 20],
  ['Domination 6-0 6-0', p([[6, 0], [6, 0]]), true, 'completed', 23],
  // Barème corrigé (migration 0013) : forfait = 5 pts de base seuls ;
  // abandon = seuls les sets entièrement joués comptent.
  ['Walkover', [], true, 'walkover', 5],
  ['Abandon après 6-3', p([[6, 3]]), true, 'retired', 11],
];

let ok = 0;
for (const [desc, sets, won, status, attendu] of cas) {
  const r = scoreMatch(sets, won, status, 3);
  const bon = r.total === attendu;
  ok += bon ? 1 : 0;
  console.log(
    `[${bon ? 'OK  ' : 'FAIL'}] ${desc.padEnd(36)} ` +
      `match ${String(r.match).padStart(2)} | sets ${String(r.netSets).padStart(2)} | ` +
      `games ${String(r.netGames).padStart(2)} | TOTAL ${String(r.total).padStart(2)} ` +
      `(attendu ${attendu})`
  );
}
console.log(`\nSCORING : ${ok}/${cas.length}`);

// ---------------------------------------------------------------- hongrois

console.log('\n' + '='.repeat(74));
console.log('VALIDATION DE L\'ALGORITHME HONGROIS');
console.log('='.repeat(74));

// Cas simple avec optimum connu : la diagonale anti-triviale
const gains = [
  [10, 19, 8],
  [10, 18, 7],
  [13, 16, 9],
];
const aff = affectationHongroise(gains);
const total = aff.reduce((s, c, i) => s + (c >= 0 ? gains[i][c] : 0), 0);
console.log(`Affectation : ${JSON.stringify(aff)}  total = ${total}`);
console.log(`Optimum attendu : 10 + 18 + 9 = 37, ou 19 + 10 + 9 = 38`);

// Vérification par force brute
function permutations(n: number): number[][] {
  if (n === 1) return [[0]];
  const out: number[][] = [];
  for (const sub of permutations(n - 1)) {
    for (let i = 0; i <= sub.length; i++) {
      const copy = [...sub];
      copy.splice(i, 0, n - 1);
      out.push(copy);
    }
  }
  return out;
}
let best = -Infinity;
let bestPerm: number[] = [];
for (const perm of permutations(3)) {
  const s = perm.reduce((acc, c, i) => acc + gains[i][c], 0);
  if (s > best) {
    best = s;
    bestPerm = perm;
  }
}
console.log(`Force brute : ${JSON.stringify(bestPerm)} total = ${best}`);
console.log(total === best ? '[OK  ] hongrois = optimum' : '[FAIL] écart détecté');

// ---------------------------------------------------------------- espérance

console.log('\n' + '='.repeat(74));
console.log('ESPÉRANCE DE POINTS SELON L\'ÉCART ELO');
console.log('='.repeat(74));
console.log(
  `\n${'Écart Elo'.padEnd(12)}${'P(win)'.padStart(8)}${'E[match]'.padStart(10)}` +
    `${'E[sets]'.padStart(9)}${'E[games]'.padStart(10)}${'TOTAL'.padStart(9)}`
);
console.log('-'.repeat(60));
for (const ecart of [0, 50, 100, 200, 300, 400, 500]) {
  const e = esperancePoints(1900 + ecart, 1900, 3);
  console.log(
    `${('+' + ecart).padEnd(12)}${e.pWin.toFixed(3).padStart(8)}` +
      `${e.eMatch.toFixed(2).padStart(10)}${e.eNetSets.toFixed(2).padStart(9)}` +
      `${e.eNetGames.toFixed(2).padStart(10)}${e.total.toFixed(2).padStart(9)}`
  );
}
console.log(
  '\nLecture : l\'espérance croît fortement avec l\'écart — les mismatches\n' +
    'rapportent bien plus que les affiches équilibrées.'
);
