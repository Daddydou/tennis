/**
 * BACKTEST MADRID 2026 — version TypeScript
 * Doit reproduire les résultats du Python : optimiseur 136 pts sur 216.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseExtract, extraireJoueurs, joueursParTour } from '../lib/parser';
import { pointsAtRound } from '../lib/scoring';
import {
  calculerEsperances,
  optimiser,
  genererSlots,
  type Esperances,
} from '../lib/optimizer';
import type { Pick as PickJoueur } from '../lib/types';

// Elo terre battue estimés (à remplacer par des Elo calculés)
const ELO_CLAY: Record<string, number> = {
  S0AG: 2210, Z355: 2130, AG37: 2020, S0S1: 1985, DH58: 1995, M0EJ: 2060,
  MM58: 1975, BK92: 1930, RE44: 1990, C0E9: 1960, L0BV: 1955, RH16: 2045,
  KE29: 1940, VA25: 1885, PL56: 1925, C0AU: 1970, T0HA: 1880, D0FJ: 1945,
  N771: 1900, DH50: 1930, F0F1: 1950, RC91: 1875, M0NI: 1910, EA24: 1900,
  MW02: 1880, F0FV: 1935, N0AE: 1870, GJ37: 1880, HH26: 1885, SU55: 1850,
  D0F6: 1855, M0QI: 1865, TE51: 1915, HB71: 1860, B0PG: 1830, D875: 1840,
  MC65: 1780, C977: 1790, BK40: 1810, SL28: 1820, TE30: 1835, A0GC: 1825,
  N0BS: 1830, C0C8: 1845, MU94: 1820, M0FH: 1855, B0BI: 1840, P09Z: 1815,
  KI95: 1810, BD06: 1805, SU87: 1815, ME82: 1780, AE14: 1800, M0CI: 1820,
  GC88: 1780, O522: 1770, CD85: 1790, F724: 1785, U182: 1810, BT72: 1805,
  D923: 1790, H997: 1780, O513: 1795, B0GG: 1770, KI82: 1775, T0A1: 1780,
  GD64: 1775, L987: 1770, W09E: 1760, B0CD: 1755, S0H2: 1750, D0C1: 1760,
  BU13: 1765, MP20: 1755, R0EB: 1740, B0ID: 1745, N0AM: 1750, Z371: 1720,
  TA29: 1700, K0A3: 1690, D0DW: 1710, BM95: 1755, M0K4: 1730, C0NB: 1725,
  C0DF: 1735, P0HW: 1745, BG23: 1730, F0F2: 1725, J0DZ: 1720, M0N7: 1715,
  G0FW: 1720, V0DP: 1705, B0U4: 1710, D0DT: 1700, L0IL: 1695, Q02L: 1690,
};
const ELO_DEF = 1700;

const raw = JSON.parse(readFileSync(join(__dirname, 'tournois/21-madrid.json'), 'utf-8'));
const extract = parseExtract(raw);
const rounds = extract.roundsFound;

// Joueurs, avec les Elo terre injectés
const players = extraireJoueurs(extract);
for (const id of Object.keys(players)) {
  const e = ELO_CLAY[id] ?? ELO_DEF;
  players[id].eloOverall = e;
  players[id].eloClay = e;
  players[id].eloHard = e;
  players[id].eloGrass = e;
}

const slots = genererSlots(rounds);
const presents = joueursParTour(extract);

console.log('='.repeat(74));
console.log('BACKTEST MADRID 2026 — TypeScript');
console.log(
  `${extract.matchCount} matchs · ${Object.keys(players).length} joueurs · ` +
    `${slots.length} picks`
);
console.log('='.repeat(74));

const evaluer = (picks: { playerId: string; round: string }[]) =>
  picks.reduce((s, p) => s + pointsAtRound(extract.matches, p.playerId, p.round, 3), 0);

// ---- Optimiseur : affectation globale
const esp = calculerEsperances(extract.matches, players, rounds, 3, 0.6, 'clay');
const picksOpt = optimiser(esp, players, slots);

// ---- Meilleur Elo (glouton)
function gloutonElo(): PickJoueur[] {
  const out: PickJoueur[] = [];
  const used = new Set<string>();
  for (const slot of slots) {
    const dispo = (presents[slot.round] ?? []).filter(
      (id) => !used.has(id) && (!slot.half || players[id]?.half === slot.half)
    );
    if (!dispo.length) continue;
    const best = dispo.reduce((a, b) =>
      (ELO_CLAY[a] ?? ELO_DEF) >= (ELO_CLAY[b] ?? ELO_DEF) ? a : b
    );
    used.add(best);
    out.push({ round: slot.round, half: slot.half, playerId: best, playerName: players[best].name });
  }
  return out;
}

// ---- Classement (têtes de série)
function gloutonSeed() {
  const out: PickJoueur[] = [];
  const used = new Set<string>();
  for (const slot of slots) {
    const dispo = (presents[slot.round] ?? []).filter(
      (id) => !used.has(id) && (!slot.half || players[id]?.half === slot.half)
    );
    if (!dispo.length) continue;
    const seeded = dispo.filter((id) => players[id]?.seed);
    const best = seeded.length
      ? seeded.reduce((a, b) => (players[a].seed! <= players[b].seed! ? a : b))
      : dispo.reduce((a, b) => ((ELO_CLAY[a] ?? ELO_DEF) >= (ELO_CLAY[b] ?? ELO_DEF) ? a : b));
    used.add(best);
    out.push({ round: slot.round, half: slot.half, playerId: best, playerName: players[best].name });
  }
  return out;
}

// ---- Oracle : affectation sur les points réels
const reels: Esperances = {};
for (const r of rounds) {
  for (const id of presents[r] ?? []) {
    (reels[id] ??= {})[r] = pointsAtRound(extract.matches, id, r, 3);
  }
}
const picksOracle = optimiser(reels, players, slots);

// ---- Aléatoire
function aleatoire(n = 3000): { moyenne: number; median: number; p90: number; max: number } {
  const totaux: number[] = [];
  for (let k = 0; k < n; k++) {
    const used = new Set<string>();
    let tot = 0;
    for (const slot of slots) {
      const dispo = (presents[slot.round] ?? []).filter(
        (id) => !used.has(id) && (!slot.half || players[id]?.half === slot.half)
      );
      if (!dispo.length) continue;
      const pick = dispo[Math.floor(Math.random() * dispo.length)];
      used.add(pick);
      tot += pointsAtRound(extract.matches, pick, slot.round, 3);
    }
    totaux.push(tot);
  }
  totaux.sort((a, b) => a - b);
  return {
    moyenne: totaux.reduce((a, b) => a + b, 0) / totaux.length,
    median: totaux[Math.floor(totaux.length / 2)],
    p90: totaux[Math.floor(totaux.length * 0.9)],
    max: totaux[totaux.length - 1],
  };
}

const picksElo = gloutonElo();
const picksSeed = gloutonSeed();
const alea = aleatoire();

const scores: Record<string, number> = {
  'OPTIMISEUR': evaluer(picksOpt),
  'MEILLEUR ELO': evaluer(picksElo),
  'CLASSEMENT': evaluer(picksSeed),
  'ALÉATOIRE': alea.moyenne,
  'ORACLE': evaluer(picksOracle),
};

const oracle = scores['ORACLE'];
console.log(`\n${'STRATÉGIE'.padEnd(18)}${'POINTS'.padStart(8)}   ${'% ORACLE'.padStart(9)}`);
console.log('-'.repeat(40));
for (const [nom, pts] of Object.entries(scores).sort((a, b) => b[1] - a[1])) {
  console.log(
    `${nom.padEnd(18)}${pts.toFixed(1).padStart(8)}   ${((pts / oracle) * 100).toFixed(1).padStart(8)}%`
  );
}
console.log(`\nAléatoire — médiane ${alea.median}, p90 ${alea.p90}, max ${alea.max}`);

console.log('\n' + '='.repeat(74));
console.log(`OPTIMISEUR — ${scores['OPTIMISEUR'].toFixed(0)} pts (${picksOpt.length} picks)`);
console.log('-'.repeat(74));
console.log(`${'Tour'.padEnd(6)}${'Moitié'.padEnd(9)}${'Joueur'.padEnd(26)}${'E[pts]'.padStart(8)}${'Réel'.padStart(7)}`);
console.log('-'.repeat(74));
for (const p of picksOpt) {
  const reel = pointsAtRound(extract.matches, p.playerId, p.round, 3);
  console.log(
    `${p.round.padEnd(6)}${(p.half ?? '-').padEnd(9)}${p.playerName.padEnd(26)}` +
      `${p.ePoints.toFixed(2).padStart(8)}${String(reel).padStart(7)}`
  );
}
