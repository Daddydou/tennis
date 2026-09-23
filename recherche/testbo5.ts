import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseExtract, devinerBestOf } from '../lib/parser';
import { scoreMatch, scorePlayerInMatch, type SetPair } from '../lib/scoring';

const raw = JSON.parse(readFileSync(join(__dirname, 'tournois/25-roland-garros.json'), 'utf-8'));
const ex = parseExtract(raw);
const bo = devinerBestOf(ex.tour, ex.tournament.slug);

console.log('='.repeat(70));
console.log('TEST BEST-OF-5 — ROLAND-GARROS');
console.log('='.repeat(70));
console.log(`\nDetection du format : best of ${bo}  ${bo === 5 ? '[OK]' : '[FAIL - attendu 5]'}`);

// Zverev vainqueur : parcours complet
console.log('\nPARCOURS DE ZVEREV (vainqueur)');
console.log('-'.repeat(70));
let tot = 0;
for (const r of ex.roundsFound) {
  for (const m of ex.matches) {
    if (m.round !== r) continue;
    const s = scorePlayerInMatch(m, 'Z355', bo);
    if (!s) continue;
    const i = m.players.findIndex(p => p.id === 'Z355');
    const moi = m.players[i], adv = m.players[1 - i];
    const sc = moi.sets.map((x, k) => x.games !== null && adv.sets[k]?.games !== null
      ? `${x.games}-${adv.sets[k].games}` : '').filter(Boolean).join(' ');
    tot += s.total;
    console.log(`${r.padEnd(6)}${m.status.padEnd(11)}${sc.padEnd(22)}${String(s.total).padStart(4)} pts`);
    break;
  }
}
console.log(`${'TOTAL'.padEnd(39)}${String(tot).padStart(4)} pts`);

// Walkover en bo5 : doit donner 5 + 3x3 + 3x2 = 20
console.log('\nWALKOVER EN BO5 (Cobolli en demi)');
const wo = scoreMatch([], true, 'walkover', 5);
console.log(`  match ${wo.match} | net sets ${wo.netSets} | net games ${wo.netGames} | TOTAL ${wo.total}`);
console.log(`  attendu : 5 + 9 + 6 = 20  ${wo.total === 20 ? '[OK]' : '[FAIL]'}`);

// Comparaison bo3 / bo5 sur le meme walkover
const wo3 = scoreMatch([], true, 'walkover', 3);
console.log(`\n  Le meme walkover en bo3 : ${wo3.total} pts (2 sets incomplets)`);
console.log(`  En bo5 : ${wo.total} pts (3 sets incomplets)`);

// Match en 5 sets
const cinqSets: SetPair[] = [
  { for: 6, against: 3 }, { for: 4, against: 6 }, { for: 6, against: 4 },
  { for: 2, against: 6 }, { for: 6, against: 2 },
];
const c5 = scoreMatch(cinqSets, true, 'completed', 5);
console.log(`\nVICTOIRE EN 5 SETS 6-3 4-6 6-4 2-6 6-2`);
console.log(`  match ${c5.match} | net sets ${c5.netSets} | net games ${c5.netGames} | TOTAL ${c5.total}`);
console.log(`  attendu : 5 + (3-2)x3 + (3+2+4) = 5 + 3 + 9 = 17  ${c5.total === 17 ? '[OK]' : '[FAIL]'}`);
