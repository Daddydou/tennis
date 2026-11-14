import { describe, expect, it } from 'vitest';
import {
  construireResultat,
  depuisStockage,
  estDavis,
  pointsPickDavis,
  saisieDepuisStockage,
  type SaisieMatch,
} from '../davisRencontre';

const termine = (ordre: 1 | 2 | 3, gagnant: 1 | 2, score: string): SaisieMatch => ({ ordre, statut: 'termine', gagnant, score });

/** Italie (côté 1) bat la Corée 2-0 : 6-3 6-4 puis 6-2 6-1. */
const ITALIE_2_0: SaisieMatch[] = [termine(1, 1, '6-3 6-4'), termine(2, 1, '6-2 6-1')];

/** Allemagne (côté 1) bat le Royaume-Uni 2-1 : Draper (côté 2) gagne 7-6 6-4, puis 6-4 3-6 6-3 et 7-6 7-6 pour l'Allemagne. */
const ALLEMAGNE_2_1: SaisieMatch[] = [termine(1, 2, '7-6(4) 6-4'), termine(2, 1, '6-4 3-6 6-3'), termine(3, 1, '7-6(5) 7-6(2)')];

function stockage(saisie: SaisieMatch[]) {
  const r = construireResultat(saisie);
  if (!r.ok) throw new Error(r.erreurs.join(' | '));
  return r;
}

describe('estDavis', () => {
  it('reconnaît les tours exacts QF, SF, F', () => {
    expect(estDavis(['QF', 'SF', 'F'])).toBe(true);
  });
  it('refuse tout autre tableau', () => {
    expect(estDavis(['R16', 'QF', 'SF', 'F'])).toBe(false);
    expect(estDavis(['J1', 'J2', 'J3', 'SF', 'F'])).toBe(false);
    expect(estDavis([])).toBe(false);
    expect(estDavis(null)).toBe(false);
  });
});

describe('pointsPickDavis — les exemples des règles (identiques à tn_score_davis en SQL)', () => {
  it('L\'Italie gagne 2-0 : 5 + 3×2 + 5 + 9 = 25', () => {
    const r = stockage(ITALIE_2_0);
    expect(pointsPickDavis(r.stockage, 1, true, 'completed')).toEqual({ match: 5, matchs: 6, jeux: 14, total: 25 });
  });
  it('L\'Allemagne bat le Royaume-Uni 2-1 : 5 + 3×1 + 2 + 2 = 12', () => {
    const r = stockage(ALLEMAGNE_2_1);
    expect(pointsPickDavis(r.stockage, 1, true, 'completed')).toEqual({ match: 5, matchs: 3, jeux: 4, total: 12 });
  });
  it('Le Royaume-Uni, battu, garde l\'écart de jeux du match de Draper : 3', () => {
    const r = stockage(ALLEMAGNE_2_1);
    expect(pointsPickDavis(r.stockage, 2, false, 'completed')).toEqual({ match: 0, matchs: 0, jeux: 3, total: 3 });
  });
  it('rien tant que la rencontre n\'est pas jouée', () => {
    expect(pointsPickDavis([], 1, false, 'scheduled').total).toBe(0);
    expect(pointsPickDavis(stockage(ITALIE_2_0).stockage, 1, false, 'live').total).toBe(0);
  });
  it('plancher à 0 match par match : 7-6 0-6 7-6 vaut 0, pas -4', () => {
    const r = stockage([termine(1, 1, '7-6 0-6 7-6'), termine(2, 1, '6-0 6-0')]);
    // seul le second match rapporte des jeux (+12) ; le premier vaut max(0, 14-18)
    expect(pointsPickDavis(r.stockage, 1, true, 'completed').jeux).toBe(12);
  });
  it('un forfait ne rapporte aucun jeu mais compte pour l\'écart de matchs', () => {
    const r = stockage([{ ordre: 1, statut: 'forfait', gagnant: 1, score: '' }, termine(2, 1, '6-3 6-3')]);
    expect(pointsPickDavis(r.stockage, 1, true, 'completed')).toEqual({ match: 5, matchs: 6, jeux: 6, total: 17 });
  });
  it('un abandon ne compte que les sets entièrement joués', () => {
    // 6-3 puis 2-1 abandon : le set interrompu est écarté -> +3
    const r = stockage([{ ordre: 1, statut: 'abandon', gagnant: 1, score: '6-3 2-1' }, termine(2, 1, '6-0 6-0')]);
    expect(pointsPickDavis(r.stockage, 1, true, 'completed').jeux).toBe(3 + 12);
  });
  it('un score de rencontre sans détail (« 2-1 » repris d\'ailleurs) ne donne que le point de victoire', () => {
    const sansDetail = [{ g1: 2, g2: 1, tb1: null, tb2: null }];
    expect(pointsPickDavis(sansDetail, 1, true, 'completed')).toEqual({ match: 5, matchs: 0, jeux: 0, total: 5 });
    expect(pointsPickDavis(sansDetail, 2, false, 'completed').total).toBe(0);
  });
});

