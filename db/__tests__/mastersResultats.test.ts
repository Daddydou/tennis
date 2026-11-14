// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { MatchApi, TableauApi } from '@/lib/extract/matchstat';
import { appliquerResultatsMasters, observationsDepuisApi } from '../mastersResultats';

type Ligne = Record<string, unknown>;

/** Faux client Supabase : select / insert / update / eq / is / in / maybeSingle / rpc, assez pour ce module. */
function faux(tables: Record<string, Ligne[]>) {
  const journal: { op: string; table: string; valeur?: Ligne; lignes?: number }[] = [];
  const rpcs: string[] = [];
  const from = (table: string) => {
    const filtres: ((l: Ligne) => boolean)[] = [];
    let patch: Ligne | null = null;
    const cibles = () => tables[table].filter((l) => filtres.every((f) => f(l)));
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (k: string, v: unknown) => (filtres.push((l) => l[k] === v), b),
      is: (k: string, v: unknown) => (filtres.push((l) => l[k] === v), b),
      in: (k: string, vs: unknown[]) => (filtres.push((l) => vs.includes(l[k])), b),
      ilike: (k: string, motif: string) => {
        const fin = motif.replace(/^%/, '').toLowerCase();
        filtres.push((l) => String(l[k]).toLowerCase().endsWith(fin));
        return b;
      },
      update: (p: Ligne) => ((patch = p), b),
      insert: async (v: Ligne) => {
        tables[table].push({ ...v });
        journal.push({ op: 'insert', table, valeur: v });
        return { error: null };
      },
      maybeSingle: async () => ({ data: cibles()[0] ?? null, error: null }),
      then: (ok: (r: { data: Ligne[]; error: null }) => unknown) => {
        const c = cibles();
        if (patch) {
          for (const l of c) Object.assign(l, patch);
          journal.push({ op: 'update', table, valeur: patch, lignes: c.length });
        }
        return Promise.resolve({ data: c, error: null }).then(ok);
      },
    };
    return b;
  };
  const rpc = async (nom: string) => (rpcs.push(nom), { error: null });
  return { sb: { from, rpc } as unknown as SupabaseClient, journal, rpcs, tables };
}

const NOMS: [string, string][] = [
  ['Elena', 'Rybakina'], ['Cori', 'Gauff'], ['Jessica', 'Pegula'], ['Linda', 'Noskova'],
  ['Aryna', 'Sabalenka'], ['Mirra', 'Andreeva'], ['Elina', 'Svitolina'], ['Karolina', 'Muchova'],
];
const IDS = ['r', 'g', 'p', 'n', 's', 'a', 'v', 'm'];
const joueurs = NOMS.map(([prenom, nom], i) => ({ id: IDS[i], name: `${prenom[0]}. ${nom}` }));
const apiId = (i: number) => 1000 + i;
const jo = (i: number) => ({ id: apiId(i), name: `${NOMS[i][0]} ${NOMS[i][1]}` });

/** Match de l'API : i et j = indices dans NOMS ; gagnant = indice ou null. */
function matchApi(i: number, j: number, gagnant: number | null, result = '', over: Partial<MatchApi> = {}): MatchApi {
  return { roundId: 8, draw: 1, result, date: null, player1: jo(i), player2: jo(j), winnerId: gagnant === null ? null : apiId(gagnant), live: null, matchId: 1, ...over };
}

function base() {
  const l = (round: string, position: number, half: string, p1: string | null, p2: string | null): Ligne => ({
    tournament_id: 'T', round, position, half, player1_id: p1, player2_id: p2, winner_id: null, status: 'scheduled', sets: [], scheduled_at: null,
  });
  return faux({
    tn_matches: [
      l('J1', 0, 'top', 'r', 'n'), l('J1', 1, 'top', 'g', 'p'), l('J1', 2, 'bottom', 's', 'm'), l('J1', 3, 'bottom', 'a', 'v'),
      l('SF', 0, 'top', null, null), l('SF', 1, 'bottom', null, null), l('F', 0, 'top', null, null),
    ],
    tn_players: joueurs.map((j) => ({ ...j })),
    tn_tournaments: [{ id: 'T', status: 'upcoming' }],
  });
}

const tableau = (singles: MatchApi[]): TableauApi => ({ singles });

