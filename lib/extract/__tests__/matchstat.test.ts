// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  apparierNomComplet,
  convertirTableauApi,
  estCircuitPrincipal,
  lireScore,
  lireUrlTableauApi,
  nomAffichage,
  probaSansMarge,
  reidentifier,
  slugDepuisNomApi,
  urlTableauApi,
  type TableauApi,
  type TournoiApi,
} from '../matchstat';
import { parseExtract, verifierExtraction } from '../../parser';
import { controlerExtrait } from '..';

// Vraies réponses de l'API (allégées : stats, photos et h2h retirés), relevées le 22/10/2026.
const fixture = (f: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', f), 'utf8'));
const wuhan: TableauApi = fixture('matchstat-wuhan-2026-draws.json');
const bruxelles: TableauApi = fixture('matchstat-brussels-2026-draws.json');
const calendrier: { data: TournoiApi[] } = fixture('matchstat-calendar-active-2026-10-19.json');
const MAINTENANT = new Date('2026-10-22T12:00:00Z');

const convWuhan = () =>
  convertirTableauApi(wuhan, { type: 'wta', nom: 'Wuhan Open - Wuhan', annee: 2026, seasonId: 16750, startDate: '2026-10-12' }, MAINTENANT);
const convBruxelles = () =>
  convertirTableauApi(bruxelles, { type: 'atp', nom: 'European Open - Brussels', annee: 2026, seasonId: 21358, startDate: '2026-10-19' }, MAINTENANT);

describe('lireScore', () => {
  it('lit sets, tie-breaks, abandon et forfait', () => {
    expect(lireScore('7-6(5) 6-3')).toEqual({ sets: [{ v: 7, p: 6, tb: 5 }, { v: 6, p: 3, tb: null }], issue: 'completed' });
    expect(lireScore('6-1 3-0 ret.')).toEqual({ sets: [{ v: 6, p: 1, tb: null }, { v: 3, p: 0, tb: null }], issue: 'retired' });
    expect(lireScore('w/o')).toEqual({ sets: [], issue: 'walkover' });
    expect(lireScore('')).toEqual({ sets: [], issue: 'aucune' });
    expect(lireScore('bye').issue).toBe('aucune');
  });
});

describe('convertirTableauApi — Wuhan WTA 2026 (tournoi terminé)', () => {
  it('produit un extrait que le parser du bookmarklet accepte tel quel', () => {
    const { extrait } = convWuhan();
    expect(controlerExtrait(extrait).ok).toBe(true);
    const e = parseExtract(extrait);
    expect(e.tour).toBe('WTA');
    expect(e.roundsFound).toEqual(['R64', 'R32', 'R16', 'QF', 'SF', 'F']);
    expect(e.matches).toHaveLength(63);
    expect(e.tournament).toEqual({ slug: 'wuhan-open', externalId: 'ms16750', year: 2026 });
    expect(verifierExtraction(e).avertissements).toEqual([]);
  });

  it('même structure que l’import bookmarklet en base (positions, exemptions, orientation)', () => {
    const { extrait } = convWuhan();
    const r64 = extrait.matches.filter((m) => m.round === 'R64');
    expect(r64.map((m) => m.position)).toEqual([...Array(32).keys()]);
    expect(r64.filter((m) => m.status === 'bye')).toHaveLength(8);
    // Exemptée : la joueuse présente est désignée vainqueur (comme en base).
    const bye = r64[0];
    expect(bye.players.find((p) => !p.isBye)?.winner).toBe(true);
    // Abandon : Ann Li bat Osorio 6-1 3-0 ret. (position 1 du 1er tour, comme en base).
    const abandon = r64[1];
    expect(abandon.status).toBe('retired');
    expect(abandon.players[0].name).toBe('Ann Li');
    expect(abandon.players[0].winner).toBe(true);
    expect(abandon.players[0].sets.map((s) => s.games)).toEqual([6, 3]);
    expect(abandon.players[1].sets.map((s) => s.games)).toEqual([1, 0]);
    // 2e tour, position 0 : Sabalenka (exemptée, emplacement du haut) contre Ann Li.
    const r32 = extrait.matches.find((m) => m.round === 'R32' && m.position === 0)!;
    expect(r32.players[0].name).toBe('Aryna Sabalenka');
    expect(r32.players[1].name).toBe('Ann Li');
    expect(r32.players[1].winner).toBe(true);
    // Finale : Chwalinska bat Kartal 2-6 6-4 6-2.
    const f = extrait.matches.find((m) => m.round === 'F')!;
    expect(f.players[0].name).toBe('Maja Chwalinska');
    expect(f.players[0].sets.map((s) => s.games)).toEqual([2, 6, 6]);
    expect(f.players[1].sets.map((s) => s.games)).toEqual([6, 4, 2]);
  });

  it('chaque joueur du haut a gagné l’emplacement du haut au tour précédent', () => {
    const { extrait } = convWuhan();
    const parTour = (r: string) => extrait.matches.filter((m) => m.round === r);
    const rounds = extrait.rounds_found;
    for (let i = 1; i < rounds.length; i++) {
      const prec = parTour(rounds[i - 1]);
      for (const m of parTour(rounds[i])) {
        const vHaut = prec[2 * m.position].players.find((p) => p.winner)?.id;
        expect(m.players[0].id).toBe(vHaut);
      }
    }
  });

  it('tie-break rangé chez le perdant du set', () => {
    const { extrait } = convWuhan();
    const avecTb = extrait.matches.flatMap((m) => m.players.flatMap((p) => p.sets)).filter((s) => s.tiebreak !== null);
    expect(avecTb.length).toBeGreaterThan(0);
    for (const s of avecTb) expect(s.games).toBe(6);
  });

  it('préfixe les identifiants de la source', () => {
    const { extrait, nomsComplets } = convWuhan();
    const ids = extrait.matches.flatMap((m) => m.players.map((p) => p.id)).filter(Boolean) as string[];
    expect(ids.every((id) => /^ms\d+$/.test(id))).toBe(true);
    expect(nomsComplets['ms44040']).toBe('Maria Camila Osorio Serrano');
  });
});

describe('convertirTableauApi — Bruxelles ATP 2026 (en cours)', () => {
  it('forfait, places d’attente, statuts d’entrée', () => {
    const { extrait } = convBruxelles();
    expect(controlerExtrait(extrait).ok).toBe(true);
    expect(extrait.tournament.slug).toBe('brussels');
    expect(extrait.tournament.start_date).toBe('2026-10-19');
    const wo = extrait.matches.find((m) => m.status === 'walkover')!;
    expect(wo.players.find((p) => p.winner)?.name).toBe('Arthur Fils');
    expect(wo.players.every((p) => p.sets.length === 0)).toBe(true);
    const finale = extrait.matches.find((m) => m.round === 'F')!;
    expect(finale.status).toBe('scheduled');
    expect(finale.players.map((p) => [p.id, p.name])).toEqual([[null, 'TBA'], [null, 'TBA']]);
    const seeds = new Set(extrait.matches.flatMap((m) => m.players.map((p) => p.seed)).filter((s) => s && !/^\d+$/.test(s)));
    expect([...seeds].sort()).toEqual(['LL', 'Q', 'WC']);
  });

  it('cotes avant-match des matchs à venir, orientées comme l’extrait', () => {
    const { extrait, cotes } = convBruxelles();
    expect(cotes).toHaveLength(4);
    const goffin = cotes.find((c) => c.nomA === 'David Goffin' || c.nomB === 'David Goffin')!;
    const m = extrait.matches.find((x) => x.match_id === goffin.eventId)!;
    expect([m.players[0].id, m.players[1].id]).toEqual([goffin.playerAId, goffin.playerBId]);
    const coteGoffin = goffin.nomA === 'David Goffin' ? goffin.coteA : goffin.coteB;
    expect(coteGoffin).toBe(7.8);
    expect(probaSansMarge(1.4, 2.92)).toBeCloseTo(0.6759, 3);
  });
});

describe('tournois et URL', () => {
  it('ne garde que le circuit principal', () => {
    const noms = calendrier.data.filter(estCircuitPrincipal).map((t) => t.name).sort();
    expect(noms).toEqual([
      'Almaty Open - Almaty',
      'European Open - Brussels',
      'Grand Prix Auvergne-Rhone-Alpes - Lyon',
      'Japan Open - Osaka',
      'Ningbo Open - Ningbo',
    ]);
  });

  it('retrouve la clé du référentiel', () => {
    expect(slugDepuisNomApi('Grand Prix Auvergne-Rhone-Alpes - Lyon', 'ATP')).toBe('lyon');
    expect(slugDepuisNomApi('Almaty Open - Almaty', 'ATP')).toBe('almaty');
    expect(slugDepuisNomApi('Japan Open - Osaka', 'WTA')).toBe('osaka');
    expect(slugDepuisNomApi('Ningbo Open - Ningbo', 'WTA')).toBe('ningbo');
    expect(slugDepuisNomApi('Roland Garros - Paris', 'WTA')).toBe('roland-garros');
    expect(slugDepuisNomApi('Rolex Paris Masters - Paris', 'ATP')).toBe('paris');
  });

  it('URL source : aller-retour, et refus de tout autre hôte', () => {
    const url = urlTableauApi('atp', 'European Open - Brussels', 2026);
    expect(lireUrlTableauApi(url)).toEqual({ type: 'atp', nom: 'European Open - Brussels', annee: 2026 });
    expect(lireUrlTableauApi(url.replace('rapidapi.com', 'rapidapi.com.evil.io'))).toBeNull();
    expect(lireUrlTableauApi('https://www.atptour.com/en/scores/current/brussels/7485/draws')).toBeNull();
  });
});

describe('apparierNomComplet', () => {
  const base = [
    { id: '325898', name: 'C. Osorio', country: 'COL' },
    { id: 'MU94', name: 'J. Munar', country: 'ESP' },
    { id: 'C0C8', name: 'J. Cerundolo', country: 'ARG' },
    { id: 'C0AU', name: 'F. Cerundolo', country: 'ARG' },
    { id: 'V812', name: 'B. van de Zandschulp', country: 'NED' },
    { id: '326096', name: 'A. Li', country: 'USA' },
    { id: 'w1', name: 'X. Wang', country: 'CHN' },
    { id: 'w2', name: 'X. Wang', country: 'CHN' },
  ];
  it('noms d’état civil complets → nom d’usage en base', () => {
    expect(apparierNomComplet(base, 'Maria Camila Osorio Serrano', 'COL')).toEqual({ statut: 'trouve', id: '325898' });
    expect(apparierNomComplet(base, 'Jaume Antoni Munar Clar', 'ESP')).toEqual({ statut: 'trouve', id: 'MU94' });
    expect(apparierNomComplet(base, 'Juan Manuel Cerundolo', 'ARG')).toEqual({ statut: 'trouve', id: 'C0C8' });
    expect(apparierNomComplet(base, 'Francisco Cerundolo', 'ARG')).toEqual({ statut: 'trouve', id: 'C0AU' });
    expect(apparierNomComplet(base, 'Botic Van De Zandschulp', 'NED')).toEqual({ statut: 'trouve', id: 'V812' });
    expect(apparierNomComplet(base, 'Ann Li', 'USA')).toEqual({ statut: 'trouve', id: '326096' });
  });
  it('homonymes : rien n’est fusionné', () => {
    expect(apparierNomComplet(base, 'Xiyu Wang', 'CHN').statut).toBe('ambigu');
  });
  it('pays contradictoire ou inconnu en base : absent', () => {
    expect(apparierNomComplet(base, 'Ann Li', 'CHN')).toEqual({ statut: 'absent' });
    expect(apparierNomComplet(base, 'Clement Chidekh', 'FRA')).toEqual({ statut: 'absent' });
  });
  it('nom d’affichage au format des sites officiels', () => {
    expect(nomAffichage('Clement Chidekh')).toBe('C. Chidekh');
    expect(nomAffichage('Botic Van De Zandschulp')).toBe('B. Van De Zandschulp');
  });
});

describe('reidentifier', () => {
  const base = [
    { id: '326096', name: 'A. Li', country: 'USA' },
    { id: '325898', name: 'C. Osorio', country: 'COL' },
    { id: '320760', name: 'A. Sabalenka', country: 'BLR' },
    { id: '326160', name: 'X. Wang', country: 'CHN' },
    { id: '326376', name: 'X. Wang', country: 'CHN' },
  ];

  it('correspondance mémorisée d’abord, puis nom ; le nom de la base est conservé', () => {
    const r = reidentifier(convWuhan(), base, new Map([['43872', '326160'], ['47152', '326376']]));
    const r64 = r.extrait.matches.filter((m) => m.round === 'R64');
    expect(r64[1].players.map((p) => [p.id, p.name])).toEqual([['326096', 'A. Li'], ['325898', 'C. Osorio']]);
    const wang = r64[13].players.map((p) => p.id);
    expect(wang).toEqual(['326160', '326376']);
    expect(r.correspondances).toContainEqual({ sourceId: '44040', playerId: '325898', nomSource: 'Maria Camila Osorio Serrano' });
    // Inconnue en base : nouvel ID préfixé, nom au format officiel.
    const nouvelle = r.extrait.matches.flatMap((m) => m.players).find((p) => p.id === 'ms43323');
    expect(nouvelle?.name).toBe('M. Chwalinska');
  });

  it('sans mémoire, les homonymes restent séparées et signalées', () => {
    const r = reidentifier(convWuhan(), base, new Map());
    expect(r.extrait.matches.find((m) => m.round === 'R64' && m.position === 13)!.players.map((p) => p.id)).toEqual(['ms43872', 'ms47152']);
    expect(r.avertissements.filter((a) => a.includes('ambigu'))).toHaveLength(2);
  });

  it('garde l’ordre haut/bas déjà en base', () => {
    const ordre = new Map<string, [string | null, string | null]>([['R64#1', ['325898', '326096']]]);
    const r = reidentifier(convWuhan(), base, new Map(), ordre);
    const m = r.extrait.matches.find((x) => x.round === 'R64' && x.position === 1)!;
    expect(m.players.map((p) => p.id)).toEqual(['325898', '326096']);
    expect(m.players[1].winner).toBe(true);
    expect(m.players[1].sets.map((s) => s.games)).toEqual([6, 3]);
  });
});
