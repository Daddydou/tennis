// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { LigneMatchMasters } from '../mastersVue';
import { alea, duelsJournee2, duelsRestants, pointsDuMatch, simulerMasters, TOURS_SIM } from '../mastersSim';
import { esperancePointsDepuisP } from '../optimizerProbabilites';
import { pVictoire } from '../elo';

const A = ['a1', 'a2', 'a3', 'a4'];
const B = ['b1', 'b2', 'b3', 'b4'];
const set = (s: string) => s.split(' ').filter(Boolean).map((x) => ({ g1: Number(x.split('-')[0]), g2: Number(x.split('-')[1]) }));

/** Matchs de la journée 1 seulement (4 matchs), comme après l'import. */
function j1(): LigneMatchMasters[] {
  const l = (position: number, half: 'top' | 'bottom', p1: string, p2: string): LigneMatchMasters => ({ round: 'J1', position, half, player1Id: p1, player2Id: p2, winnerId: null, status: 'scheduled', sets: [] });
  return [l(0, 'top', 'a1', 'a4'), l(1, 'top', 'a2', 'a3'), l(2, 'bottom', 'b1', 'b4'), l(3, 'bottom', 'b2', 'b3')];
}
const egaux = new Map([...A, ...B].map((id) => [id, 1800]));

describe('pointsDuMatch (barème du jeu)', () => {
  it('les exemples des règles', () => {
    expect(pointsDuMatch(set('6-4 6-3'), true, true)).toBe(16); // victoire en 2 sets
    expect(pointsDuMatch(set('6-4 3-6 6-4'), true, true)).toBe(12); // victoire en 3 sets
    expect(pointsDuMatch(set('6-4 3-6 6-2'), false, false)).toBe(3); // défaite en 3 sets : un set gagné, écart 3
    expect(pointsDuMatch(set('6-2 6-3'), false, false)).toBe(0); // défaite sèche
  });

  it('vu du joueur 2 : les jeux sont inversés', () => {
    expect(pointsDuMatch(set('4-6 3-6'), false, true)).toBe(16);
  });
});

describe('journées 2 et 3 déduites de la journée 1', () => {
  it('journée 2 : vainqueurs entre eux, perdants entre eux', () => {
    expect(duelsJournee2('a1', 'a2', 'a4', 'a3')).toEqual([['a1', 'a2'], ['a4', 'a3']]);
  });

  it('journée 3 : les deux duels qui restent', () => {
    const jouees: [string, string][] = [['a1', 'a4'], ['a2', 'a3'], ['a1', 'a2'], ['a4', 'a3']];
    expect(duelsRestants(A, jouees).map((p) => [...p].sort().join('-')).sort()).toEqual(['a1-a3', 'a2-a4']);
  });
});

