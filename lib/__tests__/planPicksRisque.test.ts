import { describe, expect, it } from 'vitest';
import { planAvecPlanB, planifier } from '../planPicks';
import type { Half, Slot } from '../types';

const slots: Slot[] = [
  { round: 'R16', half: 'top' },
  { round: 'R16', half: 'bottom' },
  { round: 'QF', half: 'top' },
];
const moitie: Record<string, Half> = { A: 'top', B: 'top', C: 'top', D: 'bottom', E: 'bottom' };

describe('planifier — picks imposés', () => {
  const esperances = {
    A: { R16: 10, QF: 8 },
    B: { R16: 9, QF: 6 },
    C: { R16: 4, QF: 5 },
    D: { R16: 7, QF: 0 },
    E: { R16: 6, QF: 0 },
  };

  it('garde le pick choisi et réadapte le reste du plan autour de lui', () => {
    const libre = planifier({ slots, esperances, moitie });
    // Sans contrainte : B en R16 haut, A en QF haut (10+8 = 18 > 9+... on vérifie juste la cohérence).
    expect(libre.picks).toHaveLength(3);

    const force = planifier({ slots, esperances, moitie, imposes: [{ round: 'R16', half: 'top', playerId: 'A' }] });
    const pickR16 = force.picks.find((p) => p.round === 'R16' && p.half === 'top');
    expect(pickR16).toMatchObject({ playerId: 'A', fixe: true });
    // A est pris : le quart du haut ne peut plus être A.
    const pickQF = force.picks.find((p) => p.round === 'QF');
    expect(pickQF?.playerId).not.toBe('A');
    // Le total contient bien le pick imposé.
    expect(force.total).toBeCloseTo(force.picks.reduce((s, p) => s + p.ePoints, 0), 2);
  });

  it('un pick imposé n\'a pas de plan B ; les autres en ont un', () => {
    const plan = planAvecPlanB({ slots, esperances, moitie, imposes: [{ round: 'R16', half: 'bottom', playerId: 'E' }] });
    expect(plan.picks.find((p) => p.playerId === 'E')?.planB).toBeNull();
    expect(plan.picks.filter((p) => !p.fixe).some((p) => p.planB !== null)).toBe(true);
  });
});

describe('planifier — agressivité', () => {
  // Deux joueurs d'espérance quasi égale au même tour : S est sûr, R est un pari.
  const esperances = { S: { R16: 10 }, R: { R16: 9.8 } };
  const ecart = { S: { R16: 2 }, R: { R16: 9 } };
  const un: Slot[] = [{ round: 'R16', half: null }];
  const mo: Record<string, Half> = { S: 'top', R: 'top' };

  it('k > 0 préfère le pari, k < 0 préfère le sûr, k = 0 suit l\'espérance', () => {
    expect(planifier({ slots: un, esperances, moitie: mo, risque: { ecart, k: 1 } }).picks[0].playerId).toBe('R');
    expect(planifier({ slots: un, esperances, moitie: mo, risque: { ecart, k: -1 } }).picks[0].playerId).toBe('S');
    expect(planifier({ slots: un, esperances, moitie: mo, risque: { ecart, k: 0 } }).picks[0].playerId).toBe('S');
    expect(planifier({ slots: un, esperances, moitie: mo }).picks[0].playerId).toBe('S');
  });

  it('le total affiché reste l\'espérance, même quand le choix suit le risque', () => {
    const p = planifier({ slots: un, esperances, moitie: mo, risque: { ecart, k: 1 } });
    expect(p.total).toBeCloseTo(9.8, 2);
    expect(p.picks[0].ecart).toBeCloseTo(9, 2);
  });

  it('un k très négatif ne laisse pas un slot vide tant qu\'un joueur peut y marquer', () => {
    const p = planifier({ slots: un, esperances, moitie: mo, risque: { ecart: { S: { R16: 50 }, R: { R16: 60 } }, k: -3 } });
    expect(p.picks).toHaveLength(1);
    expect(p.sansJoueur).toHaveLength(0);
  });
});
