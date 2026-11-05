// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { BracketThomas, MatchThomas } from '../thomasApi';
import { lireScoreThomas, resultatsDeSecours, type MatchAvecVainqueur } from '../resultatsSecours';

describe('lireScoreThomas', () => {
  it('vainqueur = joueur 1 : jeux du vainqueur à gauche', () => {
    const r = lireScoreThomas('7-5 3-6 6-4', true);
    expect(r.status).toBe('completed');
    expect(r.sets.map((s) => [s.g1, s.g2])).toEqual([[7, 5], [3, 6], [6, 4]]);
  });

  it('vainqueur = joueur 2 : les jeux sont inversés pour rester « joueur 1 d\'abord » (Van Assche, Paris 2026)', () => {
    const r = lireScoreThomas('7-5 3-6 6-4', false);
    expect(r.sets.map((s) => [s.g1, s.g2])).toEqual([[5, 7], [6, 3], [4, 6]]);
  });

  it('tie-break : points du perdant du set, rangés du côté qui a le moins de jeux', () => {
    expect(lireScoreThomas('7-6(4) 6-4', true).sets[0]).toEqual({ g1: 7, g2: 6, tb1: null, tb2: 4 });
    expect(lireScoreThomas('7-6(4) 6-4', false).sets[0]).toEqual({ g1: 6, g2: 7, tb1: 4, tb2: null });
    // Set perdu par le vainqueur du match, tie-break compris.
    expect(lireScoreThomas('6-7(3) 6-4 6-2', true).sets[0]).toEqual({ g1: 6, g2: 7, tb1: 3, tb2: null });
  });

  it('forfait : aucun set ; abandon : statut retired', () => {
    expect(lireScoreThomas('w/o', true)).toEqual({ status: 'walkover', sets: [] });
    expect(lireScoreThomas('6-3 2-1 ret.', true).status).toBe('retired');
    expect(lireScoreThomas(null, true)).toEqual({ status: 'completed', sets: [] });
  });
});

/* ---- Tableau de 8 : QF (4 matchs), SF, F ---- */

const NOMS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
const noms = new Map(NOMS.map((n, i) => [`j${i + 1}`, `${n[0]}. ${n}`]));

const matchT = (index: number, p1: number | null, p2: number | null, vainqueur: number | null, score: string | null): MatchThomas => ({
  index,
  position1: p1,
  position2: p2,
  vainqueur,
  score,
  pronostics: [],
});

function thomas(qf: [number | null, string | null][] = [[null, null], [null, null], [null, null], [null, null]]): BracketThomas {
  return {
    jeu: 'bracket',
    jeuTennis: 'tennis',
    tournoi: { id: 't', nom: 'Test', tour: 'ATP', annee: 2026, type: 'ATP_500', surface: 'HARD', lieu: 'Ici', drawSize: 8, statut: 'EN_COURS', verrouille: true, lockAt: null },
    participants: [],
    joueurs: NOMS.map((n, i) => ({
      position: i + 1,
      prenom: `${n[0]}${n.slice(1).toLowerCase()}a`,
      nom: n.toUpperCase(),
      tete: null,
      statut: null,
      pays: null,
      classement: null,
      apiPlayerId: `api-${i + 1}`,
    })),
    tours: [
      { tour: 1, nom: 'Quarts', statut: 'EN_COURS', matchs: qf.map(([v, s], i) => matchT(i, 2 * i + 1, 2 * i + 2, v, s)) },
      { tour: 2, nom: 'Demies', statut: 'A_VENIR', matchs: [matchT(0, null, null, null, null), matchT(1, null, null, null, null)] },
      { tour: 3, nom: 'Finale', statut: 'A_VENIR', matchs: [matchT(0, null, null, null, null)] },
    ],
  };
}

function internes(over: Partial<MatchAvecVainqueur>[] = []): MatchAvecVainqueur[] {
  const qf: MatchAvecVainqueur[] = [0, 1, 2, 3].map((i) => ({
    round: 'QF',
    position: i,
    player1Id: `j${2 * i + 1}`,
    player2Id: `j${2 * i + 2}`,
    status: 'scheduled',
    winnerId: null,
    ...over[i],
  }));
  return [...qf, { round: 'SF', position: 0, player1Id: null, player2Id: null, status: 'scheduled', winnerId: null }, { round: 'SF', position: 1, player1Id: null, player2Id: null, status: 'scheduled', winnerId: null }];
}

const ROUNDS = ['QF', 'SF', 'F'];

