// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { motsJoueur } from '../mastersMots';

describe('motsJoueur', () => {
  it('ATP : joueur(s)', () => {
    expect(motsJoueur('ATP')).toEqual({ Joueur: 'Joueur', Joueurs: 'Joueurs', un: 'un joueur' });
  });

  it('WTA ou circuit inconnu : joueuse(s)', () => {
    expect(motsJoueur('WTA').Joueur).toBe('Joueuse');
    expect(motsJoueur(null).Joueurs).toBe('Joueuses');
    expect(motsJoueur(undefined).un).toBe('une joueuse');
  });
});
