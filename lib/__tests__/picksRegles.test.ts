// @vitest-environment node
// Ce fichier lit une migration SQL sur le disque : il n'a pas besoin de jsdom,
// et sous jsdom `node:path` n'exposait pas `resolve` (« resolve is not a function »).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DATE_EFFET_FORFAIT_10,
  POINTS_FORFAIT_2026_10_05,
  POINTS_FORFAIT_HISTORIQUE,
  pointsForfaitPour,
} from '../picksRegles';
import { POINTS_VICTOIRE, pointsAtRound, scoreMatch } from '../scoring';
import { construireReference } from '../reference';
import type { Match, MatchStatus, Player, SetScore } from '../types';

const AVANT = '2026-09-21'; // Singapour 2026
const APRES = '2026-10-05'; // Shanghai 2026, premier jour de la règle

describe('pointsForfaitPour', () => {
  it('3 sets : 5 avant la date, 10 à partir de la date (incluse)', () => {
    expect(pointsForfaitPour({ start_date: AVANT, best_of: 3 })).toBe(5);
    expect(pointsForfaitPour({ start_date: '2026-10-04', best_of: 3 })).toBe(5);
    expect(pointsForfaitPour({ start_date: APRES, best_of: 3 })).toBe(10);
    expect(pointsForfaitPour({ start_date: '2027-01-12', best_of: 3 })).toBe(10);
  });

  it('5 sets : toujours 5', () => {
    expect(pointsForfaitPour({ start_date: AVANT, best_of: 5 })).toBe(5);
    expect(pointsForfaitPour({ start_date: '2027-01-12', best_of: 5 })).toBe(5);
  });

  it('date absente ou illisible : règle historique ; best_of absent = 3', () => {
    expect(pointsForfaitPour({ start_date: null, best_of: 3 })).toBe(5);
    expect(pointsForfaitPour({ start_date: 'n/a', best_of: 3 })).toBe(5);
    expect(pointsForfaitPour({ start_date: APRES, best_of: null })).toBe(10);
  });
});

describe('scoreMatch avec ptsForfait', () => {
  const pf = (start_date: string, best_of: 3 | 5) =>
    pointsForfaitPour({ start_date, best_of });

  it('forfait gagné bo3 : 5 avant, 10 après — points secs', () => {
    expect(scoreMatch([], true, 'walkover', 3, pf(AVANT, 3))).toEqual({
      match: 5, netSets: 0, netGames: 0, total: 5,
    });
    expect(scoreMatch([], true, 'walkover', 3, pf(APRES, 3))).toEqual({
      match: 10, netSets: 0, netGames: 0, total: 10,
    });
  });

  it('forfait gagné bo5 : inchangé (5)', () => {
    expect(scoreMatch([], true, 'walkover', 5, pf(APRES, 5)).total).toBe(5);
  });

  it('perdant du forfait : 0, avant comme après', () => {
    expect(scoreMatch([], false, 'walkover', 3, pf(APRES, 3)).total).toBe(0);
  });

  it('abandon et match terminé : ptsForfait sans effet', () => {
    const sets = [{ for: 6, against: 3 }, { for: 2, against: 1 }];
    const avant = scoreMatch(sets, true, 'retired', 3);
    expect(scoreMatch(sets, true, 'retired', 3, 10)).toEqual(avant);
    expect(avant.total).toBe(5 + 3 + 3);
    const complet = [{ for: 6, against: 4 }, { for: 6, against: 4 }];
    expect(scoreMatch(complet, true, 'completed', 3, 10)).toEqual(
      scoreMatch(complet, true, 'completed', 3),
    );
  });

  it('défaut : 5 (Fantasy, Bracket et équipes figées ne passent rien)', () => {
    expect(scoreMatch([], true, 'walkover').total).toBe(POINTS_VICTOIRE);
    expect(POINTS_FORFAIT_HISTORIQUE).toBe(POINTS_VICTOIRE);
  });
});

/* ------------------------------------------------------------------------ */

function joueur(id: string, winner: boolean, games: (number | null)[]) {
  const sets: SetScore[] = games.map((g) => ({ games: g, tiebreak: null }));
  return { id, name: id, seed: null, country: null, isBye: false, winner, sets };
}

function match(round: string, status: MatchStatus, a: ReturnType<typeof joueur>, b: ReturnType<typeof joueur>): Match {
  return { matchId: null, round, roundLabel: round, position: 1, half: 'top', status, players: [a, b] };
}

function player(id: string): Player {
  return {
    id, tour: 'ATP', name: id, country: null, rank: null, seed: null, half: 'top',
    eloOverall: 1500, eloHard: 1500, eloClay: 1500, eloGrass: 1500,
  };
}

describe('pointsAtRound (Fantasy) : forfait toujours à 5', () => {
  it('ne connaît pas la règle des picks', () => {
    const ms = [match('R64', 'walkover', joueur('A', true, []), joueur('B', false, []))];
    expect(pointsAtRound(ms, 'A', 'R64', 3)).toBe(5);
  });
});

describe('construireReference : même règle que les picks', () => {
  // Deux tours à un seul slot (SF, F) : la référence prend A en SF.
  const rounds = ['SF', 'F'];
  const players = { A: player('A'), B: player('B') };
  const esperances = { SF: { A: { SF: 3 } } };
  const wo = [match('SF', 'walkover', joueur('A', true, []), joueur('B', false, []))];

  it('forfait bo3 : 5 avant la date, 10 après', () => {
    expect(construireReference(wo, players, rounds, esperances, 3, AVANT).total).toBe(5);
    const apres = construireReference(wo, players, rounds, esperances, 3, APRES);
    expect(apres.total).toBe(10);
    expect(apres.picks[0].score).toEqual({ match: 10, netSets: 0, netGames: 0, total: 10 });
  });

  it('forfait bo5 : inchangé (5)', () => {
    expect(construireReference(wo, players, rounds, esperances, 5, APRES).total).toBe(5);
  });

  it('sans date : règle historique', () => {
    expect(construireReference(wo, players, rounds, esperances, 3).total).toBe(5);
  });
});

/* ------------------------------------------------------------------------ */

describe('miroir SQL (migration 0025)', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/0025_picks_forfait_10_points.sql'),
    'utf8',
  );
  // Corps de tn_points_forfait seulement, pour ne pas lire les commentaires.
  const corps = sql.slice(sql.indexOf('create or replace function tn_points_forfait'));
  const fonction = corps.slice(0, corps.indexOf('$$;'));

  it('même date, mêmes valeurs, même condition de format', () => {
    expect(fonction).toContain(`p_start_date >= date '${DATE_EFFET_FORFAIT_10}'`);
    expect(fonction).toContain('coalesce(p_best_of, 3) = 3');
    expect(fonction).toMatch(new RegExp(`then ${POINTS_FORFAIT_2026_10_05}\\b`));
    expect(fonction).toMatch(new RegExp(`else ${POINTS_FORFAIT_HISTORIQUE}\\b`));
  });

  it('tn_score_match garde le défaut 5', () => {
    expect(sql).toMatch(new RegExp(`p_pts_forfait integer default ${POINTS_VICTOIRE}\\b`));
  });
});
