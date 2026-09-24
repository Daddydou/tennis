/**
 * TESTS — bilan face-à-face (lib/faceAFace.ts).
 *
 * Node pur (aucun React, aucun Supabase), même convention que
 * scripts/test-bracketsim.mts : `npm run test:face-a-face`.
 */
import { bilanFaceAFace, scoreDepuisA, type RencontreBrute } from '../lib/faceAFace.ts';

let echecs = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    echecs++;
    console.error('ÉCHEC:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const base: RencontreBrute = {
  tournoi: 'Madrid 2026',
  date: '2026-04-20',
  surface: 'clay',
  round: 'QF',
  player1Id: 'A',
  player2Id: 'B',
  winnerId: 'A',
  sets: [
    { g1: 6, g2: 4 },
    { g1: 6, g2: 7, tb1: 5, tb2: 7 },
    { g1: 7, g2: 5 },
  ],
  status: 'completed',
};

// ── Score orienté ──
assert(scoreDepuisA(base.sets, true) === '6-4 6-7(5) 7-5', 'A en joueur 1 : score lu tel quel, tie-break du perdant');
assert(scoreDepuisA(base.sets, false) === '4-6 7-6(5) 5-7', 'A en joueur 2 : jeux inversés, tie-break inchangé');
assert(scoreDepuisA(null, true) === '', 'pas de score saisi : chaîne vide');
assert(scoreDepuisA([{ g1: null, g2: null }], true) === '', 'set vide ignoré');

// ── Bilan ──
const matchs: RencontreBrute[] = [
  base,
  // B bat A, A en joueur 2, sur gazon, plus récent
  { ...base, tournoi: 'Halle 2026', date: '2026-06-15', surface: 'grass', player1Id: 'B', player2Id: 'A', winnerId: 'B', sets: [{ g1: 6, g2: 3 }, { g1: 6, g2: 2 }] },
  // Walkover gagné par A : compte comme une victoire
  { ...base, tournoi: 'Rome 2026', date: '2026-05-10', status: 'walkover', sets: [] },
  // Match à venir : listé, mais ne compte pour personne
  { ...base, tournoi: 'US Open 2026', date: '2026-08-31', surface: 'hard', status: 'scheduled', winnerId: null, sets: [] },
  // Un match live qui porte déjà un « vainqueur » (le meneur) : ne compte pas
  { ...base, tournoi: 'Live', date: '2026-09-01', surface: 'hard', status: 'live', winnerId: 'A' },
  // Un autre adversaire : ignoré
  { ...base, player2Id: 'C' },
  // Un bye : ignoré
  { ...base, status: 'bye', player2Id: 'B' },
];
const bilan = bilanFaceAFace('A', 'B', matchs);

assert(bilan.victoiresA === 2 && bilan.victoiresB === 1, `2 victoires de A (dont un w.o.), 1 de B (obtenu ${bilan.victoiresA}-${bilan.victoiresB})`);
assert(bilan.rencontres.length === 5, `5 rencontres listées : ni l'autre adversaire ni le bye (obtenu ${bilan.rencontres.length})`);
assert(bilan.rencontres[0].tournoi === 'Live' && bilan.rencontres[0].vainqueur === null, 'la plus récente en tête, et un match live n’a pas de vainqueur');
assert(bilan.rencontres.find((r) => r.tournoi === 'US Open 2026')?.vainqueur === null, 'un match à venir n’a pas de vainqueur');
assert(bilan.rencontres.find((r) => r.tournoi === 'Halle 2026')?.score === '3-6 2-6', 'score de Halle lu du point de vue de A');
assert(
  JSON.stringify(bilan.parSurface) === JSON.stringify({ clay: { a: 2, b: 0 }, grass: { a: 0, b: 1 } }),
  `bilan par surface limité aux matchs décidés (obtenu ${JSON.stringify(bilan.parSurface)})`,
);

// Symétrie : le bilan vu de B est le miroir de celui vu de A.
const inverse = bilanFaceAFace('B', 'A', matchs);
assert(inverse.victoiresA === 1 && inverse.victoiresB === 2, 'vu de B, le bilan est inversé');

// Sans date : en dernier.
const sansDate = bilanFaceAFace('A', 'B', [{ ...base, date: null, tournoi: 'X' }, base]);
assert(sansDate.rencontres[1].tournoi === 'X', 'une rencontre sans date passe après les datées');

if (echecs > 0) {
  console.error(`\n${echecs} test(s) en échec.`);
  process.exit(1);
}
console.log('\nTOUS LES TESTS PASSENT');
