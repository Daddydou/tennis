import { describe, expect, it } from 'vitest';
import { validerBracket, type PronoBracket, type RencontreDavis } from '../davis';
import { isoVersParis, parisVersIso } from '../davisDates';

describe('heure de Paris', () => {
  it('novembre : heure d’hiver, UTC+1', () => {
    expect(parisVersIso('2026-11-18T14:00')).toBe('2026-11-18T13:00:00.000Z');
    expect(isoVersParis('2026-11-18T13:00:00.000Z')).toBe('2026-11-18T14:00');
  });

  it('été : UTC+2', () => {
    expect(parisVersIso('2026-07-14T20:30')).toBe('2026-07-14T18:30:00.000Z');
    expect(isoVersParis('2026-07-14T18:30:00.000Z')).toBe('2026-07-14T20:30');
  });

  it('saisie illisible ou vide', () => {
    expect(parisVersIso('demain')).toBeNull();
    expect(isoVersParis(null)).toBe('');
  });
});

describe('cohérence du bracket', () => {
  const ren = (tour: 'QF' | 'SF' | 'F', position: number, n1: string | null, n2: string | null): RencontreDavis => ({
    id: `${tour}${position}`,
    tour,
    position,
    nation1: n1,
    nation2: n2,
    debut: null,
    matchs: [],
  });
  const rencontres = [ren('QF', 1, 'A', 'B'), ren('QF', 2, 'C', 'D'), ren('QF', 3, 'E', 'F'), ren('QF', 4, 'G', 'H'), ren('SF', 1, null, null), ren('SF', 2, null, null), ren('F', 1, null, null)];
  const l = (tour: 'QF' | 'SF' | 'F', position: number, nation: string): PronoBracket => ({ tour, position, nation, score: '2-0' });
  const complet = [l('QF', 1, 'A'), l('QF', 2, 'D'), l('QF', 3, 'E'), l('QF', 4, 'H'), l('SF', 1, 'A'), l('SF', 2, 'H'), l('F', 1, 'A')];

  it('accepte un bracket cohérent', () => {
    expect(validerBracket(rencontres, complet)).toEqual([]);
  });

  it('refuse une nation qui ne joue pas le quart', () => {
    expect(validerBracket(rencontres, [l('QF', 1, 'C')])).toHaveLength(1);
  });

  it('refuse une demie dont le vainqueur n’a pas été choisi en quart', () => {
    // La finale suit la demie fautive (B) : seule la demie est à reprocher.
    const faux = complet.map((x) => (x.tour === 'SF' && x.position === 1 ? l('SF', 1, 'B') : x.tour === 'F' ? l('F', 1, 'B') : x));
    expect(validerBracket(rencontres, faux)).toHaveLength(1);
  });

  it('refuse une finale sans demies choisies', () => {
    expect(validerBracket(rencontres, [l('F', 1, 'A')])).toHaveLength(1);
  });
});
