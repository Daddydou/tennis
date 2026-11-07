/**
 * Picks à poser pour l'accueil (db/picksAPoser.ts). Les lectures et
 * avancementPicks (déjà testé à part) sont simulés : on vérifie le câblage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TournamentRow } from '../types';

const avancementPicks = vi.fn();
const getMatchRows = vi.fn();
const getPicks = vi.fn();
const getReservationsPlan = vi.fn();

vi.mock('../tableau', () => ({ avancementPicks: (...a: unknown[]) => avancementPicks(...a) }));
vi.mock('../lectures', () => ({
  getMatchRows: (...a: unknown[]) => getMatchRows(...a),
  getPicks: (...a: unknown[]) => getPicks(...a),
  getReservationsPlan: (...a: unknown[]) => getReservationsPlan(...a),
}));

import { compterReserves, picksAPoserMoi, resumePicksAPoser } from '../picksAPoser';

const ROUNDS = ['R16', 'QF', 'SF', 'F'];
const tournoi = (id: string, rounds: string[] = ROUNDS) => ({ id, rounds }) as unknown as TournamentRow;

beforeEach(() => {
  avancementPicks.mockReset();
  getMatchRows.mockReset().mockResolvedValue([]);
  getPicks.mockReset().mockResolvedValue([]);
  getReservationsPlan.mockReset().mockResolvedValue([]);
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
    expect(resumePicksAPoser(ROUNDS, [], [])).toEqual({ tour: 'QF', reste: 3, reserves: 0 });
  });

  it('0 quand tout est posé, et jamais négatif', () => {
    avancementPicks.mockReturnValue({
      parTour: [{ round: 'F', faits: 2, requis: 1, neutralises: 0 }],
      tourCourant: 'F',
    });
    expect(resumePicksAPoser(ROUNDS, [], [])).toEqual({ tour: 'F', reste: 0, reserves: 0 });
  });

  it("null s'il n'y a pas de tour courant", () => {
    avancementPicks.mockReturnValue({ parTour: [], tourCourant: null });
    expect(resumePicksAPoser([], [], [])).toBeNull();
  });
});

describe('réservations (brouillons du plan)', () => {
  const R = (round: string, half: 'top' | 'bottom' | null = null) => ({ round, half });

  it('compte les emplacements du tour réservés et pas encore validés', () => {
    expect(compterReserves('F', [R('SF')], [R('F')])).toBe(1);
  });

  it('ignore les réservations des autres tours et celles déjà validées', () => {
    expect(compterReserves('F', [R('F')], [R('F'), R('SF')])).toBe(0);
  });

  it('une réservation = un emplacement, même répétée', () => {
    expect(compterReserves('QF', [], [R('QF', 'top'), R('QF', 'top'), R('QF', 'bottom')])).toBe(2);
  });

  it('le résumé indique combien du reste est déjà réservé (jamais plus que le reste)', () => {
    avancementPicks.mockReturnValue({
      parTour: [{ round: 'F', faits: 0, requis: 1, neutralises: 0 }],
      tourCourant: 'F',
    });
    expect(resumePicksAPoser(ROUNDS, [], [], [R('F'), R('F', 'top')])).toEqual({ tour: 'F', reste: 1, reserves: 1 });
  });

  it("picksAPoserMoi ne prend que MES réservations (participant null) et survit à une lecture ratée", async () => {
    avancementPicks.mockReturnValue({
      parTour: [{ round: 'F', faits: 0, requis: 1, neutralises: 0 }],
      tourCourant: 'F',
    });
    getReservationsPlan.mockImplementation(async (id: string) => {
      if (id === 'casse') throw new Error('illisible');
      return [
        { round: 'F', half: null, participant_id: 'laki' },
        { round: 'F', half: null, participant_id: null },
      ];
    });
    const r = await picksAPoserMoi([tournoi('ok'), tournoi('casse')]);
    expect(r.get('ok')).toEqual({ tour: 'F', reste: 1, reserves: 1 });
    expect(r.get('casse')).toEqual({ tour: 'F', reste: 1, reserves: 0 });
  });
});

describe('picksAPoserMoi', () => {
  it('lit MES picks (sans participant) et renvoie un résumé par tournoi', async () => {
    avancementPicks.mockReturnValue({
      parTour: [{ round: 'QF', faits: 0, requis: 2, neutralises: 0 }],
      tourCourant: 'QF',
    });
    const r = await picksAPoserMoi([tournoi('a'), tournoi('b')]);
    expect(r.get('a')).toEqual({ tour: 'QF', reste: 2, reserves: 0 });
    expect(r.get('b')).toEqual({ tour: 'QF', reste: 2, reserves: 0 });
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
    expect(r.get('ok')).toEqual({ tour: 'SF', reste: 1, reserves: 0 });
  });
});
