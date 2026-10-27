import { describe, expect, it } from 'vitest';
import { creerTableau, genererScenarios, indexScenario, ouvertureDuTour, propagerMoments } from '../planTableau';
import { simulerTournoi } from '../montecarloTournoi';
import type { Match, MatchPlayer, Player } from '../types';

const ELOS = [2000, 1900, 1850, 1800, 1750, 1700, 1650, 1600];
const IDS = ELOS.map((_, i) => `J${i}`);

function joueur(id: string, elo: number, half: 'top' | 'bottom'): Player {
  return {
    id,
    tour: 'ATP',
    name: id,
    country: null,
    rank: 1,
    seed: null,
    half,
    eloOverall: elo,
    eloHard: elo,
    eloClay: elo,
    eloGrass: elo,
  };
}

const players: Record<string, Player> = Object.fromEntries(
  IDS.map((id, i) => [id, joueur(id, ELOS[i], i < 4 ? 'top' : 'bottom')]),
);

const mp = (id: string | null): MatchPlayer => ({
  id,
  name: id ?? 'bye',
  seed: null,
  country: null,
  isBye: id === null,
  winner: false,
  sets: [],
});

const duel = (round: string, position: number, a: string | null, b: string | null): Match => ({
  matchId: null,
  round,
  roundLabel: round,
  position,
  half: position < 2 ? 'top' : 'bottom',
  status: 'scheduled',
  players: [mp(a), mp(b)],
});

// Tableau de 8 : (J0-J7) (J3-J4) | (J1-J6) (J2-J5)
const matches: Match[] = [
  duel('QF', 0, 'J0', 'J7'),
  duel('QF', 1, 'J3', 'J4'),
  duel('QF', 2, 'J1', 'J6'),
  duel('QF', 3, 'J2', 'J5'),
];
const rounds = ['QF', 'SF', 'F'];

describe('planTableau', () => {
  it('l\'espérance exacte colle à la simulation Monte Carlo du moteur', () => {
    const t = creerTableau(matches, players, rounds, 3, 'hard');
    const { esp } = propagerMoments(t, t.grille, 0);
    const mc = simulerTournoi(matches, players, rounds, 40000, 3, 'hard', 0.6, 7);
    let pire = 0;
    for (const id of IDS) {
      for (const r of rounds) pire = Math.max(pire, Math.abs((esp[id]?.[r] ?? 0) - (mc.esperances[id]?.[r] ?? 0)));
    }
    expect(pire).toBeLessThan(0.2);
  });

  it('l\'écart-type exact colle à celui des scénarios tirés', () => {
    const t = creerTableau(matches, players, rounds, 3, 'hard');
    const { ecart, esp } = propagerMoments(t, t.grille, 0);
    const sc = genererScenarios(t, t.grille, 0, 20000, 5);
    for (const j of ['J0', 'J3', 'J6'].map((id) => t.ids.indexOf(id))) {
      for (let r = 0; r < rounds.length; r++) {
        let s1 = 0;
        let s2 = 0;
        for (let s = 0; s < sc.S; s++) {
          const x = sc.pts[indexScenario(sc, s, r, j)];
          s1 += x;
          s2 += x * x;
        }
        const m = s1 / sc.S;
        const sd = Math.sqrt(Math.max(0, s2 / sc.S - m * m));
        expect(Math.abs(m - (esp[t.ids[j]]?.[rounds[r]] ?? 0))).toBeLessThan(0.15);
        // Le modèle exact et le tirage utilisent la même loi de jeux : écart < 8 %.
        expect(Math.abs(sd - (ecart[t.ids[j]]?.[rounds[r]] ?? 0))).toBeLessThan(0.08 * Math.max(1, sd) + 0.15);
      }
    }
  });

  it('un duel déjà joué est repris tel quel : points réels, vainqueur certain', () => {
    const t = creerTableau(matches, players, rounds, 3, 'hard');
    // J7 (le plus faible) a battu J0 en marquant 14 points ; J0 en a marqué 3.
    const [j0, j7] = [t.ids.indexOf('J0'), t.ids.indexOf('J7')];
    t.fixer(j0, j7, { gagnantEstA: false, ptsA: 3, ptsB: 14 });
    const { esp } = propagerMoments(t, t.grille, 0);
    expect(esp.J0.QF).toBeCloseTo(3, 6);
    expect(esp.J7.QF).toBeCloseTo(14, 6);
    expect(esp.J0.SF ?? 0).toBeCloseTo(0, 6); // J0 est sorti
    expect((esp.J7.SF ?? 0) > 0).toBe(true);
    const sc = genererScenarios(t, t.grille, 0, 50, 1);
    for (let s = 0; s < sc.S; s++) {
      expect(sc.pts[indexScenario(sc, s, 0, j0)]).toBe(3);
      expect(sc.pts[indexScenario(sc, s, 0, j7)]).toBe(14);
      expect(sc.vivant[indexScenario(sc, s, 1, j0)]).toBe(0);
    }
  });

  it('un blend de cotes déplace les probabilités et les espérances dans le même sens', () => {
    const base = creerTableau(matches, players, rounds, 3, 'hard');
    // Les cotes donnent J7 gagnant à 70 % contre J0 (l'Elo dit 12 %).
    const blend = creerTableau(matches, players, rounds, 3, 'hard', 0.6, (a, b, pElo) =>
      a === 'J0' && b === 'J7' ? 0.3 : a === 'J7' && b === 'J0' ? 0.7 : pElo,
    );
    const [a, b] = [base.ids.indexOf('J0'), base.ids.indexOf('J7')];
    expect(blend.p(b, a)).toBeCloseTo(0.7, 6);
    expect(blend.p(a, b) + blend.p(b, a)).toBeCloseTo(1, 6);
    expect(blend.ep(b, a)).toBeGreaterThan(base.ep(b, a));
    expect(blend.ep(a, b)).toBeLessThan(base.ep(a, b));
  });

  it('reconstruit les participants d\'un tour avancé à partir des lignes du tableau', () => {
    const t = creerTableau(matches, players, rounds, 3, 'hard');
    const avec = [...matches, duel('SF', 0, 'J0', 'J3'), duel('SF', 1, 'J1', 'J2')];
    expect(ouvertureDuTour(t, avec, 1)).toEqual(['J0', 'J3', 'J1', 'J2'].map((id) => t.ids.indexOf(id)));
    expect(ouvertureDuTour(t, avec, 0)).toEqual(t.grille);
  });
});
