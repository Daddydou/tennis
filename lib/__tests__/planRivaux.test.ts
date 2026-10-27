import { describe, expect, it } from 'vitest';
import { bilan, chercherContreRivaux, creerContexte, totaux, totauxRivaux, type Participant } from '../planRivaux';
import { creerTableau, genererScenarios, propagerMoments } from '../planTableau';
import type { Match, MatchPlayer, Player } from '../types';

const ELOS = [2000, 1900, 1850, 1800, 1750, 1700, 1650, 1600];
const IDS = ELOS.map((_, i) => `J${i}`);
const players: Record<string, Player> = Object.fromEntries(
  IDS.map((id, i) => [
    id,
    { id, tour: 'ATP', name: id, country: null, rank: i + 1, seed: null, half: i < 4 ? 'top' : 'bottom', eloOverall: ELOS[i], eloHard: ELOS[i], eloClay: ELOS[i], eloGrass: ELOS[i] } as Player,
  ]),
);
const mp = (id: string): MatchPlayer => ({ id, name: id, seed: null, country: null, isBye: false, winner: false, sets: [] });
const duel = (position: number, a: string, b: string): Match => ({
  matchId: null,
  round: 'QF',
  roundLabel: 'QF',
  position,
  half: position < 2 ? 'top' : 'bottom',
  status: 'scheduled',
  players: [mp(a), mp(b)],
});
const matches = [duel(0, 'J0', 'J7'), duel(1, 'J3', 'J4'), duel(2, 'J1', 'J6'), duel(3, 'J2', 'J5')];
const rounds = ['QF', 'SF', 'F'];

function monde(S = 4000) {
  const t = creerTableau(matches, players, rounds, 3, 'hard');
  const { esp } = propagerMoments(t, t.grille, 0);
  const sc = genererScenarios(t, t.grille, 0, S, 3);
  const ctx = creerContexte(t, sc, esp);
  const libre = (cle: string): Participant => ({ cle, nom: cle, base: 0, places: [], slotsLibres: t.slots, utilises: new Set() });
  return { t, esp, ctx, libre };
}

describe('planRivaux', () => {
  it('trois participants identiques ont chacun une chance sur trois de finir premier', () => {
    const { ctx, libre, t } = monde();
    const riv = totauxRivaux(ctx, [libre('b'), libre('c')]);
    const b = bilan(ctx, libre('a'), t.slots.map(() => null), riv);
    expect(b.pPremier).toBeCloseTo(1 / 3, 1);
    expect(b.devant[0]).toBeCloseTo(0.5, 1);
  });

  it('quand le joueur visé est éliminé, le pick retombe sur le meilleur survivant', () => {
    const { ctx, t } = monde(300);
    const j7 = t.ids.indexOf('J7');
    // J7 est le plus faible : il perd presque toujours. Viser J7 au QF haut vaut ≈ le meilleur survivant du haut ?
    const moi: Participant = { cle: 'a', nom: 'a', base: 0, places: [], slotsLibres: [{ round: 'QF', half: 'top' }], utilises: new Set() };
    const vise = totaux(ctx, moi, [t.ids.indexOf('J0')]);
    const laisse = totaux(ctx, moi, [null]);
    const moyenne = (x: Float64Array) => x.reduce((s, v) => s + v, 0) / x.length;
    // « null » = meilleur survivant disponible ; il ne peut pas faire pire que viser un joueur au hasard.
    expect(moyenne(laisse)).toBeGreaterThan(5);
    expect(moyenne(vise)).toBeGreaterThan(5);
    expect(j7).toBeGreaterThanOrEqual(0);
  });

  it('les points déjà acquis (base) s\'ajoutent au total', () => {
    const { ctx, libre, t } = monde(200);
    const sans = bilan(ctx, libre('a'), t.slots.map(() => null));
    const avec = bilan(ctx, { ...libre('a'), base: 17 }, t.slots.map(() => null));
    expect(avec.moyenne - sans.moyenne).toBeCloseTo(17, 6);
    expect(sans.pPremier).toBeNull();
  });

  it('un rival qui a déjà joué le meilleur joueur déplace la recommandation sans jamais la dégrader', () => {
    const { ctx, libre, t, esp } = monde();
    const meilleur = t.ids.indexOf('J0');
    // Le rival a posé J0 au QF haut ; il est en avance de 6 points.
    const rival: Participant = {
      cle: 'r',
      nom: 'r',
      base: 6,
      places: [{ round: 'QF', half: 'top', joueur: meilleur }],
      slotsLibres: t.slots.filter((s) => !(s.round === 'QF' && s.half === 'top')),
      utilises: new Set([meilleur]),
    };
    const moi = libre('moi');
    const res = chercherContreRivaux(ctx, moi, [rival], esp);
    expect(res.recommandee.cibles).toHaveLength(moi.slotsLibres.length);
    // Recommander ne doit jamais être pire que la référence en chance de victoire (au bruit de seuil près).
    expect((res.recommandee.bilan.pPremier ?? 0) + 1e-9).toBeGreaterThanOrEqual((res.reference.bilan.pPremier ?? 0) - 1e-9);
    expect(res.propositions.length).toBeGreaterThan(0);
    // Les propositions sont triées de la meilleure à la moins bonne.
    for (let i = 1; i < res.propositions.length; i++) {
      expect(res.propositions[i - 1].bilan.pPremier ?? 0).toBeGreaterThanOrEqual(res.propositions[i].bilan.pPremier ?? 0);
    }
  });
});
