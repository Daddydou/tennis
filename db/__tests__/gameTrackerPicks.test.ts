// @vitest-environment node
/**
 * db/gameTrackerPicks.ts : le lien tournoi interne <-> Game Tracker.
 * Client Supabase simulé (une « table » en mémoire) : aucun accès réseau.
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ecrireLienGT } from '../gameTrackerPicks';
import type { TournoiPicksGT } from '@/lib/gameTrackerPicks';

type Ligne = Record<string, unknown>;

/** Mini-faux Supabase : select/eq/limit/maybeSingle, update/eq, insert — sur une table. */
function faux(lignes: Ligne[], options: { erreurInsert?: string } = {}) {
  const table = lignes;
  const appels = { inserts: [] as Ligne[], updates: [] as { patch: Ligne; id: unknown }[] };
  const from = () => ({
    select: () => {
      const filtres: [string, unknown][] = [];
      let max = Infinity;
      const q = {
        eq(col: string, val: unknown) {
          filtres.push([col, val]);
          return q;
        },
        limit(n: number) {
          max = n;
          return q;
        },
        maybeSingle: async () => ({ data: table.find((l) => filtres.every(([c, v]) => l[c] === v)) ?? null, error: null }),
        then: (ok: (r: { data: Ligne[]; error: null }) => unknown) =>
          Promise.resolve({ data: table.filter((l) => filtres.every(([c, v]) => l[c] === v)).slice(0, max), error: null }).then(ok),
      };
      return q;
    },
    update: (patch: Ligne) => ({
      eq: async (_col: string, id: unknown) => {
        appels.updates.push({ patch, id });
        const l = table.find((x) => x.id === id);
        if (l) Object.assign(l, patch);
        return { error: null };
      },
    }),
    insert: async (row: Ligne) => {
      if (options.erreurInsert) return { error: { message: options.erreurInsert } };
      appels.inserts.push(row);
      table.push(row);
      return { error: null };
    },
  });
  return { sb: { from } as unknown as SupabaseClient, appels, table };
}

const LYON = '62dd635c-9503-4803-9af2-1addfcc151b6';
const gt: TournoiPicksGT = {
  id: 'cmvdsu1wr000008jwabbk050q',
  nom: 'Vieil ATP 250 Lyon',
  tour: 'ATP',
  annee: 2026,
  drawSize: 32,
  statut: 'ONGOING',
  tourOuvert: null,
};

describe('ecrireLienGT', () => {
  it('tournoi absent de la table (cas de Lyon) : ligne créée a minima avec le lien', async () => {
    const { sb, appels } = faux([]);
    expect(await ecrireLienGT(sb, LYON, gt)).toEqual({ ok: true, cree: true });
    expect(appels.inserts).toEqual([
      { id: gt.id, nom: gt.nom, tour: 'ATP', annee: 2026, draw_size: 32, statut: 'ONGOING', verrouille: false, tournament_id_interne: LYON },
    ]);
  });

  it('ligne déjà synchronisée mais sans lien : seul le lien est posé', async () => {
    const { sb, appels } = faux([{ id: gt.id, nom: 'x', tournament_id_interne: null }]);
    expect(await ecrireLienGT(sb, LYON, gt)).toEqual({ ok: true, cree: false });
    expect(appels.updates).toEqual([{ patch: { tournament_id_interne: LYON }, id: gt.id }]);
    expect(appels.inserts).toHaveLength(0);
  });

  it('déjà relié au même tournoi : idempotent', async () => {
    const { sb } = faux([{ id: gt.id, tournament_id_interne: LYON }]);
    expect(await ecrireLienGT(sb, LYON, gt)).toMatchObject({ ok: true });
  });

  it('notre tournoi déjà relié à un AUTRE tournoi Game Tracker : refus, rien écrit', async () => {
    const { sb, appels } = faux([{ id: 'autre-gt', tournament_id_interne: LYON }]);
    const r = await ecrireLienGT(sb, LYON, gt);
    expect(r).toMatchObject({ ok: false });
    expect(appels.inserts).toHaveLength(0);
    expect(appels.updates).toHaveLength(0);
  });

  it('tournoi Game Tracker déjà relié à un AUTRE de nos tournois : refus, rien écrit', async () => {
    const { sb, appels } = faux([{ id: gt.id, tournament_id_interne: 'un-autre-uuid' }]);
    const r = await ecrireLienGT(sb, LYON, gt);
    expect(r).toMatchObject({ ok: false });
    expect(appels.updates).toHaveLength(0);
  });

  it('erreur d’écriture : renvoyée, jamais levée', async () => {
    const { sb } = faux([], { erreurInsert: 'boom' });
    expect(await ecrireLienGT(sb, LYON, gt)).toEqual({ ok: false, erreur: 'tn_bracket_externe_tournois : boom' });
  });
});
