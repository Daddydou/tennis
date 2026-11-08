import { describe, expect, it } from 'vitest';
import {
  arbreRegulier,
  cellulesSets,
  construireTableau,
  libelleTour,
  type MatchEntree,
  type PickEntree,
} from '../tableauVue';

const NOMS: Record<string, string> = { a: 'Alcaraz', b: 'Bublik', c: 'Cobolli', d: 'Draper' };
const nomJoueur = (id: string) => NOMS[id] ?? id;
const stocks = [
  { id: null, nom: 'Moi' },
  { id: 'p-laki', nom: 'Laki' },
];

function match(partiel: Partial<MatchEntree> & Pick<MatchEntree, 'id' | 'round' | 'position'>): MatchEntree {
  return {
    player1_id: 'a',
    player2_id: 'b',
    winner_id: null,
    status: 'scheduled',
    sets: null,
    ...partiel,
  };
}

describe('cellulesSets : tie-break', () => {
  const sets = [
    { g1: 7, g2: 6, tb1: null, tb2: 3 },
    { g1: 4, g2: 6, tb1: null, tb2: null },
    { g1: 6, g2: 7, tb1: 5, tb2: null },
  ];

  it('montre le tie-break du perdant en exposant sur SON score', () => {
    expect(cellulesSets(sets, 2)).toEqual([
      { jeux: '6', tb: '3' },
      { jeux: '6', tb: null },
      { jeux: '7', tb: null },
    ]);
    expect(cellulesSets(sets, 1)).toEqual([
      { jeux: '7', tb: null },
      { jeux: '4', tb: null },
      { jeux: '6', tb: '5' },
    ]);
  });

  it('ignore un tie-break posé sur le côté qui a gagné le set', () => {
    expect(cellulesSets([{ g1: 7, g2: 6, tb1: 7, tb2: 3 }], 1)).toEqual([{ jeux: '7', tb: null }]);
  });

  it('gère les sets vides et l\'absence de sets', () => {
    expect(cellulesSets(null, 1)).toEqual([]);
    expect(cellulesSets([{ g1: null, g2: null }], 1)).toEqual([{ jeux: '', tb: null }]);
  });
});

describe('construireTableau', () => {
  const matchs: MatchEntree[] = [
    match({ id: 'm0', round: 'R16', position: 0, winner_id: 'a', status: 'completed' }),
    match({ id: 'm1', round: 'R16', position: 1, player1_id: 'c', player2_id: 'd', winner_id: 'd', status: 'completed' }),
    match({ id: 'm2', round: 'R16', position: 2, player1_id: 'a', player2_id: 'c' }),
  ];
  const picks: PickEntree[] = [
    { participant_id: null, round: 'R16', position: 0, player_id: 'a' },
    { participant_id: null, round: 'R16', position: 1, player_id: 'c' },
    { participant_id: null, round: 'R16', position: 2, player_id: 'a' },
    { participant_id: 'p-laki', round: 'R16', position: 0, player_id: 'b' },
  ];

  const tours = construireTableau({ rounds: ['R16', 'QF'], matchs, picks, stocks, nomJoueur });

  it('ignore les tours sans match et nomme les tours', () => {
    expect(tours.map((t) => t.round)).toEqual(['R16']);
    expect(tours[0].libelle).toBe('Huitièmes');
  });

  it('juge chaque pronostic : juste, raté, en attente', () => {
    const [m0, m1, m2] = tours[0].matchs;
    expect(m0.picks.moi?.verdict).toBe('juste');
    expect(m1.picks.moi?.verdict).toBe('rate');
    expect(m2.picks.moi?.verdict).toBe('attente');
    expect(m0.picks['p-laki']?.verdict).toBe('rate');
  });

  it('laisse null un match sans pronostic', () => {
    expect(tours[0].matchs[1].picks['p-laki']).toBeNull();
  });

  it('donne le vainqueur et marque gagnant / perdant', () => {
    const m1 = tours[0].matchs[1];
    expect(m1.vainqueurNom).toBe('Draper');
    expect(m1.lignes[0]).toMatchObject({ nom: 'Cobolli', gagnant: false, perdant: true });
    expect(m1.lignes[1]).toMatchObject({ nom: 'Draper', gagnant: true, perdant: false });
  });

  it('compte les bilans par participant (posés / décidés / justes)', () => {
    expect(tours[0].bilans.moi).toEqual({ poses: 3, decides: 2, justes: 1 });
    expect(tours[0].bilans['p-laki']).toEqual({ poses: 1, decides: 1, justes: 0 });
  });

  it('affiche BYE pour une place vide', () => {
    const t = construireTableau({
      rounds: ['R16'],
      matchs: [match({ id: 'x', round: 'R16', position: 0, player2_id: null })],
      picks: [],
      stocks,
      nomJoueur,
    });
    expect(t[0].matchs[0].lignes[1]).toMatchObject({ nom: 'BYE', bye: true });
  });
});

