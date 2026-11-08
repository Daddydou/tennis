// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { EtatGT } from '../gameTrackerPicks';
import type { MatchApi } from '../extract/matchstat';
import { appairerRemplacements, moitieParAdversaires, nomsDeApi, nomsDeGameTracker, type JoueuseTournoi } from '../mastersRemplacement';

const abs = (id: string, name: string, moitie: 'top' | 'bottom' | null = 'top', aJoue = false): JoueuseTournoi => ({ id, name, moitie, aJoue });
const ent = (prenom: string, nom: string, moitie: 'top' | 'bottom' | null = null) => ({ prenom, nom, moitie });

describe('appairerRemplacements', () => {
  it('une absente et une entrante : association directe, même sans poule', () => {
    const r = appairerRemplacements([abs('1', 'E. Rybakina', null)], [ent('Marta', 'Kostyuk')]);
    expect(r.erreurs).toEqual([]);
    expect(r.remplacements).toHaveLength(1);
    expect(r.remplacements[0].absenteId).toBe('1');
  });

  it('aucune entrante : rien à faire', () => {
    expect(appairerRemplacements([abs('1', 'E. Rybakina')], [])).toEqual({ remplacements: [], erreurs: [] });
  });

  it('une entrante mais aucune absente : erreur claire, rien associé', () => {
    const r = appairerRemplacements([], [ent('Marta', 'Kostyuk')]);
    expect(r.remplacements).toEqual([]);
    expect(r.erreurs[0]).toContain('Kostyuk');
    expect(r.erreurs[0]).toContain('Rien n\'a été écrit');
  });

  it('une absente qui a déjà joué n\'est jamais remplacée', () => {
    const r = appairerRemplacements([abs('1', 'E. Rybakina', 'top', true)], [ent('Marta', 'Kostyuk')]);
    expect(r.remplacements).toEqual([]);
    expect(r.erreurs[0]).toContain('a déjà joué');
  });

  it('deux absentes, deux entrantes : appariées par poule', () => {
    const r = appairerRemplacements(
      [abs('1', 'A. Un', 'top'), abs('2', 'B. Deux', 'bottom')],
      [ent('X', 'Bas', 'bottom'), ent('Y', 'Haut', 'top')],
    );
    expect(r.erreurs).toEqual([]);
    expect(r.remplacements.map((x) => [x.absenteId, x.entrante.nom])).toEqual([
      ['2', 'Bas'],
      ['1', 'Haut'],
    ]);
  });

  it('deux absentes, poule inconnue : refus (choix impossible)', () => {
    const r = appairerRemplacements([abs('1', 'A. Un', 'top'), abs('2', 'B. Deux', 'bottom')], [ent('X', 'Inconnue', null), ent('Y', 'Autre', null)]);
    expect(r.remplacements).toEqual([]);
    expect(r.erreurs.join(' ')).toContain('poule inconnue');
  });

  it('deux absentes dans la même poule : ambigu, refus', () => {
    const r = appairerRemplacements([abs('1', 'A. Un', 'top'), abs('2', 'B. Deux', 'top')], [ent('X', 'Haut', 'top'), ent('Y', 'Autre', 'bottom')]);
    expect(r.remplacements).toEqual([]);
    expect(r.erreurs.join(' ')).toMatch(/plusieurs joueuses absentes|aucune joueuse absente/);
  });

  it('liste reçue incomplète (1 inconnue pour 3 absentes) : on ne devine rien', () => {
    const r = appairerRemplacements([abs('1', 'A. Un'), abs('2', 'B. Deux'), abs('3', 'C. Trois')], [ent('Zoe', 'Inconnue', 'top')]);
    expect(r.remplacements).toEqual([]);
    expect(r.erreurs[0]).toContain('Zoe Inconnue');
    expect(r.erreurs[0]).toContain('pas une simple remplaçante');
  });

  it('plus d\'entrantes que d\'absentes remplaçables : refus', () => {
    const r = appairerRemplacements([abs('1', 'A. Un')], [ent('X', 'Un'), ent('Y', 'Deux')]);
    expect(r.remplacements).toEqual([]);
    expect(r.erreurs).toHaveLength(1);
  });
});

describe('moitieParAdversaires', () => {
  const m = new Map<string, 'top' | 'bottom'>([['a', 'top'], ['b', 'top'], ['c', 'bottom']]);
  it('adversaires de la même poule', () => expect(moitieParAdversaires(['a', 'b'], m)).toBe('top'));
  it('adversaires de poules différentes : null', () => expect(moitieParAdversaires(['a', 'c'], m)).toBeNull());
  it('adversaires inconnus : null', () => expect(moitieParAdversaires(['z'], m)).toBeNull());
});

describe('nomsDeApi', () => {
  const j = (id: number, name: string) => ({ id, name });
  const match = (a: ReturnType<typeof j>, b: ReturnType<typeof j>) => ({ player1: a, player2: b }) as unknown as MatchApi;
  it('dédoublonne et garde les adversaires de chaque joueuse', () => {
    const noms = nomsDeApi([match(j(1, 'Marta Kostyuk'), j(2, 'Linda Noskova')), match(j(1, 'Marta Kostyuk'), j(3, 'Elena Rybakina'))]);
    const k = noms.find((n) => n.nom === 'Kostyuk')!;
    expect(k.prenom).toBe('Marta');
    expect(k.adversaires.map((a) => a.nom)).toEqual(['Noskova', 'Rybakina']);
    expect(noms).toHaveLength(3);
  });
  it('ignore les matchs à déterminer et les byes', () => {
    const tbd = { player1: { id: 1, name: 'A B', tbd: true }, player2: { id: 2, name: 'C D' } } as unknown as MatchApi;
    expect(nomsDeApi([tbd])).toEqual([]);
  });
});

describe('nomsDeGameTracker', () => {
  const p = (position: number, prenom: string, nom: string) => ({ position, prenom, nom, enAttente: false, dejaPicke: false });
  const tour = (numero: number, haut: ReturnType<typeof p>[], bas: ReturnType<typeof p>[]) => ({ numero, nom: `J${numero}`, lockAt: null, picksAttendus: 2, pool: { haut, bas }, monPick: { haut: null, bas: null, etat: 'x' } });
  it('lit les poules des journées 1 à 3 et dédoublonne', () => {
    const etat = {
      tourOuvert: tour(1, [p(1, 'Marta', 'Kostyuk'), p(2, 'Linda', 'Noskova')], [p(5, 'Iga', 'Swiatek')]),
      toursAVenir: [tour(2, [p(1, 'Marta', 'Kostyuk')], [])],
      tours: [],
      dejaPickes: [],
    } as unknown as EtatGT;
    const noms = nomsDeGameTracker(etat);
    expect(noms).toHaveLength(3);
    expect(noms.find((n) => n.nom === 'Kostyuk')?.moitie).toBe('top');
    expect(noms.find((n) => n.nom === 'Swiatek')?.moitie).toBe('bottom');
  });
  it('demie / finale : pas de poule', () => {
    const etat = { tourOuvert: tour(4, [p(1, 'A', 'Bb')], []), toursAVenir: [], tours: [], dejaPickes: [] } as unknown as EtatGT;
    expect(nomsDeGameTracker(etat)[0].moitie).toBeNull();
  });
});
