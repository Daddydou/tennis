// @vitest-environment node
/**
 * CŒUR D'IMPORT (db/importCoeur.ts) — non-régression de l'import manuel.
 *
 * Supabase est remplacé par un faux client qui ENREGISTRE chaque opération
 * (table, type, charge, clé de conflit) : on vérifie ce qui serait écrit,
 * sans base. Les étapes de recalcul (points, projections, Fantasy) sont
 * moquées : elles ne changent pas avec ce déplacement de code.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { extractWta } from '@/lib/extract';

type Op = { table: string; op: string; payload?: unknown; opts?: unknown; filtres: [string, unknown][] };
let journal: Op[] = [];
let matchsEnBase: unknown[] = [];

function reponse(op: Op): { data: unknown; error: null } {
  if (op.table === 'tn_tournaments' && (op.op === 'upsert' || op.op === 'insert')) return { data: { id: 'T1' }, error: null };
  if (op.table === 'tn_matches' && op.op === 'select') return { data: matchsEnBase, error: null };
  if (op.op === 'select') return { data: op.table === 'tn_tournaments' ? null : [], error: null };
  return { data: null, error: null };
}

function fauxClient() {
  return {
    from(table: string) {
      const op: Op = { table, op: 'select', filtres: [] };
      const fin = () => {
        journal.push(op);
        return Promise.resolve(reponse(op));
      };
      const q: Record<string, unknown> = {
        select: () => q,
        upsert: (p: unknown, o: unknown) => ((op.op = 'upsert'), (op.payload = p), (op.opts = o), q),
        insert: (p: unknown) => ((op.op = 'insert'), (op.payload = p), q),
        update: (p: unknown) => ((op.op = 'update'), (op.payload = p), q),
        eq: (c: string, v: unknown) => (op.filtres.push([c, v]), q),
        single: fin,
        maybeSingle: fin,
        then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => fin().then(ok, ko),
      };
      return q;
    },
  };
}

vi.mock('@/db/server', () => ({ supabaseAdmin: () => fauxClient() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/db/points', () => ({ recalculerPoints: async () => ({ ok: true }) }));
vi.mock('@/db/queries', () => ({ loadEngineData: async () => null, tourCourantMatches: () => null }));
vi.mock('@/db/projections', () => ({ computeAndStoreProjections: async () => {}, invaliderProjections: async () => {} }));
vi.mock('@/db/fantasy', () => ({
  computeAndStoreFantasy: async () => null,
  enregistrerHistorique: async () => ({ ok: true }),
  equipeEvaluee: () => null,
  invaliderFantasy: async () => {},
}));

const { importerExtraitCoeur, compterMatchsChanges } = await import('../importCoeur');

const URL_WUHAN = 'https://www.wtatennis.com/tournaments/wuhan-open/draws';
const html = readFileSync(
  fileURLToPath(new URL('../../lib/extract/__tests__/fixtures/wta-wuhan-2026.html', import.meta.url)),
  'utf8',
);
const extrait = extractWta(new JSDOM(html, { url: URL_WUHAN }).window.document, URL_WUHAN)!;

beforeEach(() => {
  journal = [];
  matchsEnBase = [];
});

describe('importerExtraitCoeur — import de Wuhan 2026', () => {
  it('écrit le tournoi, les joueuses et les 63 matchs comme l’import manuel', async () => {
    const r = await importerExtraitCoeur(JSON.stringify(extrait));
    expect(r.ok).toBe(true);
    expect(r.tournamentId).toBe('T1');
    expect(r.resume).toMatchObject({ tournoi: 'Wuhan 2026', matchs: 63, rounds: ['R64', 'R32', 'R16', 'QF', 'SF', 'F'] });
    expect(r.matchsChanges).toBe(63);

    // Pas d'external_id (URL courte) : recherche slug+tour+year puis insertion.
    const tournoi = journal.find((o) => o.table === 'tn_tournaments' && o.op === 'insert')!;
    expect(tournoi.payload).toMatchObject({
      external_id: null,
      slug: 'wuhan-open',
      name: 'Wuhan 2026',
      tour: 'WTA',
      draw_size: 64,
      best_of: 3,
      year: 2026,
      status: 'running',
      rounds: ['R64', 'R32', 'R16', 'QF', 'SF', 'F'],
    });

    const matchs = journal.find((o) => o.table === 'tn_matches' && o.op === 'upsert')!;
    expect(matchs.opts).toEqual({ onConflict: 'tournament_id,round,position' });
    const lignes = matchs.payload as Record<string, unknown>[];
    expect(lignes).toHaveLength(63);
    expect(lignes[0]).toMatchObject({ tournament_id: 'T1', round: 'R64', round_order: 1, position: 0, half: 'top', status: 'bye', winner_id: '320760', player2_id: null });

    const joueurs = journal.find((o) => o.table === 'tn_players' && o.op === 'upsert')!;
    expect(joueurs.opts).toEqual({ onConflict: 'id' });
    expect((joueurs.payload as unknown[]).length).toBe(r.resume!.joueurs);
  });

  it('rejets identiques à l’import manuel', async () => {
    expect(await importerExtraitCoeur('{oups')).toEqual({ ok: false, error: 'JSON invalide : impossible à parser.', avertissements: [] });
    expect(await importerExtraitCoeur('{"matches":[]}')).toEqual({ ok: false, error: 'Aucun match dans cette extraction.', avertissements: [] });
    expect(journal).toEqual([]);
  });

  it('base déjà à jour : 0 match changé', async () => {
    await importerExtraitCoeur(JSON.stringify(extrait));
    matchsEnBase = journal.find((o) => o.table === 'tn_matches' && o.op === 'upsert')!.payload as unknown[];
    journal = [];
    const r = await importerExtraitCoeur(JSON.stringify(extrait));
    expect(r.matchsChanges).toBe(0);
  });
});

describe('compterMatchsChanges', () => {
  const m = (position: number, winner_id: string | null, sets: unknown = []) => ({
    round: 'R64', position, player1_id: 'a', player2_id: 'b', winner_id, sets, status: 'completed',
  });
  it('compte nouveaux et modifiés, ignore l’ordre des clés des sets', () => {
    const avant = [m(0, 'a', [{ tb2: null, g1: 6, g2: 4, tb1: null }]), m(1, null)];
    const apres = [m(0, 'a', [{ g1: 6, g2: 4, tb1: null, tb2: null }]), m(1, 'b'), m(2, null)];
    expect(compterMatchsChanges(avant, apres)).toBe(2);
  });
});
