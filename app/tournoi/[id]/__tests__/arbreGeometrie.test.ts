import { describe, expect, it } from 'vitest';
import { construireArbre, departParDefaut, departsPossibles, initiales, type DuelArbre } from '../arbreGeometrie';

const ROUNDS = ['R16', 'QF', 'SF', 'F'];

/** Tableau de 8 joueurs (QF -> F), le joueur de gauche gagne toujours. */
function tableau8(): DuelArbre[] {
  const qf = [0, 1, 2, 3].map((p) => ({ round: 'QF', position: p, a: `j${2 * p}`, b: `j${2 * p + 1}`, vainqueur: `j${2 * p}` }));
  const sf = [0, 1].map((p) => ({ round: 'SF', position: p, a: `j${4 * p}`, b: `j${4 * p + 2}`, vainqueur: `j${4 * p}` }));
  const f = [{ round: 'F', position: 0, a: 'j0', b: 'j4', vainqueur: null }];
  return [...qf, ...sf, ...f];
}

describe('départs', () => {
  it('propose les tours de 8 matchs ou moins, et les quarts par défaut', () => {
    const r16 = Array.from({ length: 8 }, (_, p) => ({ round: 'R16', position: p, a: null, b: null, vainqueur: null }));
    const duels = [...r16, ...tableau8()];
    expect(departsPossibles(ROUNDS, duels)).toEqual(['R16', 'QF', 'SF', 'F']);
    expect(departParDefaut(ROUNDS, duels)).toBe('QF');
  });
});

describe('construireArbre', () => {
  const arbre = construireArbre(ROUNDS, tableau8(), 'QF')!;

  it('dessine en miroir : 7 colonnes pour QF -> F', () => {
    expect(arbre.tours).toEqual(['QF', 'SF', 'F']);
    expect(arbre.largeur).toBe(7 * 8);
    // 8 entrants en QF + 4 en SF + 2 finalistes + le vainqueur.
    expect(arbre.noeuds).toHaveLength(15);
  });

  it('met la moitié haute à gauche, la moitié basse à droite', () => {
    const x = (cle: string) => arbre.noeuds.find((n) => n.cle === cle)!.x;
    const milieu = arbre.largeur / 2;
    expect(x('QF|0|a')).toBeLessThan(milieu);
    expect(x('QF|3|b')).toBeGreaterThan(milieu);
    expect(x('vainqueur')).toBe(milieu);
  });

  it('place un vainqueur à mi-hauteur de ses deux adversaires', () => {
    const y = (cle: string) => arbre.noeuds.find((n) => n.cle === cle)!.y;
    expect(y('SF|0|a')).toBeCloseTo((y('QF|0|a') + y('QF|0|b')) / 2);
    expect(y('F|0|a')).toBeCloseTo(arbre.hauteur / 2);
  });

  it('dit qui a gagné, perdu ou reste à jouer', () => {
    const etat = (cle: string) => arbre.noeuds.find((n) => n.cle === cle)!.etat;
    expect(etat('QF|0|a')).toBe('gagnant');
    expect(etat('QF|0|b')).toBe('perdant');
    expect(etat('F|0|a')).toBe('attente');
    expect(etat('vainqueur')).toBe('attente');
  });

  it("refuse un tableau incomplet plutôt que de dessiner un arbre faux", () => {
    expect(construireArbre(ROUNDS, tableau8().filter((d) => !(d.round === 'SF' && d.position === 1)), 'QF')).toBeNull();
    expect(construireArbre(ROUNDS, tableau8(), 'R16')).toBeNull();
  });

  it('dessine une finale seule', () => {
    const a = construireArbre(ROUNDS, tableau8(), 'F')!;
    expect(a.noeuds.map((n) => n.cle)).toEqual(['F|0|a', 'F|0|b', 'vainqueur']);
  });
});

describe('initiales', () => {
  it.each([
    ['Jannik Sinner', 'JS'],
    ['J. Sinner', 'JS'],
    ['Felix Auger-Aliassime', 'FA'],
    ['Sinner', 'SI'],
  ])('%s -> %s', (nom, attendu) => expect(initiales(nom)).toBe(attendu));
});
