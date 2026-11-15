import { describe, expect, it } from 'vitest';
import { ligneSaison, positionDansAnnee, semaineIso } from '../ligneSaison';

const t = (id: string, name: string, start_date: string, category: string | null = 'ATP250') => ({
  id,
  name,
  category,
  start_date,
});

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

  it('reconnaît les catégories quelle que soit la casse', () => {
    expect(ligneSaison([t('f', 'ATP Finals', '2026-11-15', 'finals')], 2026, null)[0].etiquette).toBe(true);
  });

  it('fusionne un tournoi mixte (même nom, même date)', () => {
    const p = ligneSaison([t('atp', 'Roland-Garros', '2026-05-24', 'GS'), t('wta', 'Roland-Garros', '2026-05-24', 'GS')], 2026, null);
    expect(p).toHaveLength(1);
  });

  it('garde le point de la vedette même si son jumeau ATP/WTA est passé avant', () => {
    const p = ligneSaison([t('atp', 'Roland-Garros', '2026-05-24', 'GS'), t('wta', 'Roland-Garros', '2026-05-24', 'GS')], 2026, 'wta');
    expect(p.some((x) => x.id === 'wta' && x.vedette)).toBe(true);
  });

  it('étiquette les grands rendez-vous et la vedette, pas les petits tournois', () => {
    const p = ligneSaison([t('gc', 'Wimbledon', '2026-06-29', 'GS'), t('p', 'Metz', '2026-11-08'), t('v', 'Bâle', '2026-10-19', 'ATP500')], 2026, 'v');
    const e = Object.fromEntries(p.map((x) => [x.id, x.etiquette]));
    expect(e).toEqual({ gc: true, v: true, p: false });
  });

  it('un Grand Chelem garde son étiquette face à un Masters trop proche', () => {
    const p = ligneSaison([t('ma', 'Madrid', '2026-04-22', 'M1000'), t('rg', 'Roland Garros', '2026-05-24', 'GS')], 2026, null);
    const e = Object.fromEntries(p.map((x) => [x.id, x.etiquette]));
    expect(e).toEqual({ ma: false, rg: true });
  });

  it('efface une étiquette trop proche de la précédente ou de la vedette', () => {
    const p = ligneSaison(
      [t('ao', 'Open d’Australie', '2026-01-18', 'GS'), t('iw', 'Indian Wells', '2026-03-04', 'M1000'), t('mi', 'Miami', '2026-03-18', 'M1000'), t('pa', 'Paris', '2026-10-26', 'M1000'), t('tu', 'Turin', '2026-11-15', 'Finals')],
      2026,
      'tu',
    );
    const e = Object.fromEntries(p.map((x) => [x.id, x.etiquette]));
    expect(e).toEqual({ ao: true, iw: true, mi: false, pa: false, tu: true });
  });
});

describe('semaineIso', () => {
  it('suit la norme ISO 8601', () => {
    expect(semaineIso('2026-11-15')).toBe(46);
    expect(semaineIso('2026-01-01')).toBe(1);
    expect(semaineIso('2027-01-01')).toBe(53);
  });
});
