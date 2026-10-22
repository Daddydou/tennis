import { describe, expect, it } from 'vitest';
import { eloEffectif, pVictoire } from '../elo';
import {
  colonnesApp,
  lireScoreTexte,
  majMatch,
  niveauApi,
  nouvelleNote,
  PARAMS_PRODUCTION,
  probabilite,
  RECALIBRAGE_PRODUCTION,
  recalibrer,
  surfaceApi,
  versBo5,
  type MatchElo,
  type NoteElo,
} from '../eloMaison';

const note = (general: number, surface: [number, number, number, number], n = 80): NoteElo => ({
  general,
  surface,
  n,
  nSurface: [n / 2, n / 4, n / 8, 0],
  dernierJour: 20000,
});

describe('colonnesApp', () => {
  it("reproduit, avec le mélange 0,6/0,4 et l'échelle 400 de l'app, la probabilité maison recalibrée", () => {
    const a = note(2150, [2200, 2050, 2120, 1500]);
    const b = note(1980, [1950, 2010, 1900, 1500]);
    const ca = colonnesApp(a);
    const cb = colonnesApp(b);
    const surf = [
      ['hard', 'elo_hard'],
      ['clay', 'elo_clay'],
      ['grass', 'elo_grass'],
    ] as const;
    for (const [s, col] of surf) {
      const app = pVictoire(eloEffectif(ca.elo_overall, ca[col], 0.6), eloEffectif(cb.elo_overall, cb[col], 0.6));
      const maison = recalibrer(probabilite(a, b, s, 3, PARAMS_PRODUCTION), RECALIBRAGE_PRODUCTION);
      expect(app).toBeCloseTo(maison, 3);
    }
  });

  it('laisse un joueur neuf à 1500', () => {
    expect(colonnesApp(nouvelleNote())).toEqual({ elo_overall: 1500, elo_hard: 1500, elo_clay: 1500, elo_grass: 1500 });
  });
});

describe('moteur', () => {
  it('le favori gagne en bo5 plus souvent qu’en bo3', () => {
    expect(versBo5(0.65)).toBeGreaterThan(0.65);
    expect(versBo5(0.5)).toBeCloseTo(0.5, 6);
  });

  it('une victoire fait monter le gagnant et descendre le perdant, à somme nulle sur le général', () => {
    const g = nouvelleNote(1600, 100);
    const p = nouvelleNote(1700, 100);
    const m: MatchElo = {
      jour: 101, niveau: 'A', surface: 'clay', bestOf: 3, gagnant: 'g', perdant: 'p',
      jeuxG: 12, jeuxP: 8, abandon: false,
    };
    majMatch(g, p, m, PARAMS_PRODUCTION);
    expect(g.general).toBeGreaterThan(1600);
    expect(p.general).toBeLessThan(1700);
    expect(g.n).toBe(1);
    expect(g.nSurface[1]).toBe(1);
  });
});

describe('lecture des résultats API', () => {
  it('lit les jeux, les tie-breaks, les abandons et les forfaits', () => {
    expect(lireScoreTexte('7-6(5) 3-6 6-2')).toEqual({ jeuxG: 16, jeuxP: 14, abandon: false, forfait: false });
    expect(lireScoreTexte('6-1 3-0 ret.')).toMatchObject({ jeuxG: 9, jeuxP: 1, abandon: true, forfait: false });
    expect(lireScoreTexte('6-4 3-6 10-8')).toMatchObject({ jeuxG: 10, jeuxP: 10 });
    expect(lireScoreTexte('W/O').forfait).toBe(true);
    expect(lireScoreTexte('').forfait).toBe(true);
  });

  it('classe les niveaux comme l’archive', () => {
    expect(niveauApi(4, 7, 'Australian Open')).toBe('G');
    expect(niveauApi(3, 5, 'Shanghai')).toBe('M');
    expect(niveauApi(2, 5, 'Basel')).toBe('A');
    expect(niveauApi(2, 5, 'Davis Cup')).toBe('D');
    expect(niveauApi(2, 2, 'Basel')).toBe('Q');
    expect(niveauApi(1, 5, 'Challenger Brest')).toBe('C');
    expect(niveauApi(1, 5, 'W75 Poitiers')).toBe('C');
    expect(niveauApi(1, 5, 'W35 Reims')).toBe('S');
    expect(niveauApi(0, 5, 'M15 Monastir')).toBe('S');
  });

  it('traduit les surfaces', () => {
    expect(surfaceApi(2)).toBe('clay');
    expect(surfaceApi(5)).toBe('grass');
    expect(surfaceApi(3)).toBe('hard');
    expect(surfaceApi(null)).toBe('hard');
  });
});