describe('simulerMasters', () => {
  const sim = simulerMasters({ poules: { A, B }, elo: egaux, matchs: j1(), simulations: 8000, graine: 1 });

  it('mêmes entrées, même graine : même résultat', () => {
    const bis = simulerMasters({ poules: { A, B }, elo: egaux, matchs: j1(), simulations: 8000, graine: 1 });
    expect(bis.champion).toEqual(sim.champion);
  });

  it('cohérence des probabilités : un rang par place, 2 qualifiés et 2 finalistes par tour, 1 champion', () => {
    for (const r of [0, 1, 2, 3]) expect(A.reduce((s, id) => s + sim.rang[id][r], 0)).toBeCloseTo(1, 6);
    expect(A.reduce((s, id) => s + sim.top2[id], 0)).toBeCloseTo(2, 6);
    expect([...A, ...B].reduce((s, id) => s + sim.finaliste[id], 0)).toBeCloseTo(2, 6);
    expect([...A, ...B].reduce((s, id) => s + sim.champion[id], 0)).toBeCloseTo(1, 6);
    expect([...A, ...B].reduce((s, id) => s + sim.joue[id].F, 0)).toBeCloseTo(2, 6);
    expect([...A, ...B].reduce((s, id) => s + sim.joue[id].SF, 0)).toBeCloseTo(4, 6);
  });

  it('joueurs de niveau égal : chacun 25 % de chaque rang, 50 % de qualification, 12,5 % de titre', () => {
    for (const id of A) {
      for (const r of [0, 1, 2, 3]) expect(sim.rang[id][r]).toBeGreaterThan(0.2);
      for (const r of [0, 1, 2, 3]) expect(sim.rang[id][r]).toBeLessThan(0.3);
      expect(sim.top2[id]).toBeGreaterThan(0.45);
      expect(sim.top2[id]).toBeLessThan(0.55);
      expect(sim.champion[id]).toBeGreaterThan(0.09);
      expect(sim.champion[id]).toBeLessThan(0.16);
    }
  });

  it('chaque joueur joue chaque journée de poule', () => {
    for (const id of [...A, ...B]) for (const t of ['J1', 'J2', 'J3'] as const) expect(sim.joue[id][t]).toBe(1);
  });

  it('points espérés d\'un duel à niveau égal : proches du calcul analytique du moteur existant', () => {
    const attendu = esperancePointsDepuisP(0.5, 3).total;
    for (const id of A) expect(Math.abs(sim.ep[id].J1 - attendu)).toBeLessThan(0.7);
  });

  it('un grand favori domine sa poule et le tournoi', () => {
    const elo = new Map(egaux);
    elo.set('a1', 2300);
    const s = simulerMasters({ poules: { A, B }, elo, matchs: j1(), simulations: 6000, graine: 3 });
    expect(s.rang.a1[0]).toBeGreaterThan(0.7);
    expect(s.top2.a1).toBeGreaterThan(0.9);
    expect(s.champion.a1).toBeGreaterThan(0.45);
    expect(s.ep.a1.J1).toBeGreaterThan(s.ep.a4.J1);
    // Le favori de la poule A rend les autres de la poule A moins probables champions.
    expect(s.champion.a2).toBeLessThan(sim.champion.a2);
  });

  it('résultats réels : une victoire acquise est jouée pour de vrai (points réels, probabilité de victoire 100 %)', () => {
    const rows = j1().map((r) => (r.position === 0 ? { ...r, winnerId: 'a1', status: 'completed', sets: set('6-4 6-3') } : r));
    const s = simulerMasters({ poules: { A, B }, elo: egaux, matchs: rows, simulations: 3000, graine: 5 });
    expect(s.ep.a1.J1).toBe(16);
    expect(s.ep.a4.J1).toBe(0);
    // a1 a gagné la journée 1 : il ne peut plus finir dernier de façon aussi probable qu'avant.
    expect(s.rang.a1[0] + s.rang.a1[1]).toBeGreaterThan(sim.rang.a1[0] + sim.rang.a1[1] - 0.02);
  });

  it('la journée 2 déduite : les vainqueurs de J1 se rencontrent (a1 et a2 vainqueurs -> a1-a2 en J2)', () => {
    // a1 bat a4, a2 bat a3 (réels) ; avec des Elo extrêmes, a1 (très fort) gagne tout : son adversaire de J2 est a2.
    const rows = j1().map((r) => {
      if (r.position === 0) return { ...r, winnerId: 'a1', status: 'completed', sets: set('6-0 6-0') };
      if (r.position === 1) return { ...r, winnerId: 'a2', status: 'completed', sets: set('6-0 6-0') };
      return r;
    });
    const elo = new Map(egaux);
    elo.set('a1', 3000);
    elo.set('a2', 1000);
    elo.set('a3', 2000);
    elo.set('a4', 2000);
    const s = simulerMasters({ poules: { A, B }, elo, matchs: rows, simulations: 2000, graine: 7 });
    // J2 : a1 (3000) contre a2 (1000) -> a1 gagne presque toujours (points espérés élevés, ~ victoire sèche) ;
    // si la règle était fausse (a1-a4 rejoués), les points de a2 en J2 ne seraient pas quasi nuls.
    // Une victoire sèche vaut au plus ~19,5 points (5 + écarts de jeux + 3 x 2 sets d'avance).
    expect(s.ep.a1.J2).toBeGreaterThan(18);
    expect(s.ep.a2.J2).toBeLessThan(2);
  });

  it('TOURS_SIM : J1, J2, J3, SF, F', () => {
    expect(TOURS_SIM).toEqual(['J1', 'J2', 'J3', 'SF', 'F']);
  });

  it('le générateur est reproductible', () => {
    const a = alea(42);
    const b = alea(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('pVictoire de référence (sanity)', () => {
    expect(pVictoire(1800, 1800)).toBeCloseTo(0.5, 6);
  });
});
