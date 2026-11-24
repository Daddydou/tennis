// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { picksTableauDavis, vueBracketDavis, vuePronosDavis } from '../davisVues';
import type { LigneProno } from '../davisPronos';
import { construireTableau } from '../tableauVue';

const STOCKS = [
  { id: null, nom: 'Moi' },
  { id: 'laki', nom: 'Laki' },
];

// Tchéquie – Canada (QF position 1) : S1 Tchéquie 2-0, S2 Canada 2-0, double Tchéquie 2-0 -> Tchéquie 2-1.
const jeux = (a: number, b: number) => ({ g1: a, g2: b });
const SETS = [
  { g1: 1, g2: 0, ordre: 1, statut: 'termine', jeux: [jeux(6, 4), jeux(6, 4)] },
  { g1: 0, g2: 1, ordre: 2, statut: 'termine', jeux: [jeux(5, 7), jeux(3, 6)] },
  { g1: 1, g2: 0, ordre: 3, statut: 'termine', jeux: [jeux(6, 3), jeux(7, 6)] },
];
const ROWS = [
  { round: 'QF', position: 0, player1_id: 'davis-ITA', player2_id: 'davis-KOR', sets: [] },
  { round: 'QF', position: 1, player1_id: 'davis-CZE', player2_id: 'davis-CAN', sets: SETS },
  { round: 'SF', position: 0, player1_id: 'davis-CZE', player2_id: null, sets: [] },
  { round: 'SF', position: 1, player1_id: null, player2_id: null, sets: [] },
  { round: 'F', position: 0, player1_id: null, player2_id: null, sets: [] },
];
const B = (participantId: string | null, round: 'QF' | 'SF' | 'F', pos: number, nation: 'CZE' | 'CAN' | 'ITA' | 'ESP', sets: '2-0' | '2-1'): LigneProno => ({
  participantId, round, matchPosition: pos, jeu: 'bracket', ordre: null, nation, sets,
});
const M = (participantId: string | null, ordre: 1 | 2 | 3, nation: 'CZE' | 'CAN', sets: '2-0' | '2-1'): LigneProno => ({
  participantId, round: 'QF', matchPosition: 1, jeu: 'match', ordre, nation, sets,
});

describe('vue du bracket', () => {
  const lignes: LigneProno[] = [
    B(null, 'QF', 1, 'CZE', '2-1'), // juste : nation + score -> 3
    B('laki', 'QF', 1, 'CZE', '2-0'), // nation juste, score raté -> 2
    B(null, 'QF', 0, 'ITA', '2-0'), // pas jouée : en attente
    B('laki', 'SF', 1, 'CAN', '2-0'), // Canada éliminée : raté d'avance
    B(null, 'F', 0, 'ESP', '2-0'), // en attente, encore possible
  ];
  const v = vueBracketDavis(ROWS, lignes, STOCKS);

  it('verdict et points de la rencontre jouée', () => {
    const qf = v.tours[0].rencontres.find((r) => r.position === 2)!;
    expect(qf.vainqueur).toBe('CZE');
    expect(qf.score).toBe('2-1');
    expect(qf.lignes[0]).toMatchObject({ verdictNation: 'juste', verdictScore: 'juste', points: 3 });
    expect(qf.lignes[1]).toMatchObject({ verdictNation: 'juste', verdictScore: 'rate', points: 2 });
  });
  it('rencontre pas jouée : en attente ; nation éliminée : raté sans attendre', () => {
    const qf1 = v.tours[0].rencontres.find((r) => r.position === 1)!;
    expect(qf1.lignes[0]).toMatchObject({ verdictNation: 'attente', points: null });
    const sf2 = v.tours[1].rencontres.find((r) => r.position === 2)!;
    expect(sf2.lignes[1]).toMatchObject({ verdictNation: 'rate', verdictScore: 'rate' });
  });
  it('un participant sans prono sur une rencontre : ligne vide', () => {
    expect(v.tours[0].rencontres[0].lignes[1].vide).toBe(true);
  });
  it('totaux : points gagnés et reste possible (sans la nation éliminée)', () => {
    // Moi : QF2 juste 3 ; reste QF1 (3) + finale (12) = 15. Laki : 2 ; la demie 2 avec le Canada ne compte plus.
    expect(v.totaux.moi).toEqual({ points: 3, reste: 15, nb: 3 });
    expect(v.totaux.laki).toEqual({ points: 2, reste: 0, nb: 2 });
  });
  it('les tours sans rencontre ne sont pas montrés', () => {
    expect(vueBracketDavis([ROWS[1]], [], STOCKS).tours.map((t) => t.tour)).toEqual(['QF']);
  });
});

