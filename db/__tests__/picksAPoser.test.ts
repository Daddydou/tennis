/**
 * Picks à poser pour l'accueil (db/picksAPoser.ts). Les lectures et
 * avancementPicks (déjà testé à part) sont simulés : on vérifie le câblage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TournamentRow } from '../types';

const avancementPicks = vi.fn();
const getMatchRows = vi.fn();
const getPicks = vi.fn();

vi.mock('../tableau', () => ({ avancementPicks: (...a: unknown[]) => avancementPicks(...a) }));
vi.mock('../lectures', () => ({
  getMatchRows: (...a: unknown[]) => getMatchRows(...a),
  getPicks: (...a: unknown[]) => getPicks(...a),
}));

import { picksAPoserMoi, resumePicksAPoser } from '../picksAPoser';

const ROUNDS = ['R16', 'QF', 'SF', 'F'];
const tournoi = (id: string, rounds: string[] = ROUNDS) => ({ id, rounds }) as unknown as TournamentRow;

beforeEach(() => {
  avancementPicks.mockReset();
  getMatchRows.mockReset().mockResolvedValue([]);
  getPicks.mockReset().mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

describe('resumePicksAPoser', () => {
  it('reste = requis - faits sur le tour courant', () => {
    avancementPicks.mockReturnValue({
      parTour: [
        { round: 'QF', faits: 1, requis: 4, neutralises: 0 },
        { round: 'SF', faits: 0, requis: 2, neutralises: 0 },
      ],
      tourCourant: 'QF',
    });
    expect(resumePicksAPoser(ROUNDS, [], [])).toEqual({ tour: 'QF', reste: 3 });
  });

  it('0 quand tout est posé, et jamais négatif', () => {
    avancementPicks.mockReturnValue({
      parTour: [{ round: 'F', faits: 2, requis: 1, neutralises: 0 }],
      tourCourant: 'F',
    });
    expect(resumePicksAPoser(ROUNDS, [], [])).toEqual({ tour: 'F', reste: 0 });
  });

  it("null s'il n'y a pas de tour courant", () => {
    avancementPicks.mockReturnValue({ parTour: [], tourCourant: null });
    expect(resumePicksAPoser([], [], [])).toBeNull();
  });
});

describe('picksAPoserMoi', () => {
  it('lit MES picks (sans participant) et renvoie un résumé par tournoi', async () => {
    avancementPicks.mockReturnValue({
      parTour: [{ round: 'QF', faits: 0, requis: 2, neutralises: 0 }],
      tourCourant: 'QF',
    });
    const r = await picksAPoserMoi([tournoi('a'), tournoi('b')]);
    expect(r.get('a')).toEqual({ tour: 'QF', reste: 2 });
    expect(r.get('b')).toEqual({ tour: 'QF', reste: 2 });
    expect(getPicks).toHaveBeenCalledWith('a');
    expect(getPicks).toHaveBeenCalledWith('b');
  });

  it("ignore un Masters (ses picks se posent dans son Dashboard) : aucune lecture", async () => {
    const r = await picksAPoserMoi([tournoi('m', ['J1', 'J2', 'J3', 'SF', 'F'])]);
    expect(r.size).toBe(0);
    expect(getMatchRows).not.toHaveBeenCalled();
  });

  it("une lecture qui échoue retire ce tournoi (rien d'affiché) sans faire tomber les autres", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    avancementPicks.mockReturnValue({
      parTour: [{ round: 'SF', faits: 1, requis: 2, neutralises: 0 }],
      tourCourant: 'SF',
    });
    getMatchRows.mockImplementation(async (id: string) => {
      if (id === 'casse') throw new Error('base indisponible');
      return [];
    });
    const r = await picksAPoserMoi([tournoi('casse'), tournoi('ok')]);
    expect(r.has('casse')).toBe(false);
    expect(r.get('ok')).toEqual({ tour: 'SF', reste: 1 });
  });
});
