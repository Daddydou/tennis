// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MAX_PRONOSTIC, validerPronostic, verifierPicksMasters, type PronosticMasters } from '../masters';
import { esperancePronostic, proposerPicks, proposerPronostic } from '../mastersConseils';
import { alea, simulerMasters } from '../mastersSim';
import type { LigneMatchMasters } from '../mastersVue';

const A = ['a1', 'a2', 'a3', 'a4'];
const B = ['b1', 'b2', 'b3', 'b4'];
const poules = { A, B };

function j1(): LigneMatchMasters[] {
  const l = (position: number, half: 'top' | 'bottom', p1: string, p2: string): LigneMatchMasters => ({ round: 'J1', position, half, player1Id: p1, player2Id: p2, winnerId: null, status: 'scheduled', sets: [] });
  return [l(0, 'top', 'a1', 'a4'), l(1, 'top', 'a2', 'a3'), l(2, 'bottom', 'b1', 'b4'), l(3, 'bottom', 'b2', 'b3')];
}

/** Niveaux étagés : a1 > a2 > a3 > a4 ; b1 > ... ; a1 un peu au-dessus de b1. */
const elo = new Map<string, number>([
  ['a1', 2000], ['a2', 1900], ['a3', 1800], ['a4', 1700],
  ['b1', 1950], ['b2', 1850], ['b3', 1750], ['b4', 1650],
]);
const sim = simulerMasters({ poules, elo, matchs: j1(), simulations: 6000, graine: 11 });

describe('proposerPronostic', () => {
  const { pronostic, esperance } = proposerPronostic(sim, poules);

  it('le pronostic proposé est valide au sens des règles', () => {
    expect(validerPronostic(pronostic, poules)).toEqual([]);
  });

  it('niveaux étagés : classement dans l\'ordre de force, championne la plus forte', () => {
    expect(pronostic.classementA).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(pronostic.classementB).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(pronostic.champion).toBe('a1');
    expect(pronostic.vainqueursDemis).toContain('a1');
  });

  it('l\'espérance est la somme de ses parties, entre 0 et 64', () => {
    expect(esperance.total).toBeCloseTo(esperance.qualifies + esperance.places + esperance.finalistes + esperance.champion, 9);
    expect(esperance.total).toBeGreaterThan(10);
    expect(esperance.total).toBeLessThan(MAX_PRONOSTIC);
    expect(esperance).toEqual(esperancePronostic(sim, pronostic));
  });

  it('aucun pronostic valide tiré au hasard ne fait mieux (optimalité)', () => {
    const rnd = alea(99);
    const melange = <T,>(xs: T[]) => [...xs].sort(() => rnd() - 0.5);
    for (let i = 0; i < 300; i++) {
      const classementA = melange(A);
      const classementB = melange(B);
      const d1 = [classementA[0], classementB[1]];
      const d2 = [classementB[0], classementA[1]];
      const w1 = d1[Math.floor(rnd() * 2)];
      const w2 = d2[Math.floor(rnd() * 2)];
      const p: PronosticMasters = { classementA, classementB, vainqueursDemis: [w1, w2], champion: rnd() < 0.5 ? w1 : w2 };
      expect(esperancePronostic(sim, p).total).toBeLessThanOrEqual(esperance.total + 1e-9);
    }
  });

  it('poules aux joueurs de même niveau : l\'espérance reste bien inférieure au maximum', () => {
    const egaux = new Map([...A, ...B].map((id) => [id, 1800]));
    const s = simulerMasters({ poules, elo: egaux, matchs: j1(), simulations: 4000, graine: 2 });
    expect(proposerPronostic(s, poules).esperance.total).toBeLessThan(esperance.total);
  });
});

