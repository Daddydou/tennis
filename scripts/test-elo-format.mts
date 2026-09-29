/**
 * TESTS DE NON-RÉGRESSION — Elo bo3 / bo5 séparés (lib/elo.ts `majElo`,
 * `calculerElos`, `ecartFormat`, `K_ECART_BO5`).
 *
 * Node pur, même convention que scripts/test-blend-cotes.mts :
 * `npm run test:elo-format`.
 */
import {
  calculerElos,
  ecartFormat,
  majElo,
  nouvelEloRecord,
  pVictoire,
} from '../lib/elo.ts';
import type { Match } from '../lib/types.ts';

let echecs = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    echecs++;
    console.error('ÉCHEC:', msg);
  } else {
    console.log('ok:', msg);
  }
}

/** Match terminé A bat B, au tour `round`. */
function match(a: string, b: string, round = 'R32', position = 0): Match {
  const joueur = (id: string, winner: boolean) => ({
    id,
    name: id,
    seed: null,
    country: null,
    isBye: false,
    winner,
    sets: [],
  });
  return {
    matchId: null,
    round,
    roundLabel: round,
    position,
    half: 'top',
    status: 'completed',
    players: [joueur(a, true), joueur(b, false)],
  } as unknown as Match;
}

/* ========================================================================
 * Un match bo3 ne touche jamais l'écart bo5 — et bestOf omis vaut bo3.
 * ======================================================================== */
{
  const a1 = nouvelEloRecord('A', 1800);
  const b1 = nouvelEloRecord('B', 1700);
  const a2 = nouvelEloRecord('A', 1800);
  const b2 = nouvelEloRecord('B', 1700);
  majElo(a1, b1, 'clay');
  majElo(a2, b2, 'clay', 3);
  assert(a1.ecartBo5 === 0 && b1.ecartBo5 === 0 && a1.matchesBo5 === 0, 'bo3 : écart bo5 intact');
  assert(a1.overall === a2.overall && b1.bySurface.clay === b2.bySurface.clay, 'bestOf omis ≡ bestOf 3');
}

/* ========================================================================
 * Un match bo5 met à jour l'Elo général EXACTEMENT comme un bo3, et en plus
 * l'écart, dans le sens du résultat et à somme nulle (mêmes K au départ).
 * ======================================================================== */
{
  const a3 = nouvelEloRecord('A', 1800);
  const b3 = nouvelEloRecord('B', 1700);
  const a5 = nouvelEloRecord('A', 1800);
  const b5 = nouvelEloRecord('B', 1700);
  majElo(a3, b3, 'hard', 3);
  majElo(b5, a5, 'hard', 5); // surprise : B bat A en bo5
  const a3bis = nouvelEloRecord('A', 1800);
  const b3bis = nouvelEloRecord('B', 1700);
  majElo(b3bis, a3bis, 'hard', 3);
  assert(a5.overall === a3bis.overall && b5.overall === b3bis.overall, 'bo5 : Elo général identique au bo3');
  assert(b5.ecartBo5 > 0 && a5.ecartBo5 < 0, 'bo5 : le vainqueur gagne de l’écart, le perdant en perd');
  assert(Math.abs(a5.ecartBo5 + b5.ecartBo5) < 1e-9, 'bo5 : écart à somme nulle au premier match');
  assert(a5.matchesBo5 === 1 && b5.matchesBo5 === 1, 'bo5 : compteur de matchs bo5');
  // Surprise à 36 % : l'écart bouge moins qu'un Elo plein (K réduit).
  const deltaElo = b5.overall - 1700;
  assert(b5.ecartBo5 < deltaElo, 'bo5 : l’écart apprend plus lentement que l’Elo');
  assert(pVictoire(1700 + b5.ecartBo5, 1800 + a5.ecartBo5) > pVictoire(1700, 1800), 'bo5 : la surprise rapproche la prévision bo5');
}

/* ========================================================================
 * ecartFormat : nul en bo3, l'écart en bo5.
 * ======================================================================== */
{
  const r = nouvelEloRecord('A');
  r.ecartBo5 = 42;
  assert(ecartFormat(r, 3) === 0, 'ecartFormat bo3 = 0');
  assert(ecartFormat(r, 5) === 42, 'ecartFormat bo5 = écart');
}

/* ========================================================================
 * calculerElos : `bestOf` par tournoi, omis = bo3 (compatibilité).
 * ======================================================================== */
{
  const matches = [match('A', 'B', 'R32', 0), match('C', 'D', 'R32', 1), match('A', 'C', 'R16', 0)];
  const sans = calculerElos([{ matches, surface: 'clay' }], { A: 1700, B: 1700, C: 1700, D: 1700 });
  const bo5 = calculerElos([{ matches, surface: 'clay', bestOf: 5 }], { A: 1700, B: 1700, C: 1700, D: 1700 });
  assert(Object.values(sans).every((r) => r.ecartBo5 === 0), 'calculerElos sans bestOf : aucun écart bo5');
  assert(bo5.A.ecartBo5 > 0 && bo5.B.ecartBo5 < 0 && bo5.A.matchesBo5 === 2, 'calculerElos bo5 : écarts appris');
  assert(sans.A.overall === bo5.A.overall, 'calculerElos bo5 : Elo général inchangé');
}

if (echecs) {
  console.error(`\n${echecs} échec(s)`);
  process.exit(1);
}
console.log('\nTous les tests passent.');
