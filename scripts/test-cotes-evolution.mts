/**
 * TESTS — évolution des cotes avant un match (lib/cotesEvolution.ts).
 *
 * Node pur (aucun React, aucun Supabase), même convention que
 * scripts/test-bracketsim.mts : `npm run test:cotes-evolution`.
 */
import { seriesCotes, type CaptureCote } from '../lib/cotesEvolution.ts';

let echecs = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    echecs++;
    console.error('ÉCHEC:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const m1 = { eventId: 'e1', nomA: 'Sinner', nomB: 'Zverev', commenceTime: '2026-09-10T18:00:00Z' };
const m2 = { eventId: 'e2', nomA: 'Alcaraz', nomB: 'Fritz', commenceTime: '2026-09-09T16:00:00Z' };

const captures: CaptureCote[] = [
  // Désordonnées exprès : la série doit être triée par instant de capture
  { ...m1, probaA: 0.7, captureLe: '2026-09-10T09:00:00Z' },
  { ...m1, probaA: 0.62, captureLe: '2026-09-08T09:00:00Z' },
  { ...m1, probaA: 0.66, captureLe: '2026-09-09T09:00:00Z' },
  // Capture prise pendant le match (cote live) : exclue
  { ...m1, probaA: 0.95, captureLe: '2026-09-10T19:00:00Z' },
  // Pas de consensus : exclue
  { ...m1, probaA: null, captureLe: '2026-09-09T12:00:00Z' },
  { ...m2, probaA: 0.55, captureLe: '2026-09-08T09:00:00Z' },
  // Toutes les captures de e3 sont live : pas de série du tout
  { eventId: 'e3', nomA: 'X', nomB: 'Y', commenceTime: '2026-09-01T10:00:00Z', probaA: 0.5, captureLe: '2026-09-01T11:00:00Z' },
  // Sans heure connue : gardée, série en dernier
  { eventId: 'e4', nomA: 'Sans', nomB: 'Heure', commenceTime: null, probaA: 0.4, captureLe: '2026-09-08T09:00:00Z' },
];

const series = seriesCotes(captures);
assert(series.length === 3, `3 séries : e3 n'a que des captures live (obtenu ${series.length})`);
assert(series.map((s) => s.eventId).join() === 'e2,e1,e4', 'triées par coup d’envoi, sans heure en dernier');

const s1 = series.find((s) => s.eventId === 'e1')!;
assert(s1.points.map((p) => p.probaA).join() === '0.62,0.66,0.7', 'e1 : trois points avant le match, dans l’ordre du temps, sans live ni null');
assert(Math.abs(s1.variation - 0.08) < 1e-9, `e1 : variation +8 pts (obtenu ${s1.variation})`);

const s2 = series.find((s) => s.eventId === 'e2')!;
assert(s2.points.length === 1 && s2.variation === 0, 'une seule capture : un point, variation nulle');

// L'API peut corriger l'horaire : on garde celui de la capture la plus récente.
const decale = seriesCotes([
  { ...m1, probaA: 0.6, captureLe: '2026-09-08T09:00:00Z', commenceTime: '2026-09-10T12:00:00Z' },
  { ...m1, probaA: 0.6, captureLe: '2026-09-09T09:00:00Z' },
]);
assert(decale[0].commenceTime === m1.commenceTime, 'horaire repris de la capture la plus récente');

assert(seriesCotes([]).length === 0, 'aucune capture : aucune série');

if (echecs > 0) {
  console.error(`\n${echecs} test(s) en échec.`);
  process.exit(1);
}
console.log('\nTOUS LES TESTS PASSENT');
