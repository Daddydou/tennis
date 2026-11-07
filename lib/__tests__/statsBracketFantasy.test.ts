import { describe, expect, it } from 'vitest';
import { indexerCotesParDuel, type StockStat } from '../stats/commun';
import {
  audaceDuBracket,
  bracketContreCotes,
  championsEtFinalistes,
  consensusDuGroupe,
  ecartsBracketExterne,
  precisionParTour,
} from '../stats/bracket';
import {
  bilanPrevuReel,
  calibrationFantasy,
  equipeAvantApres,
  impactSansElo,
  lignesFantasy,
  type HistoFantasyStat,
} from '../stats/fantasy';
import { bracketPick, eloFixe, match, tournoi } from './statsFixtures';

const moi: StockStat = { id: null, nom: 'Moi' };
const laki: StockStat = { id: 'laki', nom: 'Laki' };
const thomas: StockStat = { id: 'thomas', nom: 'Thomas' };

const t1 = tournoi('T1', { rounds: ['R16', 'QF', 'SF', 'F'] });
const matchs = [
  match({ round: 'SF', position: 0, player1_id: 'A', player2_id: 'B', winner_id: 'A' }),
  match({ round: 'SF', position: 1, player1_id: 'C', player2_id: 'D', winner_id: 'C' }),
  match({ round: 'F', position: 0, player1_id: 'A', player2_id: 'C', winner_id: 'A' }),
  match({ round: 'QF', position: 1, player1_id: 'Y', player2_id: 'Z', winner_id: 'Y' }),
];
const elo = eloFixe({ A: 2000, B: 1800, C: 1900, D: 1700, Y: 1700, Z: 1900 });

const bps = [
  bracketPick({ participant_id: null, round: 'F', position: 0, player_id: 'A' }),
  bracketPick({ participant_id: null, round: 'SF', position: 0, player_id: 'A' }),
  bracketPick({ participant_id: null, round: 'SF', position: 1, player_id: 'D' }),
  bracketPick({ participant_id: 'laki', round: 'F', position: 0, player_id: 'C' }),
  bracketPick({ participant_id: 'laki', round: 'SF', position: 0, player_id: 'B' }),
  bracketPick({ participant_id: 'laki', round: 'SF', position: 1, player_id: 'C' }),
  bracketPick({ participant_id: 'laki', round: 'QF', position: 1, player_id: 'Y' }),
  // Pas encore joué : ne compte nulle part.
  bracketPick({ participant_id: null, round: 'QF', position: 9, player_id: 'Q' }),
];

describe('bracket', () => {
  it('précision par tour, picks non joués exclus', () => {
    const { total, parTour } = precisionParTour(bps, matchs, [moi, laki]);
    expect(total.moi).toEqual({ n: 3, justes: 2, taux: 2 / 3 });
    expect(total.laki).toEqual({ n: 4, justes: 2, taux: 0.5 });
    expect(parTour.map((t) => t.round)).toEqual(['QF', 'SF', 'F']);
  });

  it('champion et finalistes trouvés', () => {
    const [m, l] = championsEtFinalistes(bps, matchs, [t1], [moi, laki]);
    expect(m.champions).toEqual({ evalues: 1, trouves: 1 });
    expect(l.champions).toEqual({ evalues: 1, trouves: 0 });
    // Finale réelle A-C : Moi annonce A et D (1 sur 2), Laki annonce B et C (1 sur 2).
    expect(m.finalistes).toEqual({ evalues: 1, trouves: 1, parfaits: 0 });
    expect(l.finalistes).toEqual({ evalues: 1, trouves: 1, parfaits: 0 });
  });

  it('audace : favoris, outsiders et points gagnés grâce aux outsiders', () => {
    const [m, l] = audaceDuBracket(bps, matchs, [t1], [moi, laki], elo);
    expect(m).toMatchObject({ evaluables: 3, favoris: 2, favorisJustes: 2, outsiders: 1, outsidersJustes: 0 });
    // Laki : C et B perdent en outsiders, Y gagne en outsider au QF (2^1 = 2 points).
    expect(l).toMatchObject({ outsiders: 3, outsidersJustes: 1, favoris: 1, favorisJustes: 1, pointsViaOutsiders: 2 });
  });

  it('bracket contre cotes : le favori du marché a-t-il gagné ?', () => {
    const cotes = indexerCotesParDuel([
      {
        tournament_id: 'T1',
        event_id: 'e1',
        player_a_id: 'A',
        player_b_id: 'B',
        proba_a: 0.7,
        proba_b: 0.3,
        capture_le: '2026-01-01T10:00:00Z',
      },
    ]);
    const [m, l] = bracketContreCotes(bps, matchs, cotes, [moi, laki]);
    expect(m).toEqual({ cle: 'moi', nom: 'Moi', n: 1, justes: 1, favoriMarcheJustes: 1 });
    expect(l).toEqual({ cle: 'laki', nom: 'Laki', n: 1, justes: 0, favoriMarcheJustes: 1 });
  });

  it('consensus du groupe : unanimité, 2 contre 1, seul contre tous', () => {
    const votes = [
      bracketPick({ participant_id: null, round: 'SF', position: 0, player_id: 'A' }),
      bracketPick({ participant_id: 'laki', round: 'SF', position: 0, player_id: 'B' }),
      bracketPick({ participant_id: 'thomas', round: 'SF', position: 0, player_id: 'A' }),
      bracketPick({ participant_id: null, round: 'SF', position: 1, player_id: 'C' }),
      bracketPick({ participant_id: 'laki', round: 'SF', position: 1, player_id: 'C' }),
      bracketPick({ participant_id: 'thomas', round: 'SF', position: 1, player_id: 'C' }),
    ];
    const c = consensusDuGroupe(votes, matchs, [moi, laki, thomas]);
    expect(c.unanimes).toEqual({ n: 1, justes: 1 });
    expect(c.deuxContreUn).toEqual({ n: 1, majoriteJuste: 1 });
    expect(c.seul.laki).toEqual({ nom: 'Laki', n: 1, justes: 0 });
  });

  it('écarts avec les points de Thomas', () => {
    const r = ecartsBracketExterne(
      [
        { tournoi_id: 'x1', pseudo: 'a', rempli: true, points_totaux_thomas: 50, points_totaux_calcule: 50 },
        { tournoi_id: 'x1', pseudo: 'b', rempli: true, points_totaux_thomas: 40, points_totaux_calcule: 46 },
        { tournoi_id: 'x1', pseudo: 'c', rempli: false, points_totaux_thomas: 10, points_totaux_calcule: 0 },
        { tournoi_id: 'x1', pseudo: 'd', rempli: true, points_totaux_thomas: null, points_totaux_calcule: 5 },
      ],
      [{ id: 'x1', nom: 'Bâle', tournament_id_interne: null }],
    );
    expect(r.compares).toBe(2);
    expect(r.identiques).toBe(1);
    expect(r.lignes).toEqual([{ tournoi: 'Bâle', pseudo: 'b', thomas: 40, calcule: 46, ecart: 6 }]);
  });
});

