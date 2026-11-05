// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { nomLisible } from '../bracketPossibilites';

describe('nomLisible', () => {
  it('prénom + nom de famille en capitales de Thomas -> casse lisible', () => {
    expect(nomLisible('Ben', 'SHELTON')).toBe('Ben Shelton');
    expect(nomLisible('Thiago Agustin', 'TIRANTE')).toBe('Thiago Agustin Tirante');
  });

  it('noms composés, traits d\'union, apostrophes et accents', () => {
    expect(nomLisible('Luca', 'VAN ASSCHE')).toBe('Luca Van Assche');
    expect(nomLisible('Felix', 'AUGER-ALIASSIME')).toBe('Felix Auger-Aliassime');
    expect(nomLisible('Lorenzo', "D'AMICO")).toBe("Lorenzo D'Amico");
    expect(nomLisible('Étienne', 'ÉCHEVERRY')).toBe('Étienne Écheverry');
  });

  it('prénom ou nom absent', () => {
    expect(nomLisible(null, 'WANG')).toBe('Wang');
    expect(nomLisible('Learner', null)).toBe('Learner');
    expect(nomLisible(null, null)).toBe('');
  });
});