describe('vue des pronos des matchs', () => {
  const lignes: LigneProno[] = [
    M(null, 1, 'CZE', '2-0'), M(null, 2, 'CZE', '2-1'), M(null, 3, 'CZE', '2-0'),
    M('laki', 1, 'CZE', '2-1'), M('laki', 2, 'CAN', '2-0'), M('laki', 3, 'CZE', '2-0'),
  ];
  const [r] = vuePronosDavis(ROWS, lignes, STOCKS);

  it('une seule rencontre a des pronos', () => {
    expect(vuePronosDavis(ROWS, lignes, STOCKS)).toHaveLength(1);
    expect(r).toMatchObject({ nation1: 'CZE', nation2: 'CAN', decidee: true, libelle: 'Quart de finale 2' });
  });
  it('verdict de chaque prono', () => {
    const [s1, s2, d] = r.matchs;
    expect(s1.lignes.map((l) => l.verdict)).toEqual(['complet', 'nation']); // Laki : bonne nation, mauvais score
    expect(s2.lignes.map((l) => l.verdict)).toEqual(['rate', 'complet']);
    expect(d.lignes.map((l) => l.verdict)).toEqual(['complet', 'complet']);
  });
  it('points par rencontre : mêmes que lib/davis (carton plein compris)', () => {
    // Moi : S1 3 + S2 0 + D 3 = 6 ; Laki : S1 2 + S2 3 + D 3 = 8 + carton ? non (S1 score raté).
    expect(r.points).toEqual({ moi: 6, laki: 8 });
    expect(r.carton).toEqual({ moi: false, laki: false });
  });
  it('avant le match : en attente ; double pas joué : sans objet', () => {
    const avant = ROWS.map((x) => (x.position === 1 && x.round === 'QF' ? { ...x, sets: [] } : x));
    expect(vuePronosDavis(avant, lignes, STOCKS)[0].matchs[0].lignes[0].verdict).toBe('attente');
    const deux0 = ROWS.map((x) => (x.position === 1 && x.round === 'QF' ? { ...x, sets: [SETS[0], { ...SETS[1], g1: 1, g2: 0 }] } : x));
    expect(vuePronosDavis(deux0, lignes, STOCKS)[0].matchs[2].lignes.map((l) => l.verdict)).toEqual(['sans', 'sans']);
  });
});

describe('pastilles du Tableau', () => {
  it('les pronos de Game Tracker remplacent ceux du pont pour un participant, les autres sont gardés', () => {
    const existants = [
      { participant_id: null, round: 'QF', position: 0, player_id: 'davis-KOR' },
      { participant_id: 'laki', round: 'QF', position: 0, player_id: 'davis-ITA' },
    ];
    const r = picksTableauDavis(existants, [B(null, 'QF', 0, 'ITA', '2-0')]);
    expect(r).toEqual([
      { participant_id: 'laki', round: 'QF', position: 0, player_id: 'davis-ITA' },
      { participant_id: null, round: 'QF', position: 0, player_id: 'davis-ITA' },
    ]);
  });
});

describe('emplacement sans nation (Tableau)', () => {
  it('« À déterminer » à la place de BYE quand le libellé est fourni', () => {
    const matchs = [{ id: 'm', round: 'SF', position: 0, player1_id: null, player2_id: null, winner_id: null, status: 'scheduled' as const, sets: null }];
    const base = { rounds: ['SF'], matchs, picks: [], stocks: STOCKS, nomJoueur: (x: string) => x };
    expect(construireTableau(base)[0].matchs[0].lignes[0].nom).toBe('BYE');
    expect(construireTableau({ ...base, libelleVide: 'À déterminer' })[0].matchs[0].lignes[0].nom).toBe('À déterminer');
  });
});