describe('fantasy', () => {
  const tournois = [
    tournoi('F1', { start_date: '2026-01-01' }),
    tournoi('F2', { start_date: '2026-02-01' }),
    tournoi('F3', { start_date: '2026-03-01' }),
    tournoi('F4', { start_date: '2026-04-01' }),
  ];
  const histo: HistoFantasyStat[] = [
    { tournament_id: 'F3', e_predit: 300, score_reel: 270, termine: true, e_predit_anterieur: 290, score_reel_anterieur: 270, joueurs_sans_elo: 0 },
    { tournament_id: 'F1', e_predit: 100, score_reel: 80, termine: true, e_predit_anterieur: 90, score_reel_anterieur: 70, joueurs_sans_elo: 0 },
    { tournament_id: 'F2', e_predit: 200, score_reel: 220, termine: true, e_predit_anterieur: null, score_reel_anterieur: null, joueurs_sans_elo: 1 },
    // Tournoi pas fini, tournoi inconnu, pas de score : écartés.
    { tournament_id: 'F4', e_predit: 50, score_reel: 10, termine: false, e_predit_anterieur: null, score_reel_anterieur: null, joueurs_sans_elo: 0 },
    { tournament_id: 'inconnu', e_predit: 50, score_reel: 10, termine: true, e_predit_anterieur: null, score_reel_anterieur: null, joueurs_sans_elo: 0 },
  ];
  const lignes = lignesFantasy(histo, tournois);

  it('ne garde que les tournois terminés, dans l’ordre du calendrier', () => {
    expect(lignes.map((l) => l.tournoi.id)).toEqual(['F1', 'F2', 'F3']);
    expect(lignes.map((l) => l.ecart)).toEqual([-20, 20, -30]);
  });

  it('bilan prévu contre réel : le biais négatif veut dire qu’on surestime', () => {
    const b = bilanPrevuReel(lignes);
    expect(b.n).toBe(3);
    expect(b.erreurMoyenne).toBeCloseTo(70 / 3);
    expect(b.biais).toBeCloseTo(-10);
    expect(b.partAuDessus).toBeCloseTo(1 / 3);
    expect(b.totalPredit).toBe(600);
    expect(b.totalReel).toBe(570);
    expect(b.correlation).toBeGreaterThan(0.9);
  });

  it('calibration en trois tranches, et rien sous 3 tournois', () => {
    const c = calibrationFantasy(lignes);
    expect(c.map((t) => t.predit)).toEqual([100, 200, 300]);
    expect(c.map((t) => t.reel)).toEqual([80, 220, 270]);
    expect(calibrationFantasy(lignes.slice(0, 2))).toEqual([]);
  });

  it('impact des joueurs sans Elo', () => {
    const [tous, certains] = impactSansElo(lignes);
    expect(tous).toMatchObject({ n: 2, biais: -25 });
    expect(tous.erreurMoyenne).toBe(25);
    expect(certains).toMatchObject({ n: 1, biais: 20 });
  });

  it('équipe d’après contre équipe d’avant', () => {
    expect(equipeAvantApres(lignes)).toEqual({ n: 2, meilleureApres: 1, moinsBonneApres: 0, egales: 1, gainMoyen: 5 });
  });
});
