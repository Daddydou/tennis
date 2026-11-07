import { describe, expect, it } from 'vitest';
import { indexerCotesParDuel, type CoteHistStat, type JoueurStat } from '../stats/commun';
import {
  abandonsEtForfaits,
  formaterScore,
  formatsDeMatchs,
  matchsRemarquables,
  parPays,
  parcoursLesPlusLongs,
  profilsDeSurface,
  sortieDesFavoris,
  surprises,
  tieBreaks,
} from '../stats/circuit';
import { bookmakersContreElo, comparerSourcesElo, mouvementDesCotes, santeDesImports } from '../stats/marche';
import { fraicheurDe, formaterAge } from '../stats/appli';
import { eloFixe, joueur, match, tournoi } from './statsFixtures';

const t1 = tournoi('T1');
const joueurs = new Map<string, JoueurStat>([
  ['A', joueur('A', { country: 'FRA' })],
  ['B', joueur('B', { country: 'ESP' })],
  ['C', joueur('C', { country: 'FRA' })],
  ['D', joueur('D', { country: 'ESP' })],
]);
const elo = eloFixe({ A: 2000, B: 1800, C: 1900, D: 1700 });

const m1 = match({ round: 'R32', position: 0, player1_id: 'A', player2_id: 'B', winner_id: 'A' });
const m2 = match({
  round: 'R32',
  position: 1,
  player1_id: 'C',
  player2_id: 'D',
  winner_id: 'D',
  sets: [
    { g1: 6, g2: 7 },
    { g1: 6, g2: 3 },
    { g1: 6, g2: 7 },
  ],
});
const m3 = match({
  round: 'QF',
  position: 0,
  player1_id: 'A',
  player2_id: 'D',
  winner_id: 'A',
  sets: [
    { g1: 6, g2: 0 },
    { g1: 6, g2: 0 },
  ],
});
// E n'a ni Elo ni fiche joueur : il sert à tester les trous de données.
const m5 = match({ round: 'F', position: 0, player1_id: 'A', player2_id: 'E', winner_id: 'A' });
const matchs = [m1, m2, m3, m5];

