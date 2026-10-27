import { describe, expect, it } from 'vitest';
import { memeNom } from '../BadgeSourceElo';

describe('memeNom (nom Tennis Abstract affiché seulement s’il diffère)', () => {
  it('ignore accents, casse et ponctuation', () => {
    expect(memeNom('Félix Auger-Aliassime', 'felix auger aliassime')).toBe(true);
  });

  it('accepte un prénom réduit à son initiale', () => {
    expect(memeNom('C. Ruud', 'Casper Ruud')).toBe(true);
    expect(memeNom('Casper Ruud', 'C Ruud')).toBe(true);
  });

  it('signale un vrai écart', () => {
    expect(memeNom('C. Ruud', 'Christian Ruud')).toBe(true); // même initiale : indécidable, on se tait
    expect(memeNom('A. Zverev', 'Mischa Zverev')).toBe(false);
    expect(memeNom('Casper Ruud', 'Casper Rudd')).toBe(false);
  });

  it('ne confond pas deux initiales seules', () => {
    expect(memeNom('Ruud', 'C. Ruud')).toBe(false);
  });
});
