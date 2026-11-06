// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { PickLuGT } from '@/lib/mastersGT';
import { alignerPicksMasters, idGameTrackerDuTournoi } from '../mastersGT';

type Ligne = Record<string, unknown>;

/** Faux client : select / insert / delete / eq / is / in / maybeSingle / rpc. */
function faux(tables: Record<string, Ligne[]>) {
  const rpcs: string[] = [];
  const from = (table: string) => {
    const filtres: ((l: Ligne) => boolean)[] = [];
    let mode: 'select' | 'delete' = 'select';
    const cibles = () => tables[table].filter((l) => filtres.every((f) => f(l)));
    const b: Record<string, unknown> = {
      select: () => b,
      delete: () => ((mode = 'delete'), b),
      eq: (k: string, v: unknown) => (filtres.push((l) => l[k] === v), b),
      is: (k: string, v: unknown) => (filtres.push((l) => l[k] === v), b),
      in: (k: string, vs: unknown[]) => (filtres.push((l) => vs.includes(l[k])), b),
      insert: async (v: Ligne | Ligne[]) => {
        const lignes = Array.isArray(v) ? v : [v];
        // Index uniques de tn_picks : (tournoi, joueur, phase) par stock.
        for (const l of lignes) {
          const doublon = tables[table].find((x) => table === 'tn_picks' && x.tournament_id === l.tournament_id && x.player_id === l.player_id && x.phase === l.phase && x.participant_id === l.participant_id);
          if (doublon) return { error: { message: 'duplicate key (joueur, phase)' } };
        }
        tables[table].push(...lignes.map((l) => ({ ...l })));
        return { error: null };
      },
      maybeSingle: async () => ({ data: cibles()[0] ?? null, error: null }),
      then: (ok: (r: { data: Ligne[]; error: null }) => unknown) => {
        const c = cibles();
        if (mode === 'delete') tables[table] = tables[table].filter((l) => !c.includes(l));
        return Promise.resolve({ data: c, error: null }).then(ok);
      },
    };
    return b;
  };
  const sb = { from, rpc: async (n: string) => (rpcs.push(n), { error: null }) } as unknown as SupabaseClient;
  return { sb, tables, rpcs };
}

const lu = (pseudo: string, moi: boolean, round: PickLuGT['round'], half: PickLuGT['half'], playerId: string, verrouille = false): PickLuGT => ({ pseudo, moi, round, half, playerId, verrouille });
const base = () =>
  faux({
    tn_participants: [{ id: 'p-laki', name: 'Laki' }, { id: 'p-thomas', name: 'Thomas' }],
    tn_picks: [],
    tn_tournaments: [{ id: 'T', external_id: 'gt:cmw3' }],
    tn_bracket_externe_tournois: [],
  });

describe('idGameTrackerDuTournoi', () => {
  it('lit l\'identifiant mémorisé à l\'import (gt:<id>)', async () => {
    expect(await idGameTrackerDuTournoi(base().sb, 'T')).toBe('cmw3');
  });

  it('sinon, passe par le lien du bracket de Thomas ; sinon null', async () => {
    const f = faux({ tn_tournaments: [{ id: 'T', external_id: 'ms123' }], tn_bracket_externe_tournois: [{ id: 'lien-id', tournament_id_interne: 'T' }] });
    expect(await idGameTrackerDuTournoi(f.sb, 'T')).toBe('lien-id');
    expect(await idGameTrackerDuTournoi(faux({ tn_tournaments: [{ id: 'T', external_id: null }], tn_bracket_externe_tournois: [] }).sb, 'T')).toBeNull();
  });
});

describe('alignerPicksMasters', () => {
  it('écrit mes picks et ceux des autres, avec la phase de chaque tour', async () => {
    const { sb, tables, rpcs } = base();
    const r = await alignerPicksMasters(sb, 'T', [lu('moi', true, 'J1', 'top', 'r'), lu('Daddy', true, 'J1', 'bottom', 's', true), lu('Laki', false, 'J1', 'top', 'g', true), lu('moi', true, 'SF', null, 'r')], ['J1', 'J2']);
    expect(r).toMatchObject({ ecrits: 4, supprimes: 0, inconnus: [] });
    const moi = tables.tn_picks.filter((x) => x.participant_id === null);
    expect(moi.map((x) => [x.round, x.half, x.player_id, x.phase])).toEqual([['J1', 'top', 'r', 'poules'], ['J1', 'bottom', 's', 'poules'], ['SF', null, 'r', 'finale']]);
    expect(tables.tn_picks.find((x) => x.participant_id === 'p-laki')).toMatchObject({ round: 'J1', player_id: 'g', phase: 'poules' });
    expect(rpcs).toEqual(['tn_recompute_picks']);
  });

  it('une joueuse peut être piquée en poules ET en demie (une fois par phase)', async () => {
    const { sb, tables } = base();
    await alignerPicksMasters(sb, 'T', [lu('moi', true, 'J1', 'top', 'r'), lu('moi', true, 'SF', null, 'r')], ['J1']);
    expect(tables.tn_picks.filter((x) => x.player_id === 'r')).toHaveLength(2);
  });

  it('Game Tracker fait foi : les picks d\'un tour sont remplacés, même vidés, les autres tours sont intacts', async () => {
    const { sb, tables } = base();
    tables.tn_picks.push(
      { tournament_id: 'T', participant_id: null, round: 'J1', half: 'top', player_id: 'g', phase: 'poules' },
      { tournament_id: 'T', participant_id: null, round: 'J2', half: 'top', player_id: 'r', phase: 'poules' },
      { tournament_id: 'T', participant_id: null, round: 'J3', half: 'top', player_id: 'p', phase: 'poules' },
    );
    // Game Tracker : J1 passe à Rybakina ; J2 n'a plus de pick ; J3 n'est pas dans la réponse.
    const r = await alignerPicksMasters(sb, 'T', [lu('moi', true, 'J1', 'top', 'r')], ['J1', 'J2']);
    expect(r).toMatchObject({ ecrits: 1, supprimes: 2 });
    expect(tables.tn_picks.map((x) => [x.round, x.player_id]).sort()).toEqual([['J1', 'r'], ['J3', 'p']]);
  });

  it('un pseudo inconnu est signalé et ignoré', async () => {
    const { sb, tables } = base();
    const r = await alignerPicksMasters(sb, 'T', [lu('inconnu', false, 'J1', 'top', 'r', true)], []);
    expect(r.inconnus).toEqual(['inconnu']);
    expect(tables.tn_picks).toEqual([]);
  });

  it('rejouer la même lecture ne change rien d\'autre que le recalcul identique', async () => {
    const { sb, tables } = base();
    const picks = [lu('moi', true, 'J1', 'top', 'r')];
    await alignerPicksMasters(sb, 'T', picks, ['J1']);
    await alignerPicksMasters(sb, 'T', picks, ['J1']);
    expect(tables.tn_picks).toHaveLength(1);
  });
});
