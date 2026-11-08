import { describe, expect, it } from 'vitest';
import { construireAnalyseJoueurs } from '../analyseJoueurs';
import type { DonneesPlan } from '../planDonnees';

const joueur = (id: string, nom: string, rang: number, elo: number) => ({
  id,
  nom,
  rang,
  elo,
  moitie: 'top' as const,
  sourceElo: 'ta' as const,
  taName: null,
  candidatsElo: [],
});

function donnees(partiel: Partial<DonneesPlan> = {}): DonneesPlan {
  return {
    tournoiId: 't',
    nom: 'Paris',
    rounds: ['QF', 'SF', 'F'],
    bestOf: 3,
    r0: 0,
    joueurs: [joueur('a', 'Alcaraz', 1, 2200), joueur('b', 'Bublik', 30, 2000), joueur('c', 'Cobolli', 20, 2050), joueur('d', 'Draper', 15, 2100)],
    grille: [0, 1, 2, 3],
    ouverture: [0, 1, 2, 3],
    blend: [],
    fixes: [],
    participants: [
      { id: null, nom: 'Moi', picks: [{ round: 'QF', half: 'top', joueur: 0, points: null }] },
      { id: 'laki', nom: 'Laki', picks: [{ round: 'QF', half: 'top', joueur: 1, points: null }, { round: 'SF', half: null, joueur: 0, points: null }] },
    ],
    slots: [],
    ...partiel,
  };
}

describe('construireAnalyseJoueurs', () => {
  it('une affiche par duel du tour en cours, avec adversaire, Elo et picks de chacun', () => {
    const aff = construireAnalyseJoueurs(donnees());
    expect(aff).toHaveLength(2);
    const [a, b] = aff[0].lignes;
    expect(a).toMatchObject({ nom: 'Alcaraz', rang: 1, elo: 2200, etat: 'attente', adversaire: { nom: 'Bublik', elo: 2000 } });
    expect(a.proba).toBeGreaterThan(0.5);
    expect(a.picks).toEqual([
      { participant: 'Moi', round: 'QF' },
      { participant: 'Laki', round: 'SF' },
    ]);
    expect(b.picks).toEqual([{ participant: 'Laki', round: 'QF' }]);
    expect(aff[0].round).toBe('QF');
  });

  it('les cotes (blend) remplacent l\'Elo pour la probabilité, dans les deux sens', () => {
    const aff = construireAnalyseJoueurs(donnees({ blend: [[0, 1, 0.3]] }));
    expect(aff[0].lignes[0].proba).toBeCloseTo(0.3);
    expect(aff[0].lignes[1].proba).toBeCloseTo(0.7);
  });

  it('un duel déjà joué donne gagné / perdu', () => {
    const aff = construireAnalyseJoueurs(donnees({ fixes: [{ a: 2, b: 3, gagnantEstA: false, ptsA: 0, ptsB: 5 }] }));
    expect(aff[1].lignes[0].etat).toBe('perdu');
    expect(aff[1].lignes[1].etat).toBe('gagne');
    expect(aff[0].lignes[0].etat).toBe('attente');
  });

  it('tournoi terminé : rien à analyser', () => {
    expect(construireAnalyseJoueurs(donnees({ r0: 3 }))).toEqual([]);
  });

  it('adversaire pas encore connu : le joueur connu s\'affiche, sans proba', () => {
    const aff = construireAnalyseJoueurs(donnees({ ouverture: [0, null, 2, 3] }));
    expect(aff[0].lignes[0]).toMatchObject({ nom: 'Alcaraz', adversaire: null, proba: null });
    expect(aff[0].lignes[1].nom).toBe('À déterminer');
  });
});
