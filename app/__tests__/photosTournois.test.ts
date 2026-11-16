import { describe, expect, it } from 'vitest';
import { cleTournoi, photoDuTournoi, PHOTOS } from '../photosTournois';

describe('cleTournoi', () => {
  it('retire année, accents et majuscules', () => {
    expect(cleTournoi('Roland Garros 2026')).toBe('roland garros');
    expect(cleTournoi('Pékin 2026')).toBe('pekin');
  });
});

describe('photoDuTournoi', () => {
  it('trouve la photo du lieu, alias compris', () => {
    expect(photoDuTournoi('ATP Finals 2026', 2026)?.lieu).toMatch(/Turin/);
    expect(photoDuTournoi('Pékin 2026', 2026)?.cle).toBe('beijing');
    expect(photoDuTournoi('Vienna 2026', 2026)?.cle).toBe('vienna');
  });

  it("suit les changements de lieu d'une année à l'autre", () => {
    expect(photoDuTournoi('Paris 2024', 2024)).toBeNull(); // encore Bercy
    expect(photoDuTournoi('Paris 2026', 2026)?.lieu).toMatch(/Plenitude/);
    expect(photoDuTournoi('WTA Finals 2026', 2026)?.cle).toBe('indian wells');
    expect(photoDuTournoi('WTA Finals 2025', 2025)).toBeNull();
  });

  it('rend null sans photo (le court dessiné prend le relais)', () => {
    expect(photoDuTournoi('Coupe Davis 2026', 2026)).toBeNull();
    expect(photoDuTournoi('Lyon 2026', 2026)).toBeNull();
  });

  it('chaque photo a un auteur, une licence libre et sa page Commons', () => {
    for (const p of PHOTOS) {
      expect(p.auteur.length, p.cle).toBeGreaterThan(0);
      expect(p.licence, p.cle).toMatch(/^(CC0|CC BY)/);
      expect(p.page, p.cle).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(p.grand, p.cle).toMatch(/^https:\/\/(thumb|upload)\.wikimedia\.org\//);
      expect(p.petit, p.cle).toMatch(/\/500px-/);
    }
  });
});