describe('circuit', () => {
  it('formate un score, même vide', () => {
    expect(formaterScore(m2.sets)).toBe('6-7 6-3 6-7');
    expect(formaterScore(null)).toBe('');
  });

  it('surprises : victoires du favori et plus grosse surprise', () => {
    const s = surprises(matchs, [t1], joueurs, elo);
    // m5 est ignoré (E sans Elo).
    expect(s.analyses).toBe(3);
    expect(s.victoiresFavori).toBe(2);
    expect(s.top).toHaveLength(1);
    expect(s.top[0]).toMatchObject({ vainqueur: 'Joueur D', perdant: 'Joueur C', round: 'R32', score: '6-7 6-3 6-7' });
    expect(s.top[0].pVainqueur).toBeLessThan(0.3);
    expect(s.parTour).toEqual([
      { round: 'R32', n: 2, surprises: 1, part: 0.5 },
      { round: 'QF', n: 1, surprises: 0, part: 0 },
    ]);
  });

  it('où tombent les favoris : titre ou étape de sortie', () => {
    const r = sortieDesFavoris(matchs, [t1], joueurs, elo, 2);
    expect(r.lignes).toEqual([
      { tournoi: 'T1', joueur: 'Joueur A', sortie: 'Titre' },
      { tournoi: 'T1', joueur: 'Joueur C', sortie: 'Avant les huitièmes' },
    ]);
    expect(r.nbFavoris).toBe(2);
    expect(r.repartition.map((x) => x.etape)).toEqual(['Avant les huitièmes', 'Titre']);
  });

  it('formats : part des matchs menés au bout des sets', () => {
    const f = formatsDeMatchs(matchs, [t1], (t) => t.surface ?? '?');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ libelle: 'dur', matchs: 4, allesAuBoutDesSets: 1, part: 0.25 });
    expect(f[0].jeuxMoyens).toBeCloseTo((19 + 35 + 12 + 19) / 4);
  });

  it('un abandon est exclu des formats de matchs', () => {
    const retired = match({ status: 'retired', sets: [{ g1: 6, g2: 3 }] });
    expect(formatsDeMatchs([retired], [t1], () => 'x')).toEqual([]);
  });

  it('tie-breaks : compte les sets, et ne classe que ceux qui en ont joué au moins 3', () => {
    const r = tieBreaks(matchs, joueurs);
    expect(r.sets).toBe(9);
    expect(r.tieBreaks).toBe(2);
    expect(r.top).toEqual([]);
  });

  it('abandons et forfaits', () => {
    const r = abandonsEtForfaits(
      [
        match({ status: 'retired', winner_id: 'A', player1_id: 'A', player2_id: 'B' }),
        match({ status: 'walkover', sets: null, player1_id: 'C', player2_id: 'D', winner_id: 'C' }),
        match({}),
      ],
      [t1],
      joueurs,
    );
    expect(r).toMatchObject({ abandons: 1, forfaits: 1 });
    expect(r.parTournoi).toEqual([{ tournoi: 'T1', abandons: 1, forfaits: 1 }]);
    expect(r.parSurface).toEqual([{ surface: 'dur', abandons: 1, forfaits: 1, matchs: 3 }]);
    expect(r.parJoueur.map((j) => j.joueur).sort()).toEqual(['Joueur B', 'Joueur D']);
  });

  it('spécialistes et polyvalents selon l’écart entre surfaces', () => {
    const r = profilsDeSurface(
      matchs,
      joueurs,
      (id) =>
        id === 'A'
          ? { dur: 2000, terre: 1800, gazon: 1900 }
          : id === 'D'
            ? { dur: 1700, terre: 1700, gazon: 1700 }
            : null,
      2,
    );
    expect(r.specialistes[0]).toMatchObject({ joueur: 'Joueur A', ecart: 200, meilleure: 'dur' });
    expect(r.polyvalents[0]).toMatchObject({ joueur: 'Joueur D', ecart: 0 });
  });

  it('victoires et défaites par pays', () => {
    const r = parPays(matchs, joueurs);
    expect(r[0]).toEqual({ pays: 'FRA', victoires: 3, defaites: 1, taux: 0.75 });
    expect(r[1].pays).toBe('ESP');
    expect(r[1].victoires).toBe(1);
    expect(r[1].defaites).toBe(2);
  });

  it('parcours les plus longs : jeux joués sur tout le tournoi', () => {
    const p = parcoursLesPlusLongs(matchs, [t1], joueurs, 2);
    expect(p[0]).toEqual({ tournoi: 'T1', joueur: 'Joueur A', matchs: 3, sets: 6, jeux: 50 });
    expect(p[1].joueur).toBe('Joueur D');
  });

  it('matchs remarquables : marathons, serrés, roues de bicyclette', () => {
    const r = matchsRemarquables(matchs, [t1], joueurs);
    expect(r.marathons[0]).toMatchObject({ vainqueur: 'Joueur D', jeux: 35 });
    expect(r.serres).toHaveLength(1);
    expect(r.roues).toBe(2);
    expect(r.matchsBlancs).toBe(1);
    expect(r.joueursAvecRoues).toEqual([{ joueur: 'Joueur A', n: 2 }]);
  });
});

