import { describe, expect, it } from 'vitest';
import { planAvecPlanB, planifier } from '../planPicks';
import type { Half, Slot } from '../types';

const slots: Slot[] = [
  { round: 'R1', half: null },
  { round: 'R2', half: null },
];

/** A vaut 10 puis 9, B vaut 9 puis 2 : le glouton prend A tout de suite et finit à 12. */
const esperances = {
  A: { R1: 10, R2: 9 },
  B: { R1: 9, R2: 2 },
};
const moitie: Record<string, Half> = { A: 'top', B: 'top' };

describe('planifier', () => {
  it('répartit les favoris sur la durée du tournoi (18 plutôt que 12 pour le glouton)', () => {
    const plan = planifier({ slots, esperances, moitie });
    expect(plan.total).toBe(18);
    expect(plan.picks.map((p) => [p.round, p.playerId])).toEqual([
      ['R1', 'B'],
      ['R2', 'A'],
    ]);
  });

  it('ne reprend pas un joueur déjà pické', () => {
    const plan = planifier({ slots, esperances, moitie, exclus: new Set(['A']) });
    expect(plan.picks.map((p) => p.playerId)).toEqual(['B']);
    expect(plan.sansJoueur).toEqual([slots[1]]);
  });

  it('respecte la moitié de tableau du slot', () => {
    const parMoitie: Slot[] = [
      { round: 'R1', half: 'top' },
      { round: 'R1', half: 'bottom' },
    ];
    const plan = planifier({
      slots: parMoitie,
      esperances: { A: { R1: 10 }, B: { R1: 9 }, C: { R1: 3 } },
      moitie: { A: 'top', B: 'top', C: 'bottom' },
    });
    expect(plan.picks.map((p) => [p.half, p.playerId])).toEqual([
      ['top', 'A'],
      ['bottom', 'C'],
    ]);
  });

  it('un joueur éliminé (espérance nulle) ne sort jamais dans le plan', () => {
    const plan = planifier({
      slots,
      esperances: { A: { R1: 0, R2: 0 }, B: { R1: 9, R2: 2 } },
      moitie,
    });
    expect(plan.picks.map((p) => p.playerId)).toEqual(['B']);
  });

  it('sans aucun candidat : plan vide, tous les slots signalés', () => {
    const plan = planifier({ slots, esperances: {}, moitie: {} });
    expect(plan.picks).toEqual([]);
    expect(plan.total).toBe(0);
    expect(plan.sansJoueur).toHaveLength(2);
  });
});

describe('planAvecPlanB', () => {
  it('donne le remplaçant et ce que sa absence coûte sur tout le plan', () => {
    const plan = planAvecPlanB({
      slots,
      esperances: { ...esperances, C: { R1: 5, R2: 5 } },
      moitie: { ...moitie, C: 'top' },
    });
    expect(plan.total).toBe(18);
    const r1 = plan.picks.find((p) => p.round === 'R1')!;
    expect(r1.playerId).toBe('B');
    // Sans B : A à R1 (10) + C à R2 (5) = 15, soit 3 de moins que 18 ; ou C à R1 + A à R2 = 14.
    expect(r1.planB).toEqual({ playerId: 'A', ePoints: 10, perte: 3 });
  });

  it('le plan B ne dépasse jamais le plan', () => {
    const plan = planAvecPlanB({ slots, esperances, moitie });
    for (const p of plan.picks) expect(p.planB?.perte ?? 0).toBeGreaterThanOrEqual(0);
  });
});
