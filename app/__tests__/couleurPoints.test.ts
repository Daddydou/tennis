import { describe, expect, it } from 'vitest';
import { couleurPoints } from '../ui';

describe('couleurPoints', () => {
  it('sarcelle quand des points sont marqués', () => {
    expect(couleurPoints(5)).toBe('text-juste');
    expect(couleurPoints(0.5)).toBe('text-juste');
  });

  it('framboise quand le pick est resté à zéro (ou négatif)', () => {
    expect(couleurPoints(0)).toBe('text-rate');
    expect(couleurPoints(-2)).toBe('text-rate');
  });

  it('aucune couleur tant que le match n\'est pas joué', () => {
    expect(couleurPoints(null)).toBe('');
    expect(couleurPoints(undefined)).toBe('');
  });
});