describe('libelleTour / arbreRegulier', () => {
  it('traduit les codes connus et garde les autres', () => {
    expect(libelleTour('SF')).toBe('Demi-finales');
    expect(libelleTour('F')).toBe('Finale');
    expect(libelleTour('Q1')).toBe('Q1');
  });

  const tour = (round: string, n: number) => ({
    round,
    libelle: round,
    bilans: {},
    matchs: Array.from({ length: n }, (_, i) => ({ id: `${round}${i}` }) as never),
  });

  it('accepte 8-4-2-1 et refuse un tour incomplet ou trop haut', () => {
    expect(arbreRegulier([tour('R16', 8), tour('QF', 4), tour('SF', 2), tour('F', 1)])).toBe(true);
    expect(arbreRegulier([tour('R16', 8), tour('QF', 3)])).toBe(false);
    expect(arbreRegulier([tour('R32', 32), tour('R16', 16)])).toBe(false);
    expect(arbreRegulier([])).toBe(false);
  });
});

describe('construireTableau : picks du jeu', () => {
  const matchs = [
    match({ id: 'm1', round: 'QF', position: 0, winner_id: 'a', status: 'completed' }),
    match({ id: 'm2', round: 'QF', position: 1, player1_id: 'c', player2_id: 'd' }),
  ];
  const construire = (picksJeu: { participant_id: string | null; round: string; player_id: string }[]) =>
    construireTableau({ rounds: ['QF'], matchs, picks: [], picksJeu, stocks, nomJoueur });

  it('place chaque pick sur le match où le joueur pické joue, avec ✓ / ✗ / attente', () => {
    const [qf] = construire([
      { participant_id: null, round: 'QF', player_id: 'a' },
      { participant_id: 'p-laki', round: 'QF', player_id: 'b' },
      { participant_id: null, round: 'QF', player_id: 'c' },
    ]);
    expect(qf.matchs[0].picksJeu).toEqual([
      { cle: 'moi', participantNom: 'Moi', joueurNom: 'Alcaraz', verdict: 'juste' },
      { cle: 'p-laki', participantNom: 'Laki', joueurNom: 'Bublik', verdict: 'rate' },
    ]);
    expect(qf.matchs[1].picksJeu).toEqual([
      { cle: 'moi', participantNom: 'Moi', joueurNom: 'Cobolli', verdict: 'attente' },
    ]);
  });

  it('ignore un pick d\'un autre tour et reste vide sans picksJeu', () => {
    const [qf] = construire([{ participant_id: null, round: 'SF', player_id: 'a' }]);
    expect(qf.matchs[0].picksJeu).toEqual([]);
    const [sans] = construireTableau({ rounds: ['QF'], matchs, picks: [], stocks, nomJoueur });
    expect(sans.matchs[1].picksJeu).toEqual([]);
  });
});