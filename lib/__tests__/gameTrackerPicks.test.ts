// @vitest-environment node
/**
 * Picks -> Game Tracker : lecture des réponses, traduction de nos picks en
 * positions, construction de l'envoi. Module pur : aucun réseau.
 * Tableau de 16 joueurs, 4 tours (R16, QF, SF, F) ; positions 1-8 = haut.
 */
import { describe, expect, it } from 'vitest';
import type { MatchInterne } from '../bracketExternePont';
import {
  candidatsLienGT,
  ecartsApresEnvoi,
  lireEtatGT,
  lireReponsePostGT,
  lireTournoisPicksGT,
  poolParJoueur,
  positionDeJoueur,
  preparerEnvoi,
  type EtatGT,
  type JoueurPoolGT,
  type ParametresEnvoi,
  type PickLocal,
  type TourOuvertGT,
  type TournoiInterneGT,
  type TournoiPicksGT,
} from '../gameTrackerPicks';

const NOMS = [
  'Alex Adams', 'Ben Baker', 'Carl Clark', 'Dan Davis', 'Eli Evans', 'Finn Foster', 'Gus Green', 'Hal Hughes',
  'Ian Irwin', 'Jon Jones', 'Kai Klein', 'Leo Lewis', 'Max Moore', 'Ned Nash', 'Oli Owens', 'Pat Price',
];
const id = (pos: number) => `p${pos}`;
const noms = new Map(NOMS.map((n, i) => [id(i + 1), n]));
const ROUNDS = ['R16', 'QF', 'SF', 'F'];

const matchs: MatchInterne[] = Array.from({ length: 8 }, (_, m) => ({
  round: 'R16',
  position: m,
  player1Id: id(2 * m + 1),
  player2Id: id(2 * m + 2),
}));

/** Entrée de pool Game Tracker pour la position `pos` (prénom / NOM, comme l'API). */
const joueur = (pos: number, extra: Partial<JoueurPoolGT> = {}): JoueurPoolGT => {
  const [prenom, nom] = NOMS[pos - 1].split(' ');
  return { position: pos, prenom, nom: nom.toUpperCase(), enAttente: false, dejaPicke: false, ...extra };
};

function tourOuvert(extra: Partial<TourOuvertGT> = {}): TourOuvertGT {
  return {
    numero: 1,
    nom: '8ème de finale',
    lockAt: '2026-10-24T09:00:00.000Z',
    picksAttendus: 2,
    pool: { haut: [1, 2, 3, 4, 5, 6, 7, 8].map((p) => joueur(p)), bas: [9, 10, 11, 12, 13, 14, 15, 16].map((p) => joueur(p)) },
    monPick: { haut: null, bas: null, etat: 'manquant' },
    ...extra,
  };
}

function etat(to: TourOuvertGT | null, extra: Partial<EtatGT> = {}): EtatGT {
  return {
    maintenant: '2026-10-23T12:00:00.000Z',
    tournoi: { id: 'gt1', nom: 'Test Open', drawSize: 16, statut: 'ONGOING' },
    tourOuvert: to,
    toursAVenir: [],
    dejaPickes: [],
    classement: [],
    tours: [],
    ...extra,
  };
}

/** Un tour à venir (QF, numéro 2) : tous les joueurs de nos picks QF sont pickables. */
const tourAVenir = (extra: Partial<TourOuvertGT> = {}): TourOuvertGT =>
  tourOuvert({ numero: 2, nom: 'Quart de finale', lockAt: '2026-10-25T09:00:00.000Z', ...extra });

function params(e: EtatGT, picksLocaux: PickLocal[], extra: Partial<ParametresEnvoi> = {}): ParametresEnvoi {
  return { etat: e, rounds: ROUNDS, matchsPremierTour: matchs, noms, picksLocaux, maintenant: new Date('2026-10-23T12:00:00.000Z'), ...extra };
}

const top = (pos: number): PickLocal => ({ round: 'R16', half: 'top', playerId: id(pos) });
const bottom = (pos: number): PickLocal => ({ round: 'R16', half: 'bottom', playerId: id(pos) });

