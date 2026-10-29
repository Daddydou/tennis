import { describe, expect, it } from 'vitest';
import { adversairesPossibles } from '../planAdversaires';

// 8 joueurs à l'ouverture du tour en cours : 4 duels (0-1, 2-3, 4-5, 6-7).
const ouverture = [0, 1, 2, 3, 4, 5, 6, 7];
const tous = () => true;

describe('adversairesPossibles', () => {
  it('même tour que celui en cours : le partenaire du duel', () => {
    expect(adversairesPossibles(ouverture, 0, 0, tous)).toEqual([1]);
    expect(adversairesPossibles(ouverture, 5, 0, tous)).toEqual([4]);
  });

  it('tour suivant, duel voisin pas joué : les deux adversaires possibles', () => {
    expect(adversairesPossibles(ouverture, 0, 1, tous)).toEqual([2, 3]);
    expect(adversairesPossibles(ouverture, 3, 1, tous)).toEqual([0, 1]);
    expect(adversairesPossibles(ouverture, 6, 1, tous)).toEqual([4, 5]);
  });

  it('tour suivant, duel voisin joué : un seul adversaire, connu', () => {
    const vivant = (j: number) => j !== 3; // 3 a perdu son duel
    expect(adversairesPossibles(ouverture, 0, 1, vivant)).toEqual([2]);
  });

  it('deux tours plus loin : tous les joueurs encore en course du bloc voisin', () => {
    expect(adversairesPossibles(ouverture, 0, 2, tous)).toEqual([4, 5, 6, 7]);
    expect(adversairesPossibles(ouverture, 7, 2, tous)).toEqual([0, 1, 2, 3]);
    expect(adversairesPossibles(ouverture, 0, 2, (j) => j === 5 || j === 6)).toEqual([5, 6]);
  });

  it('exemption (case vide) : ignorée', () => {
    expect(adversairesPossibles([0, null, 2, 3], 0, 1, tous)).toEqual([2, 3]);
    expect(adversairesPossibles([0, 1, 2, null], 0, 1, tous)).toEqual([2]);
    expect(adversairesPossibles([0, null], 0, 0, tous)).toEqual([]);
  });

  it('joueur inconnu : liste vide', () => {
    expect(adversairesPossibles(ouverture, 99, 1, tous)).toEqual([]);
  });
});
