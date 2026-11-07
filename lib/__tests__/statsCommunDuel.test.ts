import { describe, expect, it } from 'vitest';
import {
  cleDuelCotes,
  comparerTours,
  correlation,
  ecartType,
  indexerCotesParDuel,
  jeuxDuMatch,
  matchDecide,
  matchJoue,
  moyenne,
  part,
  perdantDe,
  probaMarche,
  type CoteHistStat,
  type PointsTournoiStat,
  type StockStat,
} from '../stats/commun';
import { match, pick, tournoi } from './statsFixtures';
import { cumuls, matriceDesDuels, picksParTour, repartition, resumeParStock, tableauDuel } from '../stats/duel';

describe('petits outils', () => {
  it('moyenne, écart-type et part gèrent les cas vides', () => {
    expect(moyenne([])).toBeNull();
    expect(moyenne([1, 2, 3])).toBe(2);
    expect(ecartType([5])).toBeNull();
    expect(ecartType([2, 4])).toBe(1);
    expect(part(1, 0)).toBeNull();
    expect(part(1, 4)).toBe(0.25);
  });

  it('la corrélation est de 1 sur une droite, null si rien à mesurer', () => {
    expect(correlation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
    expect(correlation([1, 2, 3], [5, 5, 5])).toBeNull();
    expect(correlation([1, 2], [1, 2])).toBeNull();
  });

  it('les tours de poules passent avant les tableaux finaux', () => {
    const tries = ['F', 'QF', 'J3', 'R128', 'J1', 'J2'].sort(comparerTours);
    expect(tries).toEqual(['J1', 'J2', 'J3', 'R128', 'QF', 'F']);
  });
});

describe('matchs', () => {
  it('décidé / joué / perdant', () => {
    const m = match();
    expect(matchDecide(m)).toBe(true);
    expect(matchJoue(m)).toBe(true);
    expect(perdantDe(m)).toBe('B');
    expect(perdantDe(match({ winner_id: 'B' }))).toBe('A');
  });

  it('un bye ou un match sans vainqueur ne compte pas', () => {
    expect(matchDecide(match({ status: 'bye' }))).toBe(false);
    expect(matchDecide(match({ winner_id: null }))).toBe(false);
    expect(perdantDe(match({ winner_id: null }))).toBeNull();
  });

  it('un forfait est décidé mais pas joué (aucun set)', () => {
    const m = match({ status: 'walkover', sets: null });
    expect(matchDecide(m)).toBe(true);
    expect(matchJoue(m)).toBe(false);
  });

  it('compte les jeux de chaque côté', () => {
    expect(jeuxDuMatch(match())).toEqual({ j1: 12, j2: 7 });
  });
});

describe('cotes', () => {
  const ligne = (over: Partial<CoteHistStat>): CoteHistStat => ({
    tournament_id: 'T1',
    event_id: 'e1',
    player_a_id: 'A',
    player_b_id: 'B',
    proba_a: 0.6,
    proba_b: 0.4,
    capture_le: '2026-01-01T10:00:00Z',
    ...over,
  });

  it('la clé de duel ne dépend pas de l’ordre des joueurs', () => {
    expect(cleDuelCotes('T1', 'A', 'B')).toBe(cleDuelCotes('T1', 'B', 'A'));
  });

  it('garde le premier et le dernier relevé, même si le côté change', () => {
    const idx = indexerCotesParDuel([
      ligne({ capture_le: '2026-01-02T10:00:00Z', player_a_id: 'B', player_b_id: 'A', proba_a: 0.3 }),
      ligne({ capture_le: '2026-01-01T10:00:00Z', proba_a: 0.6 }),
    ]);
    const d = idx.get(cleDuelCotes('T1', 'A', 'B'));
    expect(d?.nbCaptures).toBe(2);
    expect(d?.premier.pA).toBeCloseTo(0.6);
    // Dernier relevé : B à 0.3, donc A à 0.7.
    expect(d?.dernier.pA).toBeCloseTo(0.7);
  });

  it('ignore les relevés sans probabilité', () => {
    expect(indexerCotesParDuel([ligne({ proba_a: null })]).size).toBe(0);
  });

  it('probaMarche renvoie la probabilité du joueur demandé', () => {
    const idx = indexerCotesParDuel([ligne({})]);
    expect(probaMarche(idx, 'T1', 'A', 'B')).toBeCloseTo(0.6);
    expect(probaMarche(idx, 'T1', 'B', 'A')).toBeCloseTo(0.4);
    expect(probaMarche(idx, 'T1', 'A', 'Z')).toBeNull();
  });
});

describe('duel entre stocks', () => {
  const moi: StockStat = { id: null, nom: 'Moi' };
  const laki: StockStat = { id: 'laki', nom: 'Laki' };
  const tournois = [
    tournoi('T2', { start_date: '2026-02-01', surface: 'terre' }),
    tournoi('T1', { start_date: '2026-01-01' }),
    tournoi('T3', { start_date: '2026-03-01' }),
  ];
  const lignes: PointsTournoiStat[] = [
    { tournoiId: 'T1', stockId: null, picks: 50, bracket: 10 },
    { tournoiId: 'T1', stockId: 'laki', picks: 40, bracket: null },
    { tournoiId: 'T2', stockId: null, picks: 20, bracket: 0 },
    { tournoiId: 'T2', stockId: 'laki', picks: 30, bracket: 0 },
    // T3 : Moi seul, donc aucun vainqueur désigné.
    { tournoiId: 'T3', stockId: null, picks: 15, bracket: null },
  ];
  const tableau = tableauDuel(tournois, lignes);

  it('trie par date et désigne le vainqueur de chaque tournoi', () => {
    expect(tableau.map((l) => l.tournoi.id)).toEqual(['T1', 'T2', 'T3']);
    expect(tableau[0].gagnants).toEqual(['moi']);
    expect(tableau[1].gagnants).toEqual(['laki']);
    expect(tableau[2].gagnants).toEqual([]);
    expect(tableau[0].totaux).toEqual({ moi: 60, laki: 40 });
  });

  it('une égalité donne deux vainqueurs', () => {
    const t = tableauDuel(
      [tournoi('E')],
      [
        { tournoiId: 'E', stockId: null, picks: 10, bracket: null },
        { tournoiId: 'E', stockId: 'laki', picks: 10, bracket: null },
      ],
    );
    expect(t[0].gagnants.sort()).toEqual(['laki', 'moi']);
  });

  it('résume chaque stock', () => {
    const [r, l] = resumeParStock(tableau, [moi, laki]);
    expect(r.total).toBe(95);
    expect(r.nbTournois).toBe(3);
    expect(r.victoires).toBe(1);
    expect(r.meilleur).toEqual({ tournoi: 'T1', points: 60 });
    expect(r.pire).toEqual({ tournoi: 'T3', points: 15 });
    // Écart au vainqueur : seulement sur T1 (0) et T2 (30 - 20 = 10).
    expect(r.ecartMoyenAuVainqueur).toBe(5);
    expect(l.total).toBe(70);
    expect(l.nbTournois).toBe(2);
    expect(l.victoires).toBe(1);
  });

  it('cumule les points et étiquette avec le circuit', () => {
    const c = cumuls(tableau, [moi, laki]);
    expect(c.etiquettes[0]).toBe('T1 (ATP)');
    expect(c.series[0].valeurs).toEqual([60, 80, 95]);
    expect(c.series[1].valeurs).toEqual([40, 70, 70]);
  });

  it('regroupe par surface', () => {
    const g = repartition(tableau, [moi, laki], (t) => t.surface ?? '?');
    const terre = g.find((x) => x.libelle === 'terre');
    expect(terre?.nbTournois).toBe(1);
    expect(terre?.parStock.laki.total).toBe(30);
  });

  it('la matrice ne compare que les tournois joués par les deux', () => {
    const [duel] = matriceDesDuels(tableau, [moi, laki]);
    expect(duel.communs).toBe(2);
    expect(duel.victoiresA).toBe(1);
    expect(duel.victoiresB).toBe(1);
    expect(duel.egalites).toBe(0);
  });

  it('points des picks par tour, dans l’ordre du tournoi', () => {
    const r = picksParTour([pick({ round: 'F', points: 30 }), pick({ round: 'R16', points: 10 }), pick({ round: 'R16', points: 20 })], [moi], comparerTours);
    expect(r.map((x) => x.round)).toEqual(['R16', 'F']);
    expect(r[0].parStock.moi).toEqual({ nb: 2, points: 30, moyenne: 15 });
  });
});
