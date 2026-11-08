// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { verifierPicksMasters, type PickMasters } from '../masters';
import { proposerPicks } from '../mastersConseils';
import { simulerMasters, TOURS_SIM } from '../mastersSim';
import { planifierStrategies, STRATEGIES_MASTERS, totauxDesPicks } from '../mastersStrategies';
import type { LigneMatchMasters } from '../mastersVue';

const A = ['a1', 'a2', 'a3', 'a4'];
const B = ['b1', 'b2', 'b3', 'b4'];
const poules = { A, B };

function j1(): LigneMatchMasters[] {
  const l = (position: number, half: 'top' | 'bottom', p1: string, p2: string): LigneMatchMasters => ({ round: 'J1', position, half, player1Id: p1, player2Id: p2, winnerId: null, status: 'scheduled', sets: [] });
  return [l(0, 'top', 'a1', 'a4'), l(1, 'top', 'a2', 'a3'), l(2, 'bottom', 'b1', 'b4'), l(3, 'bottom', 'b2', 'b3')];
}

const elo = new Map<string, number>([
  ['a1', 2000], ['a2', 1900], ['a3', 1800], ['a4', 1700],
  ['b1', 1950], ['b2', 1850], ['b3', 1750], ['b4', 1650],
]);
const sim = simulerMasters({ poules, elo, matchs: j1(), simulations: 3000, graine: 11 });
const enPicks = (picks: { round: string; half: 'top' | 'bottom' | null; playerId: string }[]): PickMasters[] => picks.map((p) => ({ round: p.round, half: p.half, playerId: p.playerId }));

describe('simulation : points par tournoi simulé et écart-type', () => {
  it('la moyenne des points simulés est l\'espérance, l\'écart-type est positif quand le joueur joue', () => {
    for (const id of ['a1', 'b3']) {
      for (const t of TOURS_SIM) {
        const moyenne = totauxDesPicks(sim, [{ round: t, playerId: id }]).reduce((s, x) => s + x, 0) / sim.simulations;
        expect(moyenne).toBeCloseTo(sim.ep[id][t], 6);
      }
      expect(sim.ecart[id].J1).toBeGreaterThan(0);
    }
  });
});

describe('planifierStrategies', () => {
  const rivaux = [
    { nom: 'Laki', picks: [{ round: 'J1', half: 'top' as const, playerId: 'a1' }, { round: 'J1', half: 'bottom' as const, playerId: 'b1' }] },
    { nom: 'Thomas', picks: [] },
  ];
  const s = planifierStrategies(sim, poules, [], rivaux);

  it('Équilibré est exactement le plan historique (points espérés maximum)', () => {
    expect(enPicks(s.equilibre.picks)).toEqual(enPicks(proposerPicks(sim, poules, [])));
  });

  it('chaque stratégie propose 8 picks qui respectent « un joueur une fois par phase »', () => {
    for (const nom of STRATEGIES_MASTERS) {
      const plan = s[nom]!;
      expect(plan.picks).toHaveLength(8);
      expect(verifierPicksMasters(enPicks(plan.picks))).toEqual([]);
    }
  });

  it('aucun plan ne dépasse la moyenne d\'Équilibré (il maximise les points espérés)', () => {
    for (const nom of ['prudent', 'audacieux', 'rivaux'] as const) expect(s[nom]!.stats.moyenne).toBeLessThanOrEqual(s.equilibre.stats.moyenne + 1e-9);
  });

  it('les bilans sont cohérents : mauvais cas <= moyenne <= bon cas', () => {
    for (const nom of STRATEGIES_MASTERS) {
      const { mauvais, moyenne, bon } = s[nom]!.stats;
      expect(mauvais).toBeLessThanOrEqual(moyenne);
      expect(moyenne).toBeLessThanOrEqual(bon);
    }
  });

  it('Contre les rivaux : au moins aussi bon qu\'Équilibré pour finir devant, sur les mêmes tournois', () => {
    expect(s.rivaux).not.toBeNull();
    expect(s.rivaux!.stats.devant!).toBeGreaterThanOrEqual(s.equilibre.stats.devant! - 1e-9);
    expect(s.rivauxNoms).toEqual(['Laki', 'Thomas']);
  });

  it('sans rival : pas de stratégie « contre » ni de chance de finir devant', () => {
    const sans = planifierStrategies(sim, poules, [], []);
    expect(sans.rivaux).toBeNull();
    expect(sans.equilibre.stats.devant).toBeNull();
  });

  it('les picks déjà posés sont gardés par toutes les stratégies', () => {
    const existants: PickMasters[] = [{ round: 'J1', half: 'top', playerId: 'a4' }, { round: 'SF', half: null, playerId: 'a1' }];
    const p = planifierStrategies(sim, poules, existants, rivaux);
    for (const nom of STRATEGIES_MASTERS) {
      const plan = p[nom]!;
      expect(plan.picks.find((x) => x.round === 'J1' && x.half === 'top')).toMatchObject({ playerId: 'a4', fixe: true });
      expect(plan.picks.find((x) => x.round === 'SF')).toMatchObject({ playerId: 'a1', fixe: true });
      expect(verifierPicksMasters(enPicks(plan.picks))).toEqual([]);
    }
  });

  it('un tour fermé n\'a plus de proposition (sauf le pick déjà posé)', () => {
    const p = planifierStrategies(sim, poules, [{ round: 'J1', half: 'top', playerId: 'a1' }], rivaux, new Set(['J1']));
    for (const nom of STRATEGIES_MASTERS) {
      const j = p[nom]!.picks.filter((x) => x.round === 'J1');
      expect(j).toHaveLength(1);
      expect(j[0]).toMatchObject({ half: 'top', playerId: 'a1', fixe: true });
    }
  });

  it('Contre les rivaux tient compte de leurs picks : un rival qui a posé le meilleur joueur change la chance de finir devant', () => {
    const seul = planifierStrategies(sim, poules, [], [{ nom: 'Laki', picks: [] }]);
    const fort = planifierStrategies(sim, poules, [], [{ nom: 'Laki', picks: [{ round: 'J1', half: 'top', playerId: 'a1' }, { round: 'J2', half: 'top', playerId: 'a2' }, { round: 'J3', half: 'top', playerId: 'a3' }] }]);
    expect(fort.rivaux!.stats.devant).not.toBeCloseTo(seul.rivaux!.stats.devant!, 6);
  });
});
