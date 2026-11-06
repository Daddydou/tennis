// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { PronosticMasters } from '@/lib/masters';
import { enregistrerPronostic, lirePronostics } from '../mastersPronostic';

type Ligne = Record<string, unknown>;

function faux(tables: Record<string, Ligne[]>, erreurSelect?: { code: string; message: string }) {
  const from = (table: string) => {
    const filtres: ((l: Ligne) => boolean)[] = [];
    let mode: 'select' | 'delete' = 'select';
    const cibles = () => tables[table].filter((l) => filtres.every((f) => f(l)));
    const b: Record<string, unknown> = {
      select: () => b,
      delete: () => ((mode = 'delete'), b),
      eq: (k: string, v: unknown) => (filtres.push((l) => l[k] === v), b),
      is: (k: string, v: unknown) => (filtres.push((l) => l[k] === v), b),
      insert: async (v: Ligne) => {
        tables[table].push({ ...v, updated_at: '2026-11-07T10:00:00Z' });
        return { error: null };
      },
      then: (ok: (r: { data: Ligne[] | null; error: unknown }) => unknown) => {
        if (erreurSelect && mode === 'select') return Promise.resolve({ data: null, error: erreurSelect }).then(ok);
        const c = cibles();
        if (mode === 'delete') tables[table] = tables[table].filter((l) => !c.includes(l));
        return Promise.resolve({ data: c, error: null }).then(ok);
      },
    };
    return b;
  };
  return { sb: { from } as unknown as SupabaseClient, tables };
}

const prono = (champion = 'a1'): PronosticMasters => ({ classementA: ['a1', 'a2', 'a3', 'a4'], classementB: ['b1', 'b2', 'b3', 'b4'], vainqueursDemis: ['a1', 'b1'], champion });

describe('pronostics d\'un Masters (base)', () => {
  it('enregistre puis relit un pronostic (moi = participant null)', async () => {
    const { sb } = faux({ tn_masters_pronostics: [] });
    await enregistrerPronostic(sb, 'T', null, prono(), 'app');
    const l = await lirePronostics(sb, 'T');
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ participantId: null, source: 'app' });
    expect(l[0].pronostic).toEqual(prono());
  });

  it('un seul pronostic par participant : le nouveau remplace l\'ancien, les autres restent', async () => {
    const { sb, tables } = faux({ tn_masters_pronostics: [] });
    await enregistrerPronostic(sb, 'T', null, prono('a1'), 'app');
    await enregistrerPronostic(sb, 'T', 'laki', prono('b1'), 'manuel');
    await enregistrerPronostic(sb, 'T', null, prono('b1'), 'app');
    expect(tables.tn_masters_pronostics).toHaveLength(2);
    const moi = (await lirePronostics(sb, 'T')).find((p) => p.participantId === null)!;
    expect(moi.pronostic.champion).toBe('b1');
  });

  it('table pas encore créée : aucun pronostic, sans erreur', async () => {
    const { sb } = faux({ tn_masters_pronostics: [] }, { code: '42P01', message: 'relation does not exist' });
    expect(await lirePronostics(sb, 'T')).toEqual([]);
  });

  it('autre erreur de lecture : remontée', async () => {
    const { sb } = faux({ tn_masters_pronostics: [] }, { code: '500', message: 'boom' });
    await expect(lirePronostics(sb, 'T')).rejects.toThrow(/boom/);
  });
});
