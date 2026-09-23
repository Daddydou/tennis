/**
 * BACKTEST MADRID — MONTE CARLO
 * Compare la propagation analytique et la simulation.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseExtract, extraireJoueurs, joueursParTour } from '../lib/parser';
import { pointsAtRound } from '../lib/scoring';
import { calculerEsperances, optimiser, genererSlots, type Esperances } from '../lib/optimizer';
import { simulerTournoi } from '../lib/montecarlo';
import type { Pick as PickJoueur } from '../lib/types';

const ELOS: Record<string, { overall: number; clay: number; matchs: number }> =
  JSON.parse(readFileSync(join(__dirname, 'elos.json'), 'utf-8'));
const DEF = 1650;

const raw = JSON.parse(readFileSync(join(__dirname, 'tournois/21-madrid.json'), 'utf-8'));
const extract = parseExtract(raw);
const rounds = extract.roundsFound;
const players = extraireJoueurs(extract);

for (const id of Object.keys(players)) {
  const e = ELOS[id];
  const v = e?.clay ?? DEF;
  players[id].eloOverall = e?.overall ?? DEF;
  players[id].eloClay = v;
  players[id].eloHard = v;
  players[id].eloGrass = v;
}

const slots = genererSlots(rounds);
const presents = joueursParTour(extract);
const ev = (p: { playerId: string; round: string }[]) =>
  p.reduce((s, x) => s + pointsAtRound(extract.matches, x.playerId, x.round, 3), 0);

console.log('='.repeat(74));
console.log('BACKTEST MADRID 2026 — MONTE CARLO vs ANALYTIQUE');
console.log(`Elo calcules sur 6 tournois (${Object.keys(ELOS).length} joueurs)`);
console.log('='.repeat(74));

// --- Analytique (ancienne methode)
const espAna = calculerEsperances(extract.matches, players, rounds, 3, 0.6, 'clay');
const picksAna = optimiser(espAna, players, slots);

// --- Monte Carlo
console.time('\nSimulation');
const mc = simulerTournoi(extract.matches, players, rounds, 20000, 3, 'clay', 0.6, 42);
console.timeEnd('\nSimulation');
const picksMC = optimiser(mc.esperances, players, slots);

// --- References
function glouton(cle: (id: string) => number) {
  const out: PickJoueur[] = [];
  const used = new Set<string>();
  for (const s of slots) {
    const d = (presents[s.round] ?? []).filter(
      (id) => !used.has(id) && (!s.half || players[id]?.half === s.half));
    if (!d.length) continue;
    const b = d.reduce((x, y) => (cle(x) >= cle(y) ? x : y));
    used.add(b);
    out.push({ round: s.round, half: s.half, playerId: b, playerName: players[b].name });
  }
  return out;
}
const reels: Esperances = {};
for (const r of rounds)
  for (const id of presents[r] ?? [])
    (reels[id] ??= {})[r] = pointsAtRound(extract.matches, id, r, 3);
const picksOracle = optimiser(reels, players, slots);

function alea(n = 3000) {
  const t: number[] = [];
  for (let k = 0; k < n; k++) {
    const u = new Set<string>(); let tot = 0;
    for (const s of slots) {
      const d = (presents[s.round] ?? []).filter(
        (id) => !u.has(id) && (!s.half || players[id]?.half === s.half));
      if (!d.length) continue;
      const p = d[Math.floor(Math.random() * d.length)];
      u.add(p); tot += pointsAtRound(extract.matches, p, s.round, 3);
    }
    t.push(tot);
  }
  t.sort((a, b) => a - b);
  return { moy: t.reduce((a, b) => a + b, 0) / t.length, p90: t[Math.floor(t.length * .9)] };
}

const picksElo = glouton((id) => ELOS[id]?.clay ?? DEF);
const a = alea();

const sc: [string, number, number][] = [
  ['MONTE CARLO', ev(picksMC), picksMC.length],
  ['ANALYTIQUE', ev(picksAna), picksAna.length],
  ['MEILLEUR ELO', ev(picksElo), picksElo.length],
  ['ALEATOIRE', a.moy, 12],
  ['ORACLE', ev(picksOracle), picksOracle.length],
];

const or = sc.find((x) => x[0] === 'ORACLE')![1];
console.log(`\n${'STRATEGIE'.padEnd(16)}${'POINTS'.padStart(8)}${'% ORACLE'.padStart(11)}${'PICKS'.padStart(8)}`);
console.log('-'.repeat(45));
for (const [n, p, k] of [...sc].sort((x, y) => y[1] - x[1]))
  console.log(`${n.padEnd(16)}${p.toFixed(1).padStart(8)}${((p / or) * 100).toFixed(1).padStart(10)}%${String(k).padStart(8)}`);
console.log(`\nAleatoire p90 : ${a.p90}`);

console.log(`\n${'='.repeat(74)}`);
console.log(`MONTE CARLO — ${ev(picksMC).toFixed(0)} pts`);
console.log('-'.repeat(74));
console.log(`${'Tour'.padEnd(6)}${'Moitie'.padEnd(8)}${'Joueur'.padEnd(24)}${'E[pts]'.padStart(8)}${'Reel'.padStart(7)}`);
console.log('-'.repeat(74));
for (const p of picksMC) {
  const r = pointsAtRound(extract.matches, p.playerId, p.round, 3);
  console.log(`${p.round.padEnd(6)}${(p.half ?? '-').padEnd(8)}${p.playerName.padEnd(24)}${p.ePoints.toFixed(2).padStart(8)}${String(r).padStart(7)}`);
}