describe('construireResultat', () => {
  it('2-0 : rencontre décidée, double non joué', () => {
    const r = stockage(ITALIE_2_0);
    expect(r).toMatchObject({ gagnant: 1, score: '2-0', statut: 'completed' });
    expect(r.stockage.map((m) => [m.ordre, m.g1, m.g2])).toEqual([[1, 1, 0], [2, 1, 0]]);
  });
  it('2-1 : double joué à 1-1', () => {
    expect(stockage(ALLEMAGNE_2_1)).toMatchObject({ gagnant: 1, score: '2-1', statut: 'completed' });
  });
  it('les sets sont rangés du côté 1 contre le côté 2', () => {
    const r = stockage(ALLEMAGNE_2_1);
    // Draper (côté 2) gagne 7-6 6-4 : du côté 1 c'est 6-7 4-6
    expect(r.stockage[0].jeux).toEqual([{ g1: 6, g2: 7 }, { g1: 4, g2: 6 }]);
    expect(r.stockage[1].jeux).toEqual([{ g1: 6, g2: 4 }, { g1: 3, g2: 6 }, { g1: 6, g2: 3 }]);
  });
  it('un seul simple joué : en cours', () => {
    expect(stockage([termine(1, 2, '6-4 6-4')])).toMatchObject({ gagnant: null, statut: 'live' });
  });
  it('aucun match : à venir', () => {
    expect(stockage([])).toMatchObject({ gagnant: null, statut: 'scheduled', stockage: [] });
  });
  it('1-1 après les simples : pas encore décidée, le double décidera', () => {
    expect(stockage([termine(1, 1, '6-4 6-4'), termine(2, 2, '6-4 6-4')])).toMatchObject({ gagnant: null, statut: 'live' });
  });
  it('refuse un double quand une nation a déjà gagné 2-0', () => {
    const r = construireResultat([...ITALIE_2_0, termine(3, 1, '6-4 6-4')]);
    expect(r.ok).toBe(false);
  });
  it('refuse un double sans les deux simples', () => {
    expect(construireResultat([termine(1, 1, '6-4 6-4'), termine(3, 2, '6-4 6-4')]).ok).toBe(false);
  });
  it('refuse un score illisible ou incohérent', () => {
    expect(construireResultat([termine(1, 1, 'abc')]).ok).toBe(false);
    expect(construireResultat([termine(1, 1, '6-4')]).ok).toBe(false); // un seul set pour un match terminé
    expect(construireResultat([{ ordre: 1, statut: 'termine', gagnant: null, score: '6-4 6-4' }]).ok).toBe(false);
  });
});

describe('stockage', () => {
  it('relit ce qu\'il a écrit (aller-retour vers l\'écran de saisie)', () => {
    const r = stockage(ALLEMAGNE_2_1);
    const relu = saisieDepuisStockage(r.stockage);
    expect(relu.map((m) => [m.ordre, m.gagnant, m.score])).toEqual([
      [1, 2, '7-6 6-4'],
      [2, 1, '6-4 3-6 6-3'],
      [3, 1, '7-6 7-6'],
    ]);
    expect(stockage(relu).stockage).toEqual(r.stockage);
  });
  it('ignore ce qui n\'est pas un match détaillé', () => {
    expect(depuisStockage(null)).toEqual([]);
    expect(depuisStockage([{ g1: 2, g2: 1 }, 'x', null])).toEqual([]);
  });
});
