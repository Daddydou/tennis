import { describe, expect, it } from 'vitest';
import { ligneSaison, positionDansAnnee, semaineIso } from '../ligneSaison';

const t = (id: string, name: string, start_date: string, category: string | null = 'ATP250') => ({
  id,
  name,
  category,
  start_date,
});

const etiquettes = (p: ReturnType<typeof ligneSaison>) => Object.fromEntries(p.map((x) => [x.id, x.etiquette]));

describe('positionDansAnnee', () => {
  it('va de 0 (1er janvier) à 1 (31 décembre)', () => {
    expect(positionDansAnnee('2026-01-01')).toBe(0);
    expect(positionDansAnnee('2026-12-31')).toBe(1);
    expect(positionDansAnnee('2026-07-02')).toBeCloseTo(0.5, 2);
  });
});

describe('ligneSaison', () => {
  it("ne garde que l'année demandée, dans l'ordre des dates", () => {
    const p = ligneSaison([t('b', 'Paris', '2026-10-26'), t('a', 'Melbourne', '2026-01-18'), t('c', 'Vieux', '2025-05-01')], 2026, null);
    expect(p.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it("retire l'année du nom (c'est celle de la ligne)", () => {
    expect(ligneSaison([t('a', 'Roland Garros 2026', '2026-05-24', 'gs')], 2026, null)[0].nom).toBe('Roland Garros');
  });

  it('fusionne un tournoi mixte (même nom, même date)', () => {
    const p = ligneSaison([t('atp', 'Roland-Garros', '2026-05-24', 'GS'), t('wta', 'Roland-Garros', '2026-05-24', 'GS')], 2026, null);
    expect(p).toHaveLength(1);
  });

  it('garde le point de la vedette même si son jumeau ATP/WTA est passé avant', () => {
    const p = ligneSaison([t('atp', 'Roland-Garros', '2026-05-24', 'GS'), t('wta', 'Roland-Garros', '2026-05-24', 'GS')], 2026, 'wta');
    expect(p.some((x) => x.id === 'wta' && x.vedette)).toBe(true);
  });

  it('étiquette seulement les Grands Chelems et les tournois en cours (Masters et Finals passés : non)', () => {
    const p = ligneSaison(
      [t('gc', 'Wimbledon', '2026-06-29', 'GS'), t('iw', 'Indian Wells', '2026-03-04', 'M1000'), t('wf', 'WTA Finals', '2026-11-08', 'wtafinals'), t('v', 'Bâle', '2026-10-19', 'ATP500')],
      2026,
      null,
      new Set(['v']),
    );
    expect(etiquettes(p)).toEqual({ iw: false, gc: true, v: true, wf: false });
    expect(p.find((x) => x.id === 'v')?.enCours).toBe(true);
    expect(p.find((x) => x.id === 'gc')?.enCours).toBe(false);
  });

  it('la vedette est en cours et étiquetée', () => {
    const [p] = ligneSaison([t('tu', 'ATP Finals', '2026-11-15', 'finals')], 2026, 'tu');
    expect(p).toMatchObject({ vedette: true, enCours: true, etiquette: true });
  });

  it('les quatre Grands Chelems tiennent ensemble (Roland Garros et Wimbledon compris)', () => {
    const p = ligneSaison(
      [t('ao', 'Australian Open', '2026-01-18', 'GS'), t('rg', 'Roland Garros', '2026-05-24', 'GS'), t('wi', 'Wimbledon', '2026-06-29', 'GS'), t('us', 'US Open', '2026-08-30', 'GS')],
      2026,
      null,
    );
    expect(Object.values(etiquettes(p)).every(Boolean)).toBe(true);
  });

  it('un tournoi en cours passe avant un Grand Chelem trop proche', () => {
    const p = ligneSaison([t('rg', 'Roland Garros', '2026-05-24', 'GS'), t('ly', 'Lyon', '2026-05-17')], 2026, null, new Set(['ly']));
    expect(etiquettes(p)).toEqual({ ly: true, rg: false });
  });

  it('deux tournois en cours trop proches : le second descend d’une rangée, aucun ne disparaît', () => {
    const p = ligneSaison([t('wf', 'WTA Finals', '2026-11-08', 'wtafinals'), t('tu', 'ATP Finals', '2026-11-15', 'finals')], 2026, 'tu', new Set(['wf']));
    expect(etiquettes(p)).toEqual({ wf: true, tu: true });
    expect(Object.fromEntries(p.map((x) => [x.id, x.rangee]))).toEqual({ wf: 1, tu: 0 });
  });

  it('un tournoi mixte est en cours si l’un des deux circuits l’est', () => {
    const p = ligneSaison([t('atp', 'Madrid', '2026-04-22', 'M1000'), t('wta', 'Madrid', '2026-04-22', 'M1000')], 2026, null, new Set(['wta']));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ enCours: true, etiquette: true });
  });
});

describe('semaineIso', () => {
  it('suit la norme ISO 8601', () => {
    expect(semaineIso('2026-11-15')).toBe(46);
    expect(semaineIso('2026-01-01')).toBe(1);
    expect(semaineIso('2027-01-01')).toBe(53);
  });
});