describe('modèle et marché', () => {
  const cote = (a: string, b: string, pA: number, le: string): CoteHistStat => ({
    tournament_id: 'T1',
    event_id: `${a}${b}`,
    player_a_id: a,
    player_b_id: b,
    proba_a: pA,
    proba_b: 1 - pA,
    capture_le: le,
  });
  const jeu3 = [m1, m2, m3];

  it('compare deux sources d’Elo sur les mêmes matchs seulement', () => {
    const ta = elo;
    // L'Elo maison ne connaît pas D : les matchs de D sont écartés pour les deux sources.
    const maison = eloFixe({ A: 1900, B: 1800, C: 1900 });
    const r = comparerSourcesElo(jeu3, [t1], ta, maison);
    expect(r.communs).toBe(1);
    expect(r.couvertureTa).toBe(3);
    expect(r.couvertureMaison).toBe(1);
    expect(r.ta.precision).toBe(1);
    expect(r.ta.brier).toBeLessThan(r.maison.brier as number);
  });

  it('bookmakers contre Elo : précision et désaccords', () => {
    const cotes = indexerCotesParDuel([
      cote('A', 'B', 0.8, '2026-01-01T10:00:00Z'),
      cote('C', 'D', 0.9, '2026-01-01T10:00:00Z'),
      cote('A', 'D', 0.4, '2026-01-01T10:00:00Z'),
    ]);
    const r = bookmakersContreElo(jeu3, [t1], cotes, elo);
    expect(r.n).toBe(3);
    expect(r.marche.precision).toBeCloseTo(1 / 3);
    expect(r.elo.precision).toBeCloseTo(2 / 3);
    // Seul A-D oppose les deux : le marché donnait D, l'Elo donnait A, et A a gagné.
    expect(r.desaccords).toEqual({ n: 1, marcheJuste: 0, eloJuste: 1 });
  });

  it('mouvement des cotes : vers le vainqueur ou pas', () => {
    const cotes = indexerCotesParDuel([
      cote('A', 'B', 0.6, '2026-01-01T10:00:00Z'),
      cote('A', 'B', 0.8, '2026-01-01T18:00:00Z'),
      cote('C', 'D', 0.7, '2026-01-01T10:00:00Z'),
      cote('C', 'D', 0.9, '2026-01-01T18:00:00Z'),
      cote('A', 'D', 0.3, '2026-01-01T10:00:00Z'),
      cote('A', 'D', 0.6, '2026-01-01T18:00:00Z'),
    ]);
    const r = mouvementDesCotes(jeu3, [t1], cotes);
    expect(r.duels).toBe(3);
    expect(r.versLeVainqueur).toBe(2);
    expect(r.variationMoyenne).toBeCloseTo(0.1);
    expect(r.favorisBattus).toEqual({ n: 2, marcheAvaitReculer: 1 });
    expect(r.plusGrosMouvements[0].variation).toBeCloseTo(0.3);
  });

  it('un duel avec un seul relevé n’a pas de mouvement', () => {
    const cotes = indexerCotesParDuel([cote('A', 'B', 0.6, '2026-01-01T10:00:00Z')]);
    expect(mouvementDesCotes([m1], [t1], cotes).duels).toBe(0);
  });

  it('santé des imports', () => {
    const log = (over: Partial<Parameters<typeof santeDesImports>[0][number]>) => ({
      tournament_id: 'T1',
      source: 'api',
      ok: true,
      matchs_total: 10,
      matchs_changes: 1,
      avertissements: [] as unknown,
      erreur: null as string | null,
      created_at: '2026-01-01T10:00:00Z',
      duree_ms: 100 as number | null,
      ...over,
    });
    const r = santeDesImports(
      [
        log({ avertissements: ['x', 'y'] }),
        log({ duree_ms: 300 }),
        log({ source: 'wta', ok: false, erreur: 'Boom', created_at: '2026-01-02T10:00:00Z', duree_ms: null }),
      ],
      [
        { tournament_id: 'T1', actif: true, echecs_consecutifs: 0, dernier_succes_at: null, arrete_at: null, motif_arret: null },
        { tournament_id: 'T1', actif: false, echecs_consecutifs: 2, dernier_succes_at: null, arrete_at: '2026-01-03T00:00:00Z', motif_arret: 'fini' },
      ],
      [t1],
    );
    expect(r).toMatchObject({ total: 3, ok: 2, avertissements: 2, dureeMoyenneMs: 200 });
    expect(r.tauxOk).toBeCloseTo(2 / 3);
    expect(r.parSource).toEqual([
      { source: 'api', n: 2, ok: 2 },
      { source: 'wta', n: 1, ok: 0 },
    ]);
    expect(r.derniereErreur).toEqual({ tournoi: 'T1', erreur: 'Boom', le: '2026-01-02T10:00:00Z' });
    expect(r.surveillances).toEqual({ actives: 1, arretees: [{ tournoi: 'T1', motif: 'fini' }], enEchec: 1 });
  });
});

describe('fraîcheur des données', () => {
  const maintenant = new Date('2026-01-10T12:00:00Z');

  it('classe selon l’âge de la dernière donnée', () => {
    expect(fraicheurDe('x', null, maintenant).niveau).toBe('vide');
    expect(fraicheurDe('x', '2026-01-10T10:00:00Z', maintenant).niveau).toBe('frais');
    expect(fraicheurDe('x', '2026-01-07T12:00:00Z', maintenant).niveau).toBe('moyen');
    expect(fraicheurDe('x', '2025-12-01T12:00:00Z', maintenant).niveau).toBe('ancien');
  });

  it('une date dans le futur donne un âge de zéro, pas négatif', () => {
    expect(fraicheurDe('x', '2026-01-11T12:00:00Z', maintenant).ageHeures).toBe(0);
  });

  it('âge lisible', () => {
    expect(formaterAge(null)).toBe('—');
    expect(formaterAge(0.4)).toContain('moins');
    expect(formaterAge(5.7)).toBe('il y a 5 h');
    expect(formaterAge(72)).toBe('il y a 3 j');
  });
});