describe('resultatsDeSecours', () => {
  it('reprend un résultat que notre source n\'a pas : vainqueur, sets dans l\'ordre de NOTRE match, place dans la demie', () => {
    const p = resultatsDeSecours(thomas([[null, null], [4, '6-3 6-4'], [null, null], [null, null]]), ROUNDS, internes(), noms);
    if (!p.ok) throw new Error(p.erreurs.join('\n'));
    expect(p.resultats).toEqual([
      {
        round: 'QF',
        position: 1,
        winnerId: 'j4',
        status: 'completed',
        sets: [
          { g1: 3, g2: 6, tb1: null, tb2: null },
          { g1: 4, g2: 6, tb1: null, tb2: null },
        ],
        // Match 1 du QF : demie 0, côté « joueur 2 ».
        suivant: { round: 'SF', position: 0, colonne: 'player2_id' },
      },
    ]);
  });

  it('le vainqueur du match 2 va côté joueur 1 de la demie 1', () => {
    const p = resultatsDeSecours(thomas([[null, null], [null, null], [5, '6-0 6-2'], [null, null]]), ROUNDS, internes(), noms);
    if (!p.ok) throw new Error(p.erreurs.join('\n'));
    expect(p.resultats[0].suivant).toEqual({ round: 'SF', position: 1, colonne: 'player1_id' });
  });

  it('jamais d\'écrasement : un match déjà tranché chez nous est laissé tel quel', () => {
    const m = internes([{}, { winnerId: 'j3', status: 'completed' }]);
    const p = resultatsDeSecours(thomas([[null, null], [4, '6-3 6-4'], [null, null], [null, null]]), ROUNDS, m, noms);
    if (!p.ok) throw new Error(p.erreurs.join('\n'));
    expect(p.resultats).toEqual([]);
  });

  it('un match en direct chez nous peut être complété ; une exemption, jamais', () => {
    const m = internes([{ status: 'live' }, { status: 'bye' }]);
    const p = resultatsDeSecours(thomas([[1, '6-4 6-4'], [4, '6-3 6-4'], [null, null], [null, null]]), ROUNDS, m, noms);
    if (!p.ok) throw new Error(p.erreurs.join('\n'));
    expect(p.resultats.map((r) => `${r.round}|${r.position}=${r.winnerId}`)).toEqual(['QF|0=j1']);
  });

  it('ordre inversé dans notre match (Paris 2026) : le vainqueur est retrouvé par le nom, les sets suivent notre ordre', () => {
    const m = internes([{ player1Id: 'j2', player2Id: 'j1' }]);
    // Thomas : Alpha (position 1) bat Bravo 6-3 6-4. Chez nous : Bravo est joueur 1, Alpha joueur 2.
    const p = resultatsDeSecours(thomas([[1, '6-3 6-4'], [null, null], [null, null], [null, null]]), ROUNDS, m, noms);
    if (!p.ok) throw new Error(p.erreurs.join('\n'));
    expect(p.resultats[0].winnerId).toBe('j1');
    expect(p.resultats[0].sets.map((s) => [s.g1, s.g2])).toEqual([[3, 6], [4, 6]]);
  });

  it('un vainqueur qui n\'est pas dans notre match est ignoré et signalé, jamais deviné', () => {
    const m = internes([{ player2Id: 'j7' }]);
    const p = resultatsDeSecours(thomas([[2, '6-3 6-4'], [null, null], [null, null], [null, null]]), ROUNDS, m, noms);
    if (!p.ok) throw new Error(p.erreurs.join('\n'));
    expect(p.resultats).toEqual([]);
    expect(p.ignores).toHaveLength(1);
  });

  it('match pas encore joué chez Thomas : rien à reprendre', () => {
    const p = resultatsDeSecours(thomas(), ROUNDS, internes(), noms);
    if (!p.ok) throw new Error(p.erreurs.join('\n'));
    expect(p.resultats).toEqual([]);
  });

  it('tableaux non superposables (tours) : refus, aucune reprise', () => {
    expect(resultatsDeSecours(thomas(), ['SF'], internes(), noms).ok).toBe(false);
  });

  it('la finale n\'a pas de match suivant', () => {
    const b = thomas();
    b.tours[2].matchs[0] = matchT(0, 1, 5, 5, '6-4 6-4');
    const m: MatchAvecVainqueur[] = [
      ...internes(),
      { round: 'F', position: 0, player1Id: 'j1', player2Id: 'j5', status: 'scheduled', winnerId: null },
    ];
    const p = resultatsDeSecours(b, ROUNDS, m, noms);
    if (!p.ok) throw new Error(p.erreurs.join('\n'));
    expect(p.resultats).toEqual([expect.objectContaining({ round: 'F', winnerId: 'j5', suivant: null })]);
  });
});
