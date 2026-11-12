// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { pointsDuTour } from '../bracketArbre';
import { possibilitesBracket, type EntreePossibilites } from '../bracketPossibilites';
import { BAREME_DAVIS, BAREME_THOMAS } from '../thomasApi';

/**
 * Barème du Bracket à la Coupe Davis : une nation juste vaut 2 / 4 / 8 (quart, demie, finale) au lieu de 1 / 2 / 4.
 * Les autres tournois gardent 1, 2, 4, 8... sans changement.
 */
describe('pointsDuTour - Coupe Davis', () => {
  it('QF, SF, F : 2 / 4 / 8', () => {
    const rounds = ['QF', 'SF', 'F'];
    expect(rounds.map((r) => pointsDuTour(rounds, r))).toEqual([2, 4, 8]);
  });

  it('un tableau de 16 ou de 8 ordinaire garde 1 / 2 / 4 (/ 8)', () => {
    const seize = ['R16', 'QF', 'SF', 'F'];
    expect(seize.map((r) => pointsDuTour(seize, r))).toEqual([1, 2, 4, 8]);
    const huit = ['R16', 'QF', 'SF'];
    expect(huit.map((r) => pointsDuTour(huit, r))).toEqual([1, 2, 4]);
  });

  it('un tour inconnu vaut 0', () => {
    expect(pointsDuTour(['QF', 'SF', 'F'], 'R32')).toBe(0);
  });
});

describe('BAREME_DAVIS (recalcul des points de Thomas)', () => {
  it('2 / 4 / 8 pour les tours 1 / 2 / 3, le double du barème Thomas', () => {
    expect([1, 2, 3].map(BAREME_DAVIS)).toEqual([2, 4, 8]);
    expect([1, 2, 3].map((t) => BAREME_DAVIS(t) / BAREME_THOMAS(t))).toEqual([2, 2, 2]);
  });
});

describe('possibilitesBracket - facteurPoints', () => {
  const noms = new Map([1, 2, 3, 4, 5, 6, 7, 8].map((p) => [p, `P${p}`]));
  const base: EntreePossibilites = {
    drawSize: 8,
    noms,
    matchs: [
      { tour: 1, index: 0, position1: 1, position2: 2, vainqueur: 1 },
      { tour: 1, index: 1, position1: 3, position2: 4, vainqueur: 4 },
      { tour: 1, index: 2, position1: 5, position2: 6, vainqueur: null },
      { tour: 1, index: 3, position1: 7, position2: 8, vainqueur: null },
    ],
    participants: [{ userId: 'a', pseudo: 'Alice', points: 1 }],
    pronostics: [1, 3, 5, 7].map((position, index) => ({ userId: 'a', tour: 1, index, position })),
  };
  const alice = (e: EntreePossibilites) => possibilitesBracket(e).find((x) => x.pseudo === 'Alice')!;

  it('sans facteur : barème 1 / 2 / 4 (inchangé)', () => {
    const a = alice(base);
    expect(a.visibles).toBe(2);
    expect(a.bornes).toEqual({ min: 5, max: 11 });
  });

  it('facteur 2 : les points encore atteignables doublent, les points déjà acquis restent tels quels', () => {
    const a = alice({ ...base, facteurPoints: 2 });
    expect(a.visibles).toBe(4);
    // 1 acquis + 4 visibles + 4 cachés au minimum ; 1 acquis + 4 visibles + 16 cachés au maximum.
    expect(a.bornes).toEqual({ min: 1 + 4 + 4, max: 1 + 4 + 16 });
  });
});
