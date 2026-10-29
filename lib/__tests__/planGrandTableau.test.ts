import { describe, expect, it } from 'vitest';
import type { PlayerInsight } from '../insights';
import { construireDonneesPlan, type EntreeDonnees, type LigneMatch } from '../planDonnees';
import { construireMonde } from '../planEcran';
import { construireLignesTableau, tourDuTableau } from '../planGrandTableau';
import type { Match, MatchPlayer, Player } from '../types';

/* ---- Le choix du tour affiché ---- */

describe('tourDuTableau', () => {
  const rounds = ['R32', 'R16', 'QF', 'SF', 'F'];

  it('pick pour le tour suivant : le R16 se joue, on pique les QF', () => {
    const t = tourDuTableau(rounds, 1, 'QF');
    expect(t).toEqual({ tourCourant: 'R16', tourTableau: 'QF', ecartTours: 1, roundsAffiches: ['QF', 'SF', 'F'] });
  });

  it('pick pour le tour en cours : écart 0, colonnes à partir du tour en cours', () => {
    const t = tourDuTableau(rounds, 1, 'R16');
    expect(t).toMatchObject({ tourTableau: 'R16', ecartTours: 0, roundsAffiches: ['R16', 'QF', 'SF', 'F'] });
  });

  it('plus de pick à poser (null) : on montre le tour en cours', () => {
    const t = tourDuTableau(rounds, 2, null);
    expect(t).toMatchObject({ tourCourant: 'QF', tourTableau: 'QF', ecartTours: 0, roundsAffiches: ['QF', 'SF', 'F'] });
  });

  it('deux tours plus loin : écart 2', () => {
    expect(tourDuTableau(rounds, 1, 'SF').ecartTours).toBe(2);
  });

  it('tour du pick déjà passé ou inconnu : jamais d\'écart négatif, jamais de colonne passée', () => {
    expect(tourDuTableau(rounds, 2, 'R32')).toMatchObject({ ecartTours: 0, roundsAffiches: ['QF', 'SF', 'F'] });
    expect(tourDuTableau(rounds, 2, 'ZZ')).toMatchObject({ ecartTours: 0, roundsAffiches: ['QF', 'SF', 'F'] });
  });

  it('tournoi terminé : le tour courant est le dernier', () => {
    expect(tourDuTableau(rounds, 5, null).tourCourant).toBe('F');
  });
});

/* ---- Les lignes du grand tableau : 8 joueurs, QF en cours ---- */

const ELOS = [2000, 1900, 1850, 1800, 1750, 1700, 1650, 1600];
const IDS = ELOS.map((_, i) => `J${i}`);
const players: Record<string, Player> = Object.fromEntries(
  IDS.map((id, i) => [
    id,
    { id, tour: 'ATP', name: `Joueur ${i}`, country: null, rank: i + 1, seed: null, half: i < 4 ? 'top' : 'bottom', eloOverall: ELOS[i], eloHard: ELOS[i], eloClay: ELOS[i], eloGrass: ELOS[i] } as Player,
  ]),
);
const mp = (id: string, winner = false): MatchPlayer => ({ id, name: id, seed: null, country: null, isBye: false, winner, sets: [] });

// QF : (J0-J7) (J3-J4) | (J1-J6) (J2-J5). J0 a battu J7, les trois autres duels ne sont pas joués.
const QF: [string, string][] = [['J0', 'J7'], ['J3', 'J4'], ['J1', 'J6'], ['J2', 'J5']];
const matches: Match[] = QF.map(([a, b], i) =>
  i === 0
    ? ({ matchId: null, round: 'QF', roundLabel: 'QF', position: i, half: 'top', status: 'completed', players: [mp(a, true), mp(b)] } as Match)
    : ({ matchId: null, round: 'QF', roundLabel: 'QF', position: i, half: i < 2 ? 'top' : 'bottom', status: 'scheduled', players: [mp(a), mp(b)] } as Match),
);
const lignes: LigneMatch[] = [
  ...QF.map(([a, b], i): LigneMatch => ({
    round: 'QF', position: i, player1_id: a, player2_id: b, winner_id: i === 0 ? 'J0' : null, status: i === 0 ? 'completed' : 'scheduled',
  })),
  { round: 'SF', position: 0, player1_id: null, player2_id: null, winner_id: null, status: 'scheduled' },
  { round: 'SF', position: 1, player1_id: null, player2_id: null, winner_id: null, status: 'scheduled' },
  { round: 'F', position: 0, player1_id: null, player2_id: null, winner_id: null, status: 'scheduled' },
];

function entree(over: Partial<EntreeDonnees> = {}): EntreeDonnees {
  return {
    tournoiId: 't1', nom: 'Test', rounds: ['QF', 'SF', 'F'], bestOf: 3, surface: 'hard',
    matches, matchRows: lignes, players,
    infoElo: {},
    participants: [{ id: null, nom: 'Moi' }, { id: 'L', nom: 'Laki' }, { id: 'T', nom: 'Thomas' }],
    picks: [],
    ...over,
  };
}

const INSIGHT = { joueur: 'J0' } as unknown as PlayerInsight;