describe('observationsDepuisApi', () => {
  it('rattache les noms complets de l\'API à nos joueuses, et le vainqueur par l\'identifiant de l\'API', () => {
    const { observations, erreurs } = observationsDepuisApi([matchApi(0, 3, 3, '6-4 6-3')], joueurs);
    expect(erreurs).toEqual([]);
    expect(observations).toEqual([{ roundId: 8, date: null, p1: 'r', p2: 'n', winnerId: 'n', live: false, result: '6-4 6-3' }]);
  });

  it('une joueuse introuvable est signalée, le match ignoré', () => {
    const inconnue = { id: 999, name: 'Zoe Inconnue' };
    const { observations, erreurs } = observationsDepuisApi([matchApi(0, 3, null, '', { player2: inconnue })], joueurs);
    expect(observations).toEqual([]);
    expect(erreurs).toEqual(['Joueur introuvable dans la base : Zoe Inconnue.']);
  });

  it('un match en attente (TBA) ou avec exemption est ignoré sans erreur', () => {
    const tba = { id: null, name: 'TBA', tbd: true };
    expect(observationsDepuisApi([matchApi(0, 3, null, '', { player2: tba })], joueurs)).toEqual({ observations: [], erreurs: [] });
  });

  it('match en direct : live vrai, pas de vainqueur', () => {
    const { observations } = observationsDepuisApi([matchApi(0, 3, null, '3-2', { live: true })], joueurs);
    expect(observations[0]).toMatchObject({ live: true, winnerId: null });
  });
});

describe('appliquerResultatsMasters', () => {
  it('écrit les résultats de la journée 1, crée J2 et J3 de la poule jouée, passe le tournoi en cours, recalcule les points', async () => {
    const { sb, tables, rpcs } = base();
    const r = await appliquerResultatsMasters(
      sb,
      'T',
      tableau([
        matchApi(0, 3, 0, '6-4 6-3', { date: '2026-11-08T20:00:00.000Z' }), // Rybakina bat Noskova
        matchApi(1, 2, 2, '7-6(4) 6-4'), // Pegula bat Gauff (source : Gauff joueur 1)
      ]),
    );
    expect(r.erreurs).toEqual([]);
    expect(r).toMatchObject({ ecrit: true, maj: 2, creees: 4, tournoiStatut: 'running' });
    const j1 = tables.tn_matches.filter((m) => m.round === 'J1' && m.half === 'top');
    expect(j1.map((m) => [m.winner_id, m.status])).toEqual([['r', 'completed'], ['p', 'completed']]);
    expect(j1[0].scheduled_at).toBe('2026-11-08T20:00:00.000Z');
    // Gauff est notre joueuse 1, battue : ses jeux d'abord, tie-break de son côté.
    expect(j1[1].sets).toEqual([{ g1: 6, g2: 7, tb1: 4, tb2: null }, { g1: 4, g2: 6, tb1: null, tb2: null }]);
    // J2 : vainqueurs entre eux (Rybakina - Pegula), perdantes entre elles (Noskova - Gauff).
    const j2 = tables.tn_matches.filter((m) => m.round === 'J2');
    expect(j2.map((m) => [m.position, m.player1_id, m.player2_id])).toEqual([[0, 'r', 'p'], [1, 'n', 'g']]);
    expect(tables.tn_matches.filter((m) => m.round === 'J3')).toHaveLength(2);
    expect(tables.tn_tournaments[0].status).toBe('running');
    expect(rpcs).toEqual(['tn_recompute_picks']);
  });

  it('idempotent : un second passage identique n\'écrit rien et ne recalcule pas', async () => {
    const { sb, journal, rpcs } = base();
    const t = tableau([matchApi(0, 3, 0, '6-4 6-3')]);
    await appliquerResultatsMasters(sb, 'T', t);
    const avant = journal.length;
    rpcs.length = 0;
    const r2 = await appliquerResultatsMasters(sb, 'T', t);
    expect(r2).toMatchObject({ maj: 0, creees: 0, placees: 0 });
    expect(journal.length).toBe(avant);
    expect(rpcs).toEqual([]);
  });

  it('aperçu (ecrire: false) : annonce sans rien écrire', async () => {
    const { sb, journal, rpcs } = base();
    const r = await appliquerResultatsMasters(sb, 'T', tableau([matchApi(0, 3, 0, '6-4 6-3')]), false);
    expect(r).toMatchObject({ ecrit: false, maj: 1 });
    expect(journal).toEqual([]);
    expect(rpcs).toEqual([]);
  });

  it('une joueuse de l\'API introuvable : rien n\'est écrit', async () => {
    const { sb, journal } = base();
    const inconnue = { id: 999, name: 'Zoe Inconnue' };
    const r = await appliquerResultatsMasters(sb, 'T', tableau([matchApi(0, 3, 0, '6-4 6-3'), matchApi(1, 2, null, '', { player1: inconnue })]));
    expect(r.erreurs.join(' ')).toMatch(/Zoe Inconnue/);
    expect(r.ecrit).toBe(false);
    expect(journal).toEqual([]);
  });

  it('le statut du tournoi n\'est jamais ramené en arrière', async () => {
    const { sb, tables } = base();
    tables.tn_tournaments[0].status = 'completed';
    await appliquerResultatsMasters(sb, 'T', tableau([matchApi(0, 3, 0, '6-4 6-3')]));
    expect(tables.tn_tournaments[0].status).toBe('completed');
  });
});
