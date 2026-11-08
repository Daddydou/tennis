// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { appliquerRemplacementsMasters } from '../mastersRemplacement';

type Ligne = Record<string, unknown>;

/** Faux client : select / update / eq / is / in / ilike / maybeSingle. */
function faux(tables: Record<string, Ligne[]>) {
  const from = (table: string) => {
    const filtres: ((l: Ligne) => boolean)[] = [];
    let patch: Ligne | null = null;
    const b: Record<string, unknown> = {
      select: () => b,
      update: (p: Ligne) => ((patch = p), b),
      eq: (k: string, v: unknown) => (filtres.push((l) => l[k] === v), b),
      is: (k: string, v: unknown) => (filtres.push((l) => l[k] === v), b),
      in: (k: string, vs: unknown[]) => (filtres.push((l) => vs.includes(l[k])), b),
      ilike: (k: string, motif: string) => {
        const fin = motif.replace(/^%/, '').toLowerCase();
        filtres.push((l) => String(l[k]).toLowerCase().endsWith(fin));
        return b;
      },
      maybeSingle: async () => ({ data: tables[table].filter((l) => filtres.every((f) => f(l)))[0] ?? null, error: null }),
      then: (ok: (r: { data: Ligne[]; error: null }) => unknown) => {
        const c = tables[table].filter((l) => filtres.every((f) => f(l)));
        if (patch) for (const l of c) Object.assign(l, patch);
        return Promise.resolve({ data: c, error: null }).then(ok);
      },
    };
    return b;
  };
  return { sb: { from } as unknown as SupabaseClient, tables };
}

const T = 'tournoi-1';
const match = (round: string, position: number, half: 'top' | 'bottom' | null, p1: string, p2: string, extra: Ligne = {}): Ligne => ({
  tournament_id: T, round, position, half, player1_id: p1, player2_id: p2, winner_id: null, status: 'scheduled', ...extra,
});

function base(matchsExtra: Ligne[] = []) {
  return faux({
    tn_tournaments: [{ id: T, tour: 'WTA' }],
    tn_players: [
      { id: 'ryb', name: 'E. Rybakina', tour: 'WTA' },
      { id: 'nos', name: 'L. Noskova', tour: 'WTA' },
      { id: 'sab', name: 'A. Sabalenka', tour: 'WTA' },
      { id: 'kos', name: 'M. Kostyuk', tour: 'WTA' },
      { id: 'atp1', name: 'M. Kostyuk', tour: 'ATP' },
    ],
    tn_matches: [match('J1', 0, 'top', 'ryb', 'nos'), match('J2', 0, 'top', 'sab', 'ryb'), ...matchsExtra],
  });
}

const recus = [
  { prenom: 'Marta', nom: 'Kostyuk', moitie: 'top' as const },
  { prenom: 'Linda', nom: 'Noskova', moitie: 'top' as const },
  { prenom: 'Aryna', nom: 'Sabalenka', moitie: 'top' as const },
];

describe('appliquerRemplacementsMasters', () => {
  it('écrit : la remplaçante prend la place de l\'absente dans ses matchs non joués', async () => {
    const { sb, tables } = base();
    const r = await appliquerRemplacementsMasters(sb, T, recus, true);
    expect(r.erreurs).toEqual([]);
    expect(r.messages).toEqual(['M. Kostyuk remplace E. Rybakina']);
    expect(r.ecrit).toBe(true);
    expect(tables.tn_matches.map((m) => [m.player1_id, m.player2_id])).toEqual([['kos', 'nos'], ['sab', 'kos']]);
    expect(r.joueurs.map((j) => j.id).sort()).toEqual(['kos', 'nos', 'sab']);
  });

  it('simulation : rien n\'est écrit, mais la liste renvoyée est corrigée', async () => {
    const { sb, tables } = base();
    const r = await appliquerRemplacementsMasters(sb, T, recus, false);
    expect(r.ecrit).toBe(false);
    expect(r.echanges).toEqual([{ ancienId: 'ryb', nouveauId: 'kos' }]);
    expect(tables.tn_matches[0].player1_id).toBe('ryb');
    expect(r.joueurs.some((j) => j.id === 'kos')).toBe(true);
  });

  it('prend la joueuse du bon circuit (pas l\'homonyme de l\'autre tour)', async () => {
    const { sb } = base();
    const r = await appliquerRemplacementsMasters(sb, T, recus, false);
    expect(r.echanges[0].nouveauId).toBe('kos');
  });

  it('rien d\'inconnu : aucun changement, aucune erreur', async () => {
    const { sb, tables } = base();
    const r = await appliquerRemplacementsMasters(sb, T, [{ prenom: 'Elena', nom: 'Rybakina' }, { prenom: 'Linda', nom: 'Noskova' }, { prenom: 'Aryna', nom: 'Sabalenka' }], true);
    expect(r).toMatchObject({ messages: [], erreurs: [], ecrit: false });
    expect(tables.tn_matches[0].player1_id).toBe('ryb');
  });

  it('l\'absente a déjà joué : refus, rien d\'écrit', async () => {
    const { sb, tables } = base();
    tables.tn_matches[0].winner_id = 'ryb';
    tables.tn_matches[0].status = 'finished';
    const r = await appliquerRemplacementsMasters(sb, T, recus, true);
    expect(r.ecrit).toBe(false);
    expect(r.erreurs[0]).toContain('a déjà joué');
    expect(tables.tn_matches[1].player2_id).toBe('ryb');
  });

  it('remplaçante absente de notre base : refus avec message, rien d\'écrit', async () => {
    const { sb, tables } = base();
    tables.tn_players = tables.tn_players.filter((p) => p.id !== 'kos');
    const r = await appliquerRemplacementsMasters(sb, T, recus, true);
    expect(r.ecrit).toBe(false);
    expect(r.erreurs[0]).toContain('Kostyuk');
    expect(r.erreurs[0]).toContain('ajoute-la');
    expect(tables.tn_matches[0].player1_id).toBe('ryb');
  });
});