function calculer(tourPick: string | null, over: Partial<EntreeDonnees> = {}, insights: Record<string, PlayerInsight | null> = {}) {
  const d = construireDonneesPlan(entree(over));
  const monde = construireMonde(d, 500);
  const stock = d.participants[0];
  const tour = tourDuTableau(d.rounds, d.r0, tourPick);
  const lignesTab = construireLignesTableau({ d, monde, stock, insights, tour });
  const ligne = (id: string) => lignesTab.find((l) => l.id === id);
  return { d, lignes: lignesTab, ligne };
}

describe('construireLignesTableau', () => {
  describe('tour en cours (pick pour le tour qui se joue)', () => {
    const { lignes: l, ligne } = calculer('QF');

    it('liste les 8 joueurs encore en lice, chacun avec un seul adversaire : son partenaire de duel', () => {
      expect(l).toHaveLength(8);
      for (const x of l) expect(x.adversaires).toHaveLength(1);
      expect(ligne('J3')?.adversaires[0].nom).toBe('Joueur 4');
      expect(ligne('J4')?.adversaires[0].nom).toBe('Joueur 3');
    });

    it('un duel déjà joué est tranché : résultat connu, victoire à 100 % ou 0 %', () => {
      expect(ligne('J0')).toMatchObject({ resultat: 'gagne', enCours: null });
      expect(ligne('J0')?.adversaires[0].pVictoire).toBe(1);
      expect(ligne('J7')).toMatchObject({ resultat: 'perdu', enCours: null });
      expect(ligne('J7')?.adversaires[0].pVictoire).toBe(0);
    });

    it('un duel pas encore joué : une probabilité entre 0 et 1, pas de résultat', () => {
      const p = ligne('J3')!.adversaires[0].pVictoire;
      expect(p).toBeGreaterThan(0.5); // J3 (1800) est plus fort que J4 (1750)
      expect(p).toBeLessThan(1);
      expect(ligne('J3')?.resultat).toBeNull();
    });

    it('les colonnes de tours vont du tour du pick à la finale', () => {
      expect(Object.keys(ligne('J3')!.parTour).sort()).toEqual(['F', 'QF', 'SF']);
    });
  });

  describe('tour suivant (le QF se joue, on pique les SF)', () => {
    const { lignes: l, ligne } = calculer('SF');

    it('le joueur battu n\'apparaît plus', () => {
      expect(ligne('J7')).toBeUndefined();
      expect(l).toHaveLength(7);
    });

    it('duel voisin pas joué : les deux adversaires possibles, avec leur probabilité et leurs points', () => {
      const adv = ligne('J0')!.adversaires;
      expect(adv.map((a) => a.nom).sort()).toEqual(['Joueur 3', 'Joueur 4']);
      for (const a of adv) {
        expect(a.pVictoire).toBeGreaterThan(0);
        expect(a.pVictoire).toBeLessThan(1);
        expect(Number.isFinite(a.points)).toBe(true);
      }
    });

    it('duel voisin joué : un seul adversaire, connu (le battu du duel voisin est retiré)', () => {
      expect(ligne('J3')!.adversaires.map((a) => a.nom)).toEqual(['Joueur 0']);
    });

    it('rappelle le duel du tour en cours : à jouer contre qui, ou son résultat', () => {
      expect(ligne('J0')!.enCours).toEqual({ round: 'QF', contre: 'Joueur 7', resultat: 'gagne' });
      expect(ligne('J3')!.enCours).toEqual({ round: 'QF', contre: 'Joueur 4', resultat: null });
      expect(ligne('J0')!.resultat).toBeNull();
    });

    it('les colonnes partent du SF', () => {
      expect(Object.keys(ligne('J0')!.parTour).sort()).toEqual(['F', 'SF']);
    });
  });

  describe('deux tours plus loin (la finale)', () => {
    it('tous les joueurs encore en course de l\'autre moitié du tableau', () => {
      const { ligne } = calculer('F');
      const adv = ligne('J0')!.adversaires.map((a) => a.nom).sort();
      expect(adv).toEqual(['Joueur 1', 'Joueur 2', 'Joueur 5', 'Joueur 6']);
      expect(ligne('J0')!.enCours?.round).toBe('QF');
    });
  });

  describe('autres informations de la ligne', () => {
    it('joueur déjà pické par le participant (utilise) ou par un autre (prisPar)', () => {
      const { ligne } = calculer('SF', {
        picks: [
          { participant_id: null, round: 'QF', half: 'top', player_id: 'J0', points: null },
          { participant_id: 'L', round: 'SF', half: 'top', player_id: 'J3', points: null },
        ],
      });
      expect(ligne('J0')).toMatchObject({ utilise: true, prisPar: [] });
      expect(ligne('J3')).toMatchObject({ utilise: false, prisPar: [{ nom: 'Laki', round: 'SF' }] });
    });

    it('rattache l\'insight du joueur, null sinon', () => {
      const { ligne } = calculer('SF', {}, { J0: INSIGHT });
      expect(ligne('J0')!.insight).toBe(INSIGHT);
      expect(ligne('J3')!.insight).toBeNull();
    });

    it('tournoi terminé : aucune ligne', () => {
      const d = construireDonneesPlan(entree());
      const fini = { ...d, r0: d.rounds.length };
      const monde = construireMonde(fini, 500);
      const tour = tourDuTableau(fini.rounds, fini.r0, null);
      expect(construireLignesTableau({ d: fini, monde, stock: fini.participants[0], insights: {}, tour })).toEqual([]);
    });
  });
});
