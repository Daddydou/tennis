import { describe, expect, it } from 'vitest';
import { modesIdentiquesAEquilibre } from '../planEcran';

type P = { round: string; half: 'top' | 'bottom' | null; playerId: string };
const plan = (...picks: P[]) => ({ picks });
const sf: P = { round: 'SF', half: 'top', playerId: 'shelton' };
const f: P = { round: 'F', half: null, playerId: 'alcaraz' };
const sfAlcaraz: P = { round: 'SF', half: 'top', playerId: 'alcaraz' };

describe('modesIdentiquesAEquilibre', () => {
  it("cas Paris : Audacieux = Équilibré (mêmes joueurs sur les mêmes slots), Prudent diffère", () => {
    const r = modesIdentiquesAEquilibre({
      prudent: plan(sfAlcaraz, { ...f, playerId: 'sinner' }),
      equilibre: plan(sf, f),
      audacieux: plan(sf, f),
    });
    expect([...r]).toEqual(['audacieux']);
  });

  it("l'ordre des picks n'a pas d'importance", () => {
    const r = modesIdentiquesAEquilibre({
      prudent: plan(f, sf),
      equilibre: plan(sf, f),
      audacieux: plan(f, sf),
    });
    expect(r.has('prudent')).toBe(true);
    expect(r.has('audacieux')).toBe(true);
  });

  it('un seul joueur ou un seul slot différent suffit à les distinguer', () => {
    const r = modesIdentiquesAEquilibre({
      prudent: plan(sf, { ...f, playerId: 'autre' }),
      equilibre: plan(sf, f),
      audacieux: plan(sf),
    });
    expect(r.size).toBe(0);
  });

  it("la moitié de tableau compte : même joueur sur un autre slot = différent", () => {
    const r = modesIdentiquesAEquilibre({
      prudent: plan({ ...sf, half: 'bottom' }, f),
      equilibre: plan(sf, f),
      audacieux: plan(sf, f),
    });
    expect([...r]).toEqual(['audacieux']);
  });

  it("aucun pick à poser : rien à comparer, aucune note", () => {
    const r = modesIdentiquesAEquilibre({ prudent: plan(), equilibre: plan(), audacieux: plan() });
    expect(r.size).toBe(0);
  });
});
