// @vitest-environment node
/**
 * Contrôle « fantasy-equipe » — comparaison pure de l'équipe stockée et de
 * l'équipe affichée (db/verif.ts).
 */
import { describe, expect, it, vi } from 'vitest';
import type { EquipeEvaluee, EquipeStockee } from '../fantasy';

vi.mock('@/db/anon', () => ({ supabaseAnon: () => ({}) }));
vi.mock('@/db/server', () => ({ supabaseAdmin: () => ({}) }));
const { comparerEquipes, NOMS_CONTROLES } = await import('../verif');

const stockee: EquipeStockee = {
  ePredit: 30,
  equipe: [
    { palier: 1, playerId: 'a', nom: 'A', rang: 3, ePoints: 20, reel: 4 },
    { palier: 2, playerId: 'b', nom: 'B', rang: 15, ePoints: 10, reel: 0 },
  ],
};

const affichee = (ids: [string | null, string | null], e: [number, number] = [20, 10]): EquipeEvaluee => ({
  membres: ids.map((playerId, i) => ({
    palier: { numero: i + 1, rangMin: 0, rangMax: null, libelle: `P${i + 1}` },
    playerId,
    eTotal: e[i],
    eligibles: 5,
    // Les points réels avancent : ils ne doivent pas compter.
    reel: 99,
    detailReel: [],
  })),
  eTotal: e[0] + e[1],
  reelTotal: 198,
  termine: false,
});

describe('comparerEquipes', () => {
  it('même composition, mêmes espérances : identique (points réels ignorés)', () => {
    expect(comparerEquipes(stockee, affichee(['a', 'b']))).toMatchObject({
      identique: true,
      ecarts: [],
    });
  });

  it('joueur différent à un palier : écart signalé', () => {
    const c = comparerEquipes(stockee, affichee(['a', 'c']));
    expect(c.identique).toBe(false);
    expect(c.ecarts).toEqual([{ palier: 2, stocke: 'b', affiche: 'c' }]);
  });

  it('même joueur, espérance différente : pas identique', () => {
    expect(comparerEquipes(stockee, affichee(['a', 'b'], [21, 10])).identique).toBe(false);
  });

  it('palier manquant d’un côté : écart', () => {
    const c = comparerEquipes({ ...stockee, equipe: stockee.equipe.slice(0, 1) }, affichee(['a', 'b']));
    expect(c.ecarts).toEqual([{ palier: 2, stocke: null, affiche: 'b' }]);
  });

  it('liste fixe : exactement les deux contrôles prévus', () => {
    expect([...NOMS_CONTROLES].sort()).toEqual(['fantasy-equipe', 'sante']);
  });
});
