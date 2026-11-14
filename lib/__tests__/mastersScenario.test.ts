// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MAX_PRONOSTIC, type PronosticMasters } from '../masters';
import { reelDepuisVue } from '../mastersPronostic';
import {
  corrigerPronostic,
  grilleComparaison,
  placerDansClassement,
  pointsSousScenario,
  reelDepuisScenario,
  scenarioInitial,
} from '../mastersScenario';
import { vueMasters, type LigneMatchMasters } from '../mastersVue';

/**
 * Poule A entièrement jouée, classement sans égalité : a1 (3 victoires), a2 (2), a3 (1), a4 (0).
 * Poule B : journée 1 programmée, rien de joué.
 */
const m = (round: string, position: number, half: 'top' | 'bottom', p1: string, p2: string, gagnant: string | null): LigneMatchMasters => ({
  round,
  position,
  half,
  player1Id: p1,
  player2Id: p2,
  winnerId: gagnant,
  status: gagnant ? 'completed' : 'scheduled',
  sets: gagnant ? [{ g1: gagnant === p1 ? 6 : 3, g2: gagnant === p1 ? 3 : 6 }, { g1: gagnant === p1 ? 6 : 4, g2: gagnant === p1 ? 4 : 6 }] : [],
});
const lignes = (): LigneMatchMasters[] => [
  m('J1', 0, 'top', 'a1', 'a4', 'a1'),
  m('J1', 1, 'top', 'a2', 'a3', 'a2'),
  m('J2', 0, 'top', 'a1', 'a2', 'a1'),
  m('J2', 1, 'top', 'a3', 'a4', 'a3'),
  m('J3', 0, 'top', 'a1', 'a3', 'a1'),
  m('J3', 1, 'top', 'a2', 'a4', 'a2'),
  m('J1', 2, 'bottom', 'b1', 'b4', null),
  m('J1', 3, 'bottom', 'b2', 'b3', null),
];
const vue = () => vueMasters(lignes());

const complet = (over: Partial<PronosticMasters> = {}): PronosticMasters => ({
  classementA: ['a1', 'a2', 'a3', 'a4'],
  classementB: ['b1', 'b2', 'b3', 'b4'],
  vainqueursDemis: ['a1', 'b1'],
  champion: 'a1',
  ...over,
});

describe('corrigerPronostic', () => {
  it('un pronostic cohérent ne change pas', () => {
    expect(corrigerPronostic(complet())).toEqual(complet());
  });

  it('quand le 1er de A change, la demie 1 et la championne suivent', () => {
    const p = corrigerPronostic(complet({ classementA: ['a3', 'a2', 'a1', 'a4'] }));
    expect(p.vainqueursDemis).toEqual(['a3', 'b1']);
    expect(p.champion).toBe('a3');
  });
});

describe('placerDansClassement', () => {
  it('échange avec l\'ancienne place du joueur : le classement reste une permutation', () => {
    expect(placerDansClassement(['a1', 'a2', 'a3', 'a4'], 0, 'a3')).toEqual(['a3', 'a2', 'a1', 'a4']);
  });

  it('un joueur déjà à cette place ou inconnu ne change rien', () => {
    expect(placerDansClassement(['a1', 'a2'], 0, 'a1')).toEqual(['a1', 'a2']);
    expect(placerDansClassement(['a1', 'a2'], 0, 'zz')).toEqual(['a1', 'a2']);
  });
});

describe('scenarioInitial', () => {
  const { scenario, fige } = scenarioInitial(vue());

  it('reprend la poule terminée telle qu\'elle s\'est jouée, et la fige', () => {
    expect(scenario.classementA).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(fige.A).toBe(true);
  });

  it('laisse libre la poule pas terminée (4 joueuses, une permutation)', () => {
    expect(fige.B).toBe(false);
    expect([...scenario.classementB].sort()).toEqual(['b1', 'b2', 'b3', 'b4']);
  });

  it('rien de figé en phase finale tant que rien n\'est joué, et le scénario est cohérent', () => {
    expect(fige.demis).toEqual([false, false]);
    expect(fige.champion).toBe(false);
    expect(scenario.vainqueursDemis).toHaveLength(2);
    expect(scenario.vainqueursDemis).toContain(scenario.champion);
  });
});

