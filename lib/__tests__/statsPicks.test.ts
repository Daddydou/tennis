import { describe, expect, it } from 'vitest';
import {
  analyserPicks,
  betesNoires,
  chanceContreTalent,
  decompositionPoints,
  fetiches,
  meilleursEtPires,
  moiContreSimulateur,
  pointsPerdus,
  strategieDeStock,
  suiviDuPlan,
  suretePicks,
  tauxJustesParTour,
  type PickAnalyse,
} from '../stats/picks';
import { eloFixe, match, pick, tournoi } from './statsFixtures';

// Au premier tour : A bat B, C bat D (D abandonne), E bat F (forfait de F). G-H pas encore joué.
const matchs = [
  match({ round: 'R32', player1_id: 'A', player2_id: 'B', winner_id: 'A', position: 0 }),
  match({ round: 'R32', player1_id: 'C', player2_id: 'D', winner_id: 'C', status: 'retired', position: 1 }),
  match({ round: 'R32', player1_id: 'E', player2_id: 'F', winner_id: 'E', status: 'walkover', sets: null, position: 2 }),
  match({ round: 'R16', player1_id: 'G', player2_id: 'H', winner_id: null, status: 'scheduled', sets: null, position: 0 }),
];
const tournois = [tournoi('T1')];
// A est nettement plus fort que B ; E et F n'ont pas d'Elo.
const elo = eloFixe({ A: 2000, B: 1800, C: 1900, D: 1900, G: 1900, H: 1900 });

const picks = [
  pick({ player_id: 'A', round: 'R32', points: 10, e_points: 8, points_match: 5, points_sets: 3, points_games: 2 }),
  pick({ player_id: 'B', round: 'R32', points: 0, e_points: 3, points_match: 0, points_sets: 0, points_games: 0 }),
  pick({ player_id: 'D', round: 'R32', points: 0, e_points: 4, points_match: 0, points_sets: 0, points_games: 0 }),
  pick({ player_id: 'F', round: 'R32', points: 0, e_points: 2, points_match: 0, points_sets: 0, points_games: 0 }),
  pick({ player_id: 'G', round: 'R16', points: null, e_points: null }),
];
const analyses = analyserPicks(picks, matchs, tournois, elo);