describe('proposerPicks', () => {
  const picks = proposerPicks(sim, poules, []);
  const de = (round: string, half: 'top' | 'bottom' | null) => picks.find((p) => p.round === round && p.half === half)!;

  it('un pick par poule à chaque journée, un pick en demie, un en finale', () => {
    expect(picks.map((p) => `${p.round}${p.half ?? ''}`)).toEqual(['J1top', 'J1bottom', 'J2top', 'J2bottom', 'J3top', 'J3bottom', 'SF', 'F']);
  });

  it('respecte « un joueur une fois par phase » : trois joueurs différents par poule, puis deux en phase finale', () => {
    expect(verifierPicksMasters(picks.map((p) => ({ round: p.round, half: p.half, playerId: p.playerId })))).toEqual([]);
    for (const half of ['top', 'bottom'] as const) {
      expect(new Set(['J1', 'J2', 'J3'].map((j) => de(j, half).playerId)).size).toBe(3);
    }
    expect(de('SF', null).playerId).not.toBe(de('F', null).playerId);
  });

  it('chaque pick de poule est un joueur de la bonne poule', () => {
    for (const j of ['J1', 'J2', 'J3']) {
      expect(A).toContain(de(j, 'top').playerId);
      expect(B).toContain(de(j, 'bottom').playerId);
    }
  });

  it('affectation optimale : aucune autre affectation de la poule A ne rapporte plus', () => {
    const ep = (id: string, j: 'J1' | 'J2' | 'J3') => sim.ep[id][j];
    const choisi = (['J1', 'J2', 'J3'] as const).reduce((s, j) => s + ep(de(j, 'top').playerId, j), 0);
    let meilleur = -Infinity;
    for (const x of A) for (const y of A) for (const z of A) if (new Set([x, y, z]).size === 3) meilleur = Math.max(meilleur, ep(x, 'J1') + ep(y, 'J2') + ep(z, 'J3'));
    expect(choisi).toBeCloseTo(meilleur, 9);
  });

  it('les picks déjà posés sont conservés et bloquent leur joueur pour la phase', () => {
    const p = proposerPicks(sim, poules, [{ round: 'J1', half: 'top', playerId: 'a4' }, { round: 'SF', half: null, playerId: 'a1' }]);
    const get = (r: string, h: 'top' | 'bottom' | null) => p.find((x) => x.round === r && x.half === h)!;
    expect(get('J1', 'top')).toMatchObject({ playerId: 'a4', fixe: true });
    expect(get('J2', 'top').playerId).not.toBe('a4');
    expect(get('J3', 'top').playerId).not.toBe('a4');
    expect(get('SF', null)).toMatchObject({ playerId: 'a1', fixe: true });
    expect(get('F', null).playerId).not.toBe('a1'); // la finale ne repique pas le joueur de la demie
    // La phase finale repart de zéro : a4 (pické en J1) reste possible en demie ou en finale.
    expect(verifierPicksMasters(p.map((x) => ({ round: x.round, half: x.half, playerId: x.playerId })))).toEqual([]);
  });

  it('alternatives : les autres meilleurs choix du tour, jamais le choisi ni un joueur déjà bloqué', () => {
    const p = proposerPicks(sim, poules, [{ round: 'J1', half: 'top', playerId: 'a4' }]);
    const j2 = p.find((x) => x.round === 'J2' && x.half === 'top')!;
    expect(j2.alternatives).toHaveLength(2);
    expect(j2.alternatives.map((a) => a.playerId)).not.toContain(j2.playerId);
    expect(j2.alternatives.map((a) => a.playerId)).not.toContain('a4');
    expect(j2.alternatives[0].ep).toBeGreaterThanOrEqual(j2.alternatives[1].ep);
  });

  it('tout est déjà posé : le plan rend les picks posés', () => {
    const tout = [
      { round: 'J1', half: 'top' as const, playerId: 'a1' }, { round: 'J2', half: 'top' as const, playerId: 'a2' }, { round: 'J3', half: 'top' as const, playerId: 'a3' },
      { round: 'J1', half: 'bottom' as const, playerId: 'b1' }, { round: 'J2', half: 'bottom' as const, playerId: 'b2' }, { round: 'J3', half: 'bottom' as const, playerId: 'b3' },
      { round: 'SF', half: null, playerId: 'a1' }, { round: 'F', half: null, playerId: 'b1' },
    ];
    const p = proposerPicks(sim, poules, tout);
    expect(p.every((x) => x.fixe)).toBe(true);
    expect(p.map((x) => x.playerId)).toEqual(['a1', 'b1', 'a2', 'b2', 'a3', 'b3', 'a1', 'b1']);
  });
});