describe('reelDepuisScenario', () => {
  it('un scénario est une issue complète', () => {
    expect(reelDepuisScenario(complet())).toEqual({
      classementA: ['a1', 'a2', 'a3', 'a4'],
      classementB: ['b1', 'b2', 'b3', 'b4'],
      finalistes: ['a1', 'b1'],
      champion: 'a1',
    });
  });
});

describe('pointsSousScenario', () => {
  const reel = reelDepuisVue(vue());
  const participants = [
    { cle: 'moi', nom: 'Moi', pronostic: complet(), picks: 10 },
    { cle: 'laki', nom: 'Laki', pronostic: null, picks: 30 },
  ];

  it('le pronostic qui colle au scénario fait le maximum (64) ; sans pronostic, seuls les picks comptent', () => {
    const lignes = pointsSousScenario(participants, reel, complet());
    const moi = lignes.find((l) => l.cle === 'moi')!;
    const laki = lignes.find((l) => l.cle === 'laki')!;
    expect(moi.simule?.total).toBe(MAX_PRONOSTIC);
    expect(moi.totalSimule).toBe(MAX_PRONOSTIC + 10);
    expect(laki.simule).toBeNull();
    expect(laki.totalSimule).toBe(30);
  });

  it('aujourd\'hui : seule la poule A (jouée) rapporte, soit 16 points', () => {
    const moi = pointsSousScenario(participants, reel, complet()).find((l) => l.cle === 'moi')!;
    expect(moi.actuel?.total).toBe(16);
    expect(moi.totalActuel).toBe(26);
  });

  it('un autre scénario recalcule : poule B inversée en tête, demie et championne ratées', () => {
    // B : b2 > b1 > b3 > b4 -> qualifiées 2 x 4 + places b3, b4 (2 x 2) = 12 ; demie 2 : b2 (le pronostic a b1), finalistes : a1 seulement = 8.
    const scenario = corrigerPronostic({ ...complet(), classementB: ['b2', 'b1', 'b3', 'b4'] });
    const moi = pointsSousScenario(participants, reel, scenario).find((l) => l.cle === 'moi')!;
    expect(moi.simule?.total).toBe(16 + 12 + 8 + 16);
  });

  it('classe les participants dans le scénario ; les ex æquo partagent le rang', () => {
    const lignes = pointsSousScenario(
      [
        { cle: 'a', nom: 'A', pronostic: null, picks: 20 },
        { cle: 'b', nom: 'B', pronostic: null, picks: 20 },
        { cle: 'c', nom: 'C', pronostic: null, picks: 5 },
      ],
      reel,
      complet(),
    );
    expect(lignes.map((l) => [l.nom, l.rangSimule])).toEqual([['A', 1], ['B', 1], ['C', 3]]);
  });
});

describe('grilleComparaison', () => {
  const parts = [
    { cle: 'moi', nom: 'Moi', pronostic: complet({ classementA: ['a2', 'a1', 'a3', 'a4'], vainqueursDemis: ['a2', 'b1'], champion: 'b1' }) },
    { cle: 'laki', nom: 'Laki', pronostic: null },
  ];
  const grille = grilleComparaison(vue(), parts);

  it('11 lignes : 8 places de poule, 2 demies, la championne', () => {
    expect(grille).toHaveLength(11);
    expect(grille.map((l) => l.cle)).toEqual(['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'D1', 'D2', 'C']);
    expect(grille.every((l) => l.cases.length === 2)).toBe(true);
  });

  it('un participant sans pronostic a des cases vides', () => {
    expect(grille.every((l) => l.cases[1] === null)).toBe(true);
  });

  it('poule A jouée : place exacte = juste, deux premiers permutés = partiel, le reste = juste ; poule B pas jouée = attente', () => {
    const verdict = (cle: string) => grille.find((l) => l.cle === cle)!.cases[0]!.verdict;
    expect(verdict('A1')).toBe('partiel'); // a2 prévu 1er, 2e en vrai, dans le top 2
    expect(verdict('A2')).toBe('partiel'); // a1 prévu 2e, 1er en vrai
    expect(verdict('A3')).toBe('juste');
    expect(verdict('B1')).toBe('attente');
    expect(grille.find((l) => l.cle === 'A1')!.cases[0]!.joueurId).toBe('a2');
  });
});