describe('analyse des picks', () => {
  it('classe chaque pick et donne la raison d’une perte', () => {
    expect(analyses.map((a) => a.etat)).toEqual(['gagne', 'perdu', 'perdu', 'perdu', 'attente']);
    expect(analyses.map((a) => a.raison)).toEqual([null, 'defaite', 'abandon', 'forfait', null]);
  });

  it('calcule la probabilité du moteur, ou null si un Elo manque', () => {
    expect(analyses[0].p).toBeCloseTo(0.76, 2);
    expect(analyses[1].p).toBeCloseTo(0.24, 2);
    expect(analyses[3].p).toBeNull();
    expect(analyses[0].adversaireId).toBe('B');
  });

  it('taux de picks justes : les picks en attente ne comptent pas', () => {
    const { total, parTour } = tauxJustesParTour(analyses);
    expect(total).toMatchObject({ n: 5, gagnes: 1, perdus: 3, attente: 1, taux: 0.25 });
    expect(parTour.map((t) => t.round)).toEqual(['R32', 'R16']);
    expect(parTour[1].taux).toBeNull();
  });

  it('range les picks par niveau de risque', () => {
    const { tranches, sansProba } = suretePicks(analyses);
    const favoris = tranches.find((t) => t.libelle.startsWith('Favoris'));
    const paris = tranches.find((t) => t.libelle.startsWith('Paris'));
    expect(favoris).toMatchObject({ n: 1, gagnes: 1, taux: 1 });
    // B (24 %) est un pari ; D contre C (Elo égaux, 50 %) est un match équilibré.
    expect(paris).toMatchObject({ n: 1, gagnes: 0 });
    expect(tranches.find((t) => t.libelle.startsWith('Équilibrés'))).toMatchObject({ n: 1, gagnes: 0 });
    expect(sansProba).toBe(1);
  });

  it('chance contre talent : points moins espérance', () => {
    const c = chanceContreTalent(analyses);
    expect(c).toMatchObject({ n: 4, points: 10, esperance: 17, ecart: -7 });
    expect(c.plusChanceux[0].analyse.pick.player_id).toBe('A');
    expect(c.plusMalchanceux[0].analyse.pick.player_id).toBe('D');
    expect(c.parTournoi).toEqual([{ tournoi: 'T1', points: 10, esperance: 17, ecart: -7 }]);
  });

  it('meilleurs et pires picks', () => {
    const { meilleurs, pires } = meilleursEtPires(analyses, 1);
    expect(meilleurs[0].pick.player_id).toBe('A');
    expect(pires).toHaveLength(1);
    expect(pires[0].pick.points).toBe(0);
  });

  it('décomposition des points sur les picks décidés', () => {
    const d = decompositionPoints(analyses);
    expect(d.total).toBe(10);
    expect(d.nbPicks).toBe(4);
    expect(d.composantes.map((c) => c.net)).toEqual([5, 3, 2]);
  });

  it('points perdus par raison', () => {
    const p = pointsPerdus(analyses);
    expect(p.perdus).toBe(3);
    expect(p.parRaison).toEqual({ defaite: 1, abandon: 1, forfait: 1 });
    expect(p.esperanceEnJeu).toBe(9);
    expect(p.liste[0].pick.player_id).toBe('D');
  });

  it('stratégie par tour', () => {
    const s = strategieDeStock(analyses, elo);
    expect(s.map((l) => l.round)).toEqual(['R32', 'R16']);
    expect(s[0].n).toBe(4);
    expect(s[0].taux).toBe(0.25);
    expect(s[1].taux).toBeNull();
  });
});

describe('fétiches et bêtes noires', () => {
  const an = (joueur: string, points: number): PickAnalyse => ({
    pick: pick({ player_id: joueur, points }),
    tournoi: null,
    etat: points > 0 ? 'gagne' : 'perdu',
    adversaireId: null,
    p: null,
    raison: null,
  });
  const liste = [an('X', 10), an('X', 10), an('X', 10), an('Y', 0), an('Y', 0), an('Z', 10)];

  it('fétiches : au moins 2 picks, du plus fréquent au moins fréquent', () => {
    expect(fetiches(liste).map((j) => j.joueurId)).toEqual(['X', 'Y']);
  });

  it('bêtes noires : sous la moyenne générale, au moins 2 picks', () => {
    expect(betesNoires(liste).map((j) => j.joueurId)).toEqual(['Y']);
  });
});

describe('plan de picks et simulateur', () => {
  const reservation = (round: string, player: string) => ({
    tournament_id: 'T1',
    participant_id: null,
    round,
    half: null,
    player_id: player,
  });

  it('suivi du plan : validée, autre joueur, en attente', () => {
    const r = suiviDuPlan(
      [reservation('R32', 'A'), reservation('R32', 'Z'), reservation('QF', 'A')],
      [pick({ round: 'R32', player_id: 'A' })],
    );
    // Deux réservations visent la même case R32 : la première correspond, la seconde non.
    expect(r).toEqual({ total: 3, validees: 1, autreJoueur: 1, enAttente: 1 });
  });

  it('moi contre le simulateur : compare les joueurs choisis et leur issue', () => {
    const r = moiContreSimulateur(
      [reservation('R32', 'B')],
      [pick({ round: 'R32', player_id: 'A' })],
      matchs,
    );
    expect(r).toMatchObject({ emplacements: 1, identiques: 0, decides: 1, reelGagnes: 1, simulesGagnes: 0 });
  });

  it('un bac à sable recopié donne que des emplacements identiques', () => {
    const r = moiContreSimulateur(
      [reservation('R32', 'A')],
      [pick({ round: 'R32', player_id: 'A' })],
      matchs,
    );
    expect(r.identiques).toBe(r.emplacements);
  });
});
