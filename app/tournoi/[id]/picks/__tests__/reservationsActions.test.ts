/**
 * Server Action des réservations du plan (tn_plan_reservations) : session
 * exigée, contrôles AVANT toute écriture, remplacement complet du stock.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ valide: true }));
const appels = vi.hoisted(() => ({ ops: [] as string[], insere: [] as unknown[] }));

vi.mock('@/auth/garde', () => ({ sessionValide: async () => session.valide }));
vi.mock('@/db/server', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      delete: () => {
        appels.ops.push(`delete:${table}`);
        const q = { eq: () => q, is: () => q, then: (r: (v: { error: null }) => void) => r({ error: null }) };
        return q;
      },
      insert: async (lignes: unknown[]) => {
        appels.ops.push(`insert:${table}`);
        appels.insere.push(...lignes);
        return { error: null };
      },
    }),
  }),
}));

import { enregistrerReservations } from '../reservationsActions';

beforeEach(() => {
  session.valide = true;
  appels.ops = [];
  appels.insere = [];
});

describe('enregistrerReservations', () => {
  it('refuse sans session, sans rien écrire', async () => {
    session.valide = false;
    const r = await enregistrerReservations('t', null, [{ round: 'R16', half: 'top', playerId: 'p1' }]);
    expect(r.ok).toBe(false);
    expect(appels.ops).toEqual([]);
  });

  it('refuse un joueur réservé deux fois, sans rien écrire', async () => {
    const r = await enregistrerReservations('t', null, [
      { round: 'R16', half: 'top', playerId: 'p1' },
      { round: 'QF', half: 'top', playerId: 'p1' },
    ]);
    expect(r.ok).toBe(false);
    expect(appels.ops).toEqual([]);
  });

  it('refuse un slot réservé deux fois, sans rien écrire', async () => {
    const r = await enregistrerReservations('t', null, [
      { round: 'R16', half: 'top', playerId: 'p1' },
      { round: 'R16', half: 'top', playerId: 'p2' },
    ]);
    expect(r.ok).toBe(false);
    expect(appels.ops).toEqual([]);
  });

  it('remplace les réservations du stock : effacement puis insertion', async () => {
    const r = await enregistrerReservations('t', 'laki', [{ round: 'SF', half: null, playerId: 'p9' }]);
    expect(r.ok).toBe(true);
    expect(appels.ops).toEqual(['delete:tn_plan_reservations', 'insert:tn_plan_reservations']);
    expect(appels.insere).toEqual([
      { tournament_id: 't', participant_id: 'laki', round: 'SF', half: null, player_id: 'p9' },
    ]);
  });

  it('une liste vide efface sans insérer', async () => {
    const r = await enregistrerReservations('t', null, []);
    expect(r.ok).toBe(true);
    expect(appels.ops).toEqual(['delete:tn_plan_reservations']);
  });
});
