/**
 * Tableau compilé : côté du joueur pronostiqué, pronostic « absent du match »,
 * « n/N juste » par match, tour affiché au départ, initiale de pastille.
 */
import { describe, expect, it } from 'vitest';
import { construireTableau, initiale, tourEnCours, type MatchEntree, type PickEntree } from '../tableauVue';

const stocks = [
  { id: null, nom: 'Moi' },
  { id: 'L', nom: 'Laki' },
  { id: 'T', nom: 'Thomas' },
];
const nom = (id: string) => id.toUpperCase();

// Alcaraz (a) gagne son huitième par walkover : il doit se retrouver en quart.
const matchs: MatchEntree[] = [
  { id: '1', round: 'R16', position: 0, player1_id: 'berre', player2_id: 'a', winner_id: 'a', status: 'walkover', sets: null },
  { id: '2', round: 'QF', position: 0, player1_id: 'a', player2_id: 'fritz', winner_id: null, status: 'scheduled', sets: null },
  { id: '3', round: 'QF', position: 1, player1_id: null, player2_id: 'x', winner_id: null, status: 'scheduled', sets: null },
];
const picks: PickEntree[] = [
  { participant_id: null, round: 'R16', position: 0, player_id: 'a' },
  { participant_id: 'L', round: 'R16', position: 0, player_id: 'berre' },
  { participant_id: null, round: 'QF', position: 0, player_id: 'a' },
  { participant_id: 'L', round: 'QF', position: 0, player_id: 'zverev' },
  // Match du QF pas encore complet : on ne peut pas dire que le pronostic est absent.
  { participant_id: 'T', round: 'QF', position: 1, player_id: 'zverev' },
];

const tours = construireTableau({ rounds: ['R16', 'QF'], matchs, picks, stocks, nomJoueur: nom });

describe('tableau compilé', () => {
  it('un huitième gagné par walkover compte comme décidé et son gagnant reste juste dans le bracket', () => {
    const m = tours[0].matchs[0];
    expect(m.bilanMatch).toEqual({ justes: 1, participants: 3 });
    expect(m.picks.moi).toMatchObject({ verdict: 'juste', cote: 2, absent: false });
    expect(m.picks.L).toMatchObject({ verdict: 'rate', cote: 1, absent: false });
    expect(m.picks.T).toBeNull();
  });

  it('retrouve Alcaraz en quart dans le bracket de Moi, du bon côté', () => {
    expect(tours[1].matchs[0].picks.moi).toMatchObject({ joueurNom: 'A', cote: 1, absent: false, verdict: 'attente' });
  });

  it('marque absent un pronostic dont le joueur n’est dans aucun des deux du match (les deux connus)', () => {
    expect(tours[1].matchs[0].picks.L).toMatchObject({ joueurNom: 'ZVEREV', cote: null, absent: true });
  });

  it('ne dit pas « absent » tant qu’un des deux joueurs du match est inconnu', () => {
    expect(tours[1].matchs[1].picks.T).toMatchObject({ cote: null, absent: false });
  });

  it('pas de « n/N juste » tant que le match n’est pas décidé', () => {
    expect(tours[1].matchs[0].bilanMatch).toBeNull();
  });

  it('ouvre sur le premier tour qui a encore un match à jouer, sinon le dernier', () => {
    expect(tourEnCours(tours)).toBe('QF');
    expect(tourEnCours([tours[0]])).toBe('R16');
  });

  it('initiale de pastille', () => {
    expect(initiale('Laki')).toBe('L');
    expect(initiale(' thomas')).toBe('T');
    expect(initiale('')).toBe('?');
  });
});
