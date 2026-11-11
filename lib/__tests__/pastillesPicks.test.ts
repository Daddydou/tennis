import { describe, expect, it } from 'vitest';
import {
  comparerParticipants,
  ligneDepuisPoints,
  pastillesDuTour,
  resultatDepuisPoints,
  resultatLigne,
  statutPicksAPoser,
  teinteParticipant,
} from '../pastillesPicks';

describe('pastillesDuTour', () => {
  const picksPegula = [
    { participant: 'Moi', round: 'J2' },
    { participant: 'Laki', round: 'J1' },
    { participant: 'Thomas', round: 'J2' },
  ];

  it('ne montre que les picks du tour du bloc', () => {
    const j1 = pastillesDuTour({ picks: picksPegula, round: 'J1', joueuseId: 'pegula', vainqueurId: null });
    const j2 = pastillesDuTour({ picks: picksPegula, round: 'J2', joueuseId: 'pegula', vainqueurId: null });
    expect(j1.map((p) => p.participant)).toEqual(['Laki']);
    expect(j2.map((p) => p.participant)).toEqual(['Moi', 'Thomas']);
  });

  it("un pick d'un autre tour n'apparaît pas du tout", () => {
    expect(pastillesDuTour({ picks: [{ participant: 'Moi', round: 'J2' }], round: 'J1', joueuseId: 'x', vainqueurId: null })).toEqual([]);
  });

  it('match pas joué = en attente', () => {
    const r = pastillesDuTour({ picks: picksPegula, round: 'J2', joueuseId: 'pegula', vainqueurId: null });
    expect(r.every((p) => p.resultat === 'attente')).toBe(true);
  });

  it('match joué : juste si la joueuse gagne, raté si elle perd', () => {
    expect(pastillesDuTour({ picks: picksPegula, round: 'J2', joueuseId: 'pegula', vainqueurId: 'pegula' }).map((p) => p.resultat)).toEqual(['juste', 'juste']);
    expect(pastillesDuTour({ picks: picksPegula, round: 'J2', joueuseId: 'pegula', vainqueurId: 'kostyuk' }).map((p) => p.resultat)).toEqual(['rate', 'rate']);
  });

  it('une joueuse pickée par deux participants a deux pastilles, Moi avant Laki avant Thomas', () => {
    const r = pastillesDuTour({
      picks: [
        { participant: 'Thomas', round: 'J1' },
        { participant: 'Moi', round: 'J1' },
      ],
      round: 'J1',
      joueuseId: 'x',
      vainqueurId: null,
    });
    expect(r.map((p) => p.participant)).toEqual(['Moi', 'Thomas']);
  });

  it("un même participant n'a qu'une pastille par joueuse et par tour", () => {
    const r = pastillesDuTour({
      picks: [
        { participant: 'Moi', round: 'J1' },
        { participant: 'Moi', round: 'J1' },
      ],
      round: 'J1',
      joueuseId: 'x',
      vainqueurId: null,
    });
    expect(r).toHaveLength(1);
  });
});

describe('autres fonctions', () => {
  it('resultatLigne', () => {
    expect(resultatLigne(null, 'a')).toBe('a_jouer');
    expect(resultatLigne('a', 'a')).toBe('gagne');
    expect(resultatLigne('b', 'a')).toBe('perdu');
  });

  it('teinteParticipant et ordre', () => {
    expect(teinteParticipant(' MOI ')).toBe('moi');
    expect(teinteParticipant('Inconnu')).toBe('autre');
    expect(['Zoé', 'Thomas', 'Laki', 'Moi'].sort(comparerParticipants)).toEqual(['Moi', 'Laki', 'Thomas', 'Zoé']);
  });

  it('resultatDepuisPoints', () => {
    expect(resultatDepuisPoints(null)).toBe('attente');
    expect(resultatDepuisPoints(undefined)).toBe('attente');
    expect(resultatDepuisPoints(0)).toBe('rate');
    expect(resultatDepuisPoints(5)).toBe('juste');
  });

  it('ligneDepuisPoints', () => {
    expect(ligneDepuisPoints(null)).toBe('a_jouer');
    expect(ligneDepuisPoints(0)).toBe('perdu');
    expect(ligneDepuisPoints(10)).toBe('gagne');
  });

  it('statutPicksAPoser suit les mêmes règles que le libellé de la carte', () => {
    expect(statutPicksAPoser({ reste: 0 })).toBe('pose');
    expect(statutPicksAPoser({ reste: 0, reserves: 1 })).toBe('pose');
    expect(statutPicksAPoser({ reste: 2, reserves: 2 })).toBe('reserve');
    expect(statutPicksAPoser({ reste: 3, reserves: 1 })).toBe('a_poser');
    expect(statutPicksAPoser({ reste: 2 })).toBe('a_poser');
  });
});