describe('positionDeJoueur', () => {
  it('player1 = position impaire, player2 = paire (match m -> 2m+1 / 2m+2)', () => {
    expect(positionDeJoueur('p1', matchs)).toBe(1);
    expect(positionDeJoueur('p2', matchs)).toBe(2);
    expect(positionDeJoueur('p9', matchs)).toBe(9);
    expect(positionDeJoueur('p16', matchs)).toBe(16);
  });
  it('joueur absent du premier tour : null', () => {
    expect(positionDeJoueur('inconnu', matchs)).toBeNull();
  });
});

describe('preparerEnvoi — cas nominal', () => {
  it('traduit nos deux picks en positions haut / bas', () => {
    const r = preparerEnvoi(params(etat(tourOuvert()), [top(3), bottom(12)]));
    expect(r).toMatchObject({ ok: true, tour: 1, roundLocal: 'R16', haut: 3, bas: 12, dejaAJour: false });
  });

  it('ignore les picks des autres tours', () => {
    const autre: PickLocal = { round: 'QF', half: 'top', playerId: id(1) };
    const r = preparerEnvoi(params(etat(tourOuvert()), [autre, top(3), bottom(12)]));
    expect(r).toMatchObject({ ok: true, haut: 3, bas: 12 });
  });

  it('Game Tracker a déjà ces picks : dejaAJour', () => {
    const mp = { haut: { position: 3, prenom: 'Carl', nom: 'CLARK' }, bas: { position: 12, prenom: 'Leo', nom: 'LEWIS' }, etat: 'complet' };
    const r = preparerEnvoi(params(etat(tourOuvert({ monPick: mp })), [top(3), bottom(12)]));
    expect(r).toMatchObject({ ok: true, dejaAJour: true });
  });

  it('joueur « en attente » : envoyé, mais avec un avertissement de redirection', () => {
    const to = tourOuvert();
    to.pool.haut[2] = joueur(3, { enAttente: true });
    const r = preparerEnvoi(params(etat(to), [top(3), bottom(12)]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.avertissements.join(' ')).toMatch(/redirigera/);
  });
});

describe('preparerEnvoi — ne vide jamais un côté par accident', () => {
  it('un seul côté posé chez nous : l’autre est renvoyé tel que Game Tracker l’a', () => {
    const mp = { haut: null, bas: { position: 14, prenom: 'Ned', nom: 'NASH' }, etat: 'partiel' };
    const r = preparerEnvoi(params(etat(tourOuvert({ monPick: mp })), [top(3)]));
    expect(r).toMatchObject({ ok: true, haut: 3, bas: 14 });
    if (r.ok) expect(r.lignes.find((l) => l.cote === 'bas')?.origine).toBe('conserve');
  });

  it('côté absent chez nous ET chez Game Tracker : null (rien à vider)', () => {
    const r = preparerEnvoi(params(etat(tourOuvert()), [top(3)]));
    expect(r).toMatchObject({ ok: true, haut: 3, bas: null });
  });

  it('aucun pick chez nous pour ce tour : refus (jamais d’envoi pour vider)', () => {
    const r = preparerEnvoi(params(etat(tourOuvert()), []));
    expect(r.ok).toBe(false);
  });
});

describe('preparerEnvoi — refus en bloc', () => {
  const raisons = (r: ReturnType<typeof preparerEnvoi>) => (r.ok ? '' : r.raisons.join(' | '));

  it('aucun tour ouvert', () => {
    expect(raisons(preparerEnvoi(params(etat(null), [top(3)])))).toMatch(/Aucun tour/);
  });

  it('tour verrouillé (lockAt passé)', () => {
    const to = tourOuvert({ lockAt: '2026-10-23T11:00:00.000Z' });
    expect(raisons(preparerEnvoi(params(etat(to), [top(3), bottom(12)])))).toMatch(/verrouillé/);
  });

  it('lockAt inconnu : envoi permis, avec avertissement', () => {
    const r = preparerEnvoi(params(etat(tourOuvert({ lockAt: null })), [top(3), bottom(12)]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.avertissements.join(' ')).toMatch(/verrouillage/);
  });

  it('joueur hors du pool du tour', () => {
    const to = tourOuvert();
    to.pool.haut = to.pool.haut.filter((j) => j.position !== 3);
    expect(raisons(preparerEnvoi(params(etat(to), [top(3), bottom(12)])))).toMatch(/pas dans ton pool/);
  });

  it('joueur déjà pické chez Game Tracker à un autre tour (liste dejaPickes)', () => {
    const to = tourOuvert();
    to.pool.haut = to.pool.haut.filter((j) => j.position !== 3);
    const e = etat(to, { dejaPickes: [{ position: 3, prenom: 'Carl', nom: 'CLARK' }] });
    expect(raisons(preparerEnvoi(params(e, [top(3), bottom(12)])))).toMatch(/déjà pické chez Game Tracker/);
  });

  it('dejaPicke dans le pool : refusé avant l’envoi', () => {
    const to = tourOuvert();
    to.pool.bas[3] = joueur(12, { dejaPicke: true });
    expect(raisons(preparerEnvoi(params(etat(to), [top(3), bottom(12)])))).toMatch(/serait refusé/);
  });

  it('même position, autre nom : tableaux non superposables, rien n’est envoyé', () => {
    const to = tourOuvert();
    to.pool.haut[2] = { ...joueur(3), prenom: 'Zed', nom: 'ZIMMER' };
    expect(raisons(preparerEnvoi(params(etat(to), [top(3), bottom(12)])))).toMatch(/non superposables/);
  });

  it('pick « haut » situé dans le bas du tableau', () => {
    expect(raisons(preparerEnvoi(params(etat(tourOuvert()), [top(12), bottom(13)])))).toMatch(/pas dans le haut/);
  });

  it('joueur introuvable au premier tour', () => {
    const faux: PickLocal = { round: 'R16', half: 'top', playerId: 'fantome' };
    expect(raisons(preparerEnvoi(params(etat(tourOuvert()), [faux, bottom(12)])))).toMatch(/introuvable/);
  });

  it('tableau de Game Tracker plus grand que le nôtre', () => {
    const e = etat(tourOuvert(), { tournoi: { id: 'gt1', nom: 'Test Open', drawSize: 64, statut: 'ONGOING' } });
    expect(preparerEnvoi(params(e, [top(3)])).ok).toBe(false);
  });
});

describe('preparerEnvoi — demi-finale et finale (un seul pick, dans « haut »)', () => {
  const sf: PickLocal = { round: 'SF', half: null, playerId: id(12) };
  const toSF = (extra: Partial<TourOuvertGT> = {}): TourOuvertGT => ({
    numero: 3,
    nom: 'Demi-finale',
    lockAt: '2026-10-25T09:00:00.000Z',
    picksAttendus: 1,
    pool: { haut: [joueur(5), joueur(12)], bas: [] },
    monPick: { haut: null, bas: null, etat: 'manquant' },
    ...extra,
  });

  it('le pick va dans haut, quelle que soit la moitié ; bas = null', () => {
    const r = preparerEnvoi(params(etat(toSF()), [sf]));
    expect(r).toMatchObject({ ok: true, tour: 3, roundLocal: 'SF', haut: 12, bas: null });
    if (r.ok) expect(r.lignes).toHaveLength(1);
  });

  it('déjà à jour', () => {
    const mp = { haut: { position: 12, prenom: 'Leo', nom: 'LEWIS' }, bas: null, etat: 'complet' };
    expect(preparerEnvoi(params(etat(toSF({ monPick: mp })), [sf]))).toMatchObject({ ok: true, dejaAJour: true });
  });
});

describe('picks à l’avance (tours à venir)', () => {
  const qf = (half: 'top' | 'bottom', pos: number): PickLocal => ({ round: 'QF', half, playerId: id(pos) });
  const avecAVenir = (extra: Partial<TourOuvertGT> = {}) => etat(tourOuvert(), { toursAVenir: [tourAVenir(extra)] });

  it('par défaut on vise toujours le tour ouvert', () => {
    const r = preparerEnvoi(params(avecAVenir(), [top(3), bottom(12), qf('top', 5)]));
    expect(r).toMatchObject({ ok: true, tour: 1, roundLocal: 'R16', haut: 3, bas: 12 });
  });

  it('tourCible : prépare l’envoi d’un tour à venir avec NOS picks de ce tour', () => {
    const r = preparerEnvoi(params(avecAVenir(), [top(3), qf('top', 5), qf('bottom', 14)], { tourCible: 2 }));
    expect(r).toMatchObject({ ok: true, tour: 2, roundLocal: 'QF', haut: 5, bas: 14, dejaAJour: false });
  });

  it('pick partiel sur un tour à venir : un seul côté, l’autre reste tel que chez Game Tracker', () => {
    const mp = { haut: null, bas: { position: 14, prenom: 'Ned', nom: 'NASH' }, etat: 'partiel' };
    const r = preparerEnvoi(params(avecAVenir({ monPick: mp }), [qf('top', 5)], { tourCible: 2 }));
    expect(r).toMatchObject({ ok: true, haut: 5, bas: 14 });
  });

  it('aucun pick local pour ce tour à venir : message simple, pas « tableau pas importé »', () => {
    const r = preparerEnvoi(params(avecAVenir(), [top(3)], { tourCible: 2 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raisons.join(' ')).toMatch(/Aucun pick posé chez nous pour ce tour \(QF\)/);
  });

  it('tour à venir verrouillé : refus', () => {
    const e = avecAVenir({ lockAt: '2026-10-23T11:00:00.000Z' });
    const r = preparerEnvoi(params(e, [qf('top', 5)], { tourCible: 2 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raisons.join(' ')).toMatch(/verrouillé/);
  });

  it('tour inconnu de Game Tracker : refus clair', () => {
    const r = preparerEnvoi(params(avecAVenir(), [qf('top', 5)], { tourCible: 3 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raisons.join(' ')).toMatch(/Le tour 3 n’est pas/);
  });

  it('un joueur déjà pické à un autre tour reste refusé sur un tour à venir', () => {
    const to = tourAVenir();
    to.pool.haut[4] = joueur(5, { dejaPicke: true });
    const r = preparerEnvoi(params(etat(tourOuvert(), { toursAVenir: [to] }), [qf('top', 5)], { tourCible: 2 }));
    expect(r.ok).toBe(false);
  });
});

describe('lecture : toursAVenir et rang du classement', () => {
  const base = { maintenant: 'x', tournoi: { id: 'a', nom: 'b', drawSize: 16, statut: 'ONGOING' } };
  const brut = (n: number) => ({
    numero: n,
    nom: 'Tour ' + n,
    lockAt: '2026-10-25T09:00:00.000Z',
    picksAttendus: 2,
    pool: { haut: [{ position: 1, prenom: 'Alex', nom: 'ADAMS' }], bas: [] },
    monPick: { haut: { joueur: { position: 1, prenom: 'Alex', nom: 'ADAMS' } }, bas: null, etat: 'partiel' },
  });

  it('lit toursAVenir au même format que tourOuvert', () => {
    const e = lireEtatGT({ ...base, tourOuvert: brut(1), toursAVenir: [brut(2), brut(3)] });
    expect(e.toursAVenir.map((t) => t.numero)).toEqual([2, 3]);
    expect(e.toursAVenir[0].monPick.haut?.position).toBe(1);
    expect(e.toursAVenir[0].monPick.etat).toBe('partiel');
  });

  it('sans toursAVenir (ancienne réponse) : liste vide', () => {
    expect(lireEtatGT({ ...base, tourOuvert: null }).toursAVenir).toEqual([]);
  });

  it('classement : rang repris (ex æquo 1, 1, 3), null s’il manque', () => {
    const e = lireEtatGT({
      ...base,
      classement: [
        { pseudo: 'a', moi: true, points: 10, rang: 1 },
        { pseudo: 'b', moi: false, points: 10, rang: 1 },
        { pseudo: 'c', moi: false, points: 4, rang: 3 },
        { pseudo: 'd', moi: false, points: 1 },
      ],
    });
    expect(e.classement.map((c) => c.rang)).toEqual([1, 1, 3, null]);
  });
});

describe('ecartsApresEnvoi', () => {
  const pick = (position: number) => ({ position, prenom: null, nom: null });
  it('identique : aucun écart', () => {
    expect(ecartsApresEnvoi({ haut: 3, bas: 12 }, { haut: pick(3), bas: pick(12) }, false)).toEqual([]);
  });
  it('redirigé ou vidé par Game Tracker : écart signalé', () => {
    expect(ecartsApresEnvoi({ haut: 3, bas: 12 }, { haut: pick(4), bas: null }, false)).toEqual([
      { cote: 'haut', envoye: 3, reel: 4 },
      { cote: 'bas', envoye: 12, reel: null },
    ]);
  });
  it('un seul pick : le bas n’est pas comparé', () => {
    expect(ecartsApresEnvoi({ haut: 12, bas: null }, { haut: pick(12), bas: pick(3) }, true)).toEqual([]);
  });
});

describe('lecture des réponses', () => {
  it('GET ?tournoi= (exemple de la doc)', () => {
    const e = lireEtatGT({
      jeu: 'tennis-picks',
      maintenant: '2026-10-22T18:00:00.000Z',
      tournoi: { id: 'cmv', nom: 'Vieil ATP 250 Lyon', tour: 'ATP', annee: 2026, type: 'ATP250', surface: 'INDOOR_HARD', drawSize: 32, statut: 'ONGOING' },
      tourOuvert: {
        numero: 3,
        nom: 'Quarts de finale',
        lockAt: null,
        picksAttendus: 2,
        pool: {
          haut: [{ position: 1, prenom: 'Flavio', nom: 'COBOLLI', tete: 1, statut: null, enAttente: true, adversaires: [], dejaPicke: false }],
          bas: [],
        },
        monPick: { haut: null, bas: null, etat: 'manquant' },
      },
      dejaPickes: [{ position: 16, prenom: 'Lorenzo', nom: 'MUSETTI' }],
      tours: [],
      classement: [{ userId: 'u', pseudo: 'Laki', moi: false, points: 43 }],
    });
    expect(e.tourOuvert?.numero).toBe(3);
    expect(e.tourOuvert?.pool.haut[0]).toMatchObject({ position: 1, enAttente: true, dejaPicke: false });
    expect(e.dejaPickes[0].position).toBe(16);
    expect(e.classement[0]).toEqual({ pseudo: 'Laki', moi: false, points: 43, rang: null });
  });

  it('tourOuvert null accepté', () => {
    const e = lireEtatGT({ maintenant: 'x', tournoi: { id: 'a', nom: 'b', drawSize: 32, statut: 'ONGOING' }, tourOuvert: null });
    expect(e.tourOuvert).toBeNull();
  });

  it('forme inattendue : erreur claire avec le chemin', () => {
    expect(() => lireEtatGT({ maintenant: 'x', tournoi: { id: 'a', nom: 'b', drawSize: 'grand', statut: 's' } })).toThrow(/\$\.tournoi\.drawSize/);
  });

  it('GET /tournois', () => {
    const t = lireTournoisPicksGT({
      jeu: 'tennis-picks',
      count: 1,
      tournois: [{ id: 'a', nom: 'Lyon', tour: 'ATP', annee: 2026, type: 'ATP250', drawSize: 32, statut: 'ONGOING', tourOuvert: { numero: 3, nom: 'Quarts', lockAt: null } }],
    });
    expect(t[0]).toMatchObject({ id: 'a', tourOuvert: { numero: 3, lockAt: null } });
  });

  it('POST 200 et refus', () => {
    const ok = lireReponsePostGT({ jeu: 'tennis-picks', enregistre: true, tour: 3, monPick: { haut: { position: 9, prenom: 'V', nom: 'W' }, bas: { position: 27, prenom: 'D', nom: 'A' } } });
    expect(ok).toMatchObject({ enregistre: true, tour: 3, monPick: { haut: { position: 9 }, bas: { position: 27 } } });
    const ko = lireReponsePostGT({ jeu: 'tennis-picks', enregistre: false, erreur: 'Ce tour est verrouillé' });
    expect(ko).toMatchObject({ enregistre: false, erreur: 'Ce tour est verrouillé', monPick: null });
  });
});

describe('candidatsLienGT (relier un tournoi absent de l’API bracket)', () => {
  const lyon: TournoiInterneGT = { name: 'Lyon 2026', tour: 'ATP', year: 2026, drawSize: 32 };
  const gt = (id: string, nom: string, extra: Partial<TournoiPicksGT> = {}): TournoiPicksGT => ({
    id, nom, tour: 'ATP', annee: 2026, drawSize: 32, statut: 'ONGOING', tourOuvert: null, ...extra,
  });

  it('propose en premier celui dont le nom contient la ville', () => {
    const r = candidatsLienGT(lyon, [gt('a', 'ATP 250 Almaty'), gt('b', 'Vieil ATP 250 Lyon')]);
    expect(r.map((c) => c.id)).toEqual(['b', 'a']);
    expect(r[0].suggere).toBe(true);
    expect(r[1].suggere).toBe(false);
  });

  it('écarte un autre circuit, une autre année, une autre taille de tableau', () => {
    const r = candidatsLienGT(lyon, [
      gt('wta', 'WTA Lyon', { tour: 'WTA' }),
      gt('vieux', 'ATP Lyon 2025', { annee: 2025 }),
      gt('gros', 'ATP Lyon 128', { drawSize: 128 }),
      gt('ok', 'ATP Lyon'),
    ]);
    expect(r.map((c) => c.id)).toEqual(['ok']);
  });

  it('insensible aux accents et à la casse', () => {
    const r = candidatsLienGT({ ...lyon, name: 'Lyon 2026' }, [gt('b', 'Open de LYON')]);
    expect(r[0].suggere).toBe(true);
    const e = candidatsLienGT({ name: 'Genève 2026', tour: 'atp', year: 2026, drawSize: 32 }, [gt('g', 'ATP 250 Geneve')]);
    expect(e[0].suggere).toBe(true);
  });

  it('année ou taille inconnues chez nous : pas de filtre sur ce critère', () => {
    const r = candidatsLienGT({ name: 'Lyon 2026', tour: 'ATP', year: null, drawSize: null }, [gt('x', 'ATP Lyon', { annee: 2030, drawSize: 64 })]);
    expect(r).toHaveLength(1);
  });

  it('aucune correspondance : liste vide', () => {
    expect(candidatsLienGT(lyon, [])).toEqual([]);
  });
});
describe('poolParJoueur (repères « hors pool » sur l’écran picks)', () => {
  it('traduit le pool Game Tracker en player_id internes, avec ses drapeaux', () => {
    const to = tourOuvert();
    to.pool.haut = [joueur(3, { enAttente: true }), joueur(5)];
    to.pool.bas = [joueur(12, { dejaPicke: true })];
    const r = poolParJoueur(etat(to), ROUNDS, matchs);
    expect(r?.roundLocal).toBe('R16');
    expect(r?.parJoueur).toEqual({
      p3: { enAttente: true, dejaPicke: false },
      p5: { enAttente: false, dejaPicke: false },
      p12: { enAttente: false, dejaPicke: true },
    });
    // Un joueur hors du pool n'y figure pas : c'est ce qui le fait signaler.
    expect(r?.parJoueur.p1).toBeUndefined();
  });

  it('aucun tour ouvert : null', () => {
    expect(poolParJoueur(etat(null), ROUNDS, matchs)).toBeNull();
  });

  it('demi-finale : le tour local suit la correspondance des tours', () => {
    const to = tourOuvert({ numero: 3, nom: 'Demi-finale', picksAttendus: 1 });
    to.pool = { haut: [joueur(5), joueur(12)], bas: [] };
    expect(poolParJoueur(etat(to), ROUNDS, matchs)?.roundLocal).toBe('SF');
  });

  it('tableaux non superposables : null', () => {
    const e = etat(tourOuvert(), { tournoi: { id: 'gt1', nom: 'X', drawSize: 64, statut: 'ONGOING' } });
    expect(poolParJoueur(e, ROUNDS, matchs)).toBeNull();
  });
});