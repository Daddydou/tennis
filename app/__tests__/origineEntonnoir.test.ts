// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { rayonCouvrant } from '../origineEntonnoir';

describe('rayonCouvrant', () => {
  it("point au coin haut-gauche d'un écran 300 x 400 : la diagonale", () => {
    expect(rayonCouvrant(0, 0, { left: 0, top: 0 }, { largeur: 300, hauteur: 400 })).toBe(500);
  });

  it('point au centre : la demi-diagonale', () => {
    expect(rayonCouvrant(150, 200, { left: 0, top: 0 }, { largeur: 300, hauteur: 400 })).toBe(250);
  });

  it("tient compte de la place de l'élément dans l'écran (point au-dessus de lui)", () => {
    // Élément qui commence à 100 px du haut ; point à 20 px au-dessus de lui, au milieu de l'écran.
    // Dans l'écran, le point est en (150, 80) : le coin le plus loin est en bas, à (0 ou 300, 400).
    expect(rayonCouvrant(150, -20, { left: 0, top: 100 }, { largeur: 300, hauteur: 400 })).toBe(Math.ceil(Math.hypot(150, 320)));
  });
});
