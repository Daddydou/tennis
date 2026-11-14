// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { analyserMatchsMasters, partitionnerTours } from '../mastersAnalyse';
import { vueMasters, type LigneMatchMasters } from '../mastersVue';

function ligne(round: string, position: number, half: 'top' | 'bottom' | null, p1: string | null, p2: string | null, winner: string | null = null): LigneMatchMasters {
  return { round, position, half, player1Id: p1, player2Id: p2, winnerId: winner, status: winner ? 'completed' : 'scheduled', sets: [] };
}

const lignes: LigneMatchMasters[] = [
  ligne('J1', 0, 'top', 'a1', 'a4', 'a1'),
  ligne('J1', 1, 'top', 'a2', 'a3'),
  ligne('J1', 2, 'bottom', 'b1', 'b4'),
  ligne('J1', 3, 'bottom', 'b2', 'b3'),
  ligne('J2', 0, 'top', null, null),
  ligne('SF', 0, 'top', null, null),
  ligne('SF', 1, 'bottom', null, null),
  ligne('F', 0, 'top', null, null),
];

describe('analyserMatchsMasters', () => {
  const vue = vueMasters(lignes);
  const elo = { a1: 2200, a4: 2000, a2: 2100, a3: 2100, b1: 2300, b4: 1900, b2: 2000, b3: 2000 };
  const picks = [
    { participant: 'Moi', round: 'J1', playerId: 'a1' },
    { participant: 'Laki', round: 'J1', playerId: 'a4' },
    { participant: 'Thomas', round: 'J2', playerId: 'a1' },
  ];

  it('ne garde que les matchs dont les deux joueuses sont connues', () => {
    const r = analyserMatchsMasters({ vue, elo, picks });
    expect(r).toHaveLength(4);
    expect(r.every((m) => m.round === 'J1')).toBe(true);
  });

  it('donne Elo, chance de gagner et picks de chaque participant', () => {
    const [m] = analyserMatchsMasters({ vue, elo, picks });
    expect(m).toMatchObject({ poule: 'A', etat: 'termine', vainqueurId: 'a1' });
    const [a1, a4] = m.joueuses;
    expect(a1).toMatchObject({ id: 'a1', elo: 2200 });
    expect(a1.proba).toBeGreaterThan(0.5);
    expect(a1.proba! + a4.proba!).toBeCloseTo(1);
    expect(a1.picks).toEqual([
      { participant: 'Moi', round: 'J1' },
      { participant: 'Thomas', round: 'J2' },
    ]);
    expect(a4.picks).toEqual([{ participant: 'Laki', round: 'J1' }]);
  });

  it('Elo manquant : pas de probabilité, pas de plantage', () => {
    const r = analyserMatchsMasters({ vue, elo: { a1: 2200 }, picks: [] });
    expect(r[0].joueuses[0].proba).toBeNull();
    expect(r[0].joueuses[1].elo).toBeNull();
  });
});

describe('partitionnerTours', () => {
  const m = (round: string, vainqueurId: string | null) => ({ round, vainqueurId });

  it('un tour est validé quand tous ses matchs sont joués ; sinon il reste ouvert', () => {
    const r = partitionnerTours([m('J1', 'a'), m('J1', 'b'), m('J2', 'a'), m('J2', null), m('J3', null)]);
    expect(r).toEqual({ ouverts: ['J2', 'J3'], valides: ['J1'] });
  });

  it('aucun match : rien d\'ouvert ni de validé', () => {
    expect(partitionnerTours([])).toEqual({ ouverts: [], valides: [] });
  });
});
