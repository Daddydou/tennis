// @vitest-environment node
/**
 * Pont bracket de Thomas -> tn_bracket_round_picks — db/bracketExternePont.ts.
 * Base simulée EN MÉMOIRE (select/eq/in/maybeSingle, insert, update par id ;
 * delete interdit) : on vérifie ce qui est réellement écrit, et que rejouer
 * la même synchro ne change plus rien.
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BracketThomas } from '@/lib/thomasApi';
import { pontVersRoundPicks } from '../bracketExternePont';

type Ligne = Record<string, unknown>;

function fausseBase(tables: Record<string, Ligne[]>) {
  const ecritures: { table: string; op: string; n: number }[] = [];
  let compteur = 0;

  const requete = (table: string) => {
    const filtres: ((l: Ligne) => boolean)[] = [];
    const lignes = () => (tables[table] ?? []).filter((l) => filtres.every((f) => f(l)));
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => (filtres.push((l) => l[c] === v), q),
      in: (c: string, vs: unknown[]) => (filtres.push((l) => vs.includes(l[c])), q),
      maybeSingle: async () => ({ data: lignes()[0] ?? null, error: null }),
      then: (ok: (r: { data: Ligne[]; error: null }) => unknown) => Promise.resolve({ data: lignes(), error: null }).then(ok),
    };
    return q;
  };

  const sb = {
    from: (table: string) => ({
      select: () => requete(table),
      insert: async (rows: Ligne[]) => {
        ecritures.push({ table, op: 'insert', n: rows.length });
        (tables[table] ??= []).push(...rows.map((r) => ({ id: `n${++compteur}`, ...r })));
        return { error: null };
      },
      update: (patch: Ligne) => ({
        eq: async (c: string, v: unknown) => {
          ecritures.push({ table, op: 'update', n: 1 });
          for (const l of tables[table] ?? []) if (l[c] === v) Object.assign(l, patch);
          return { error: null };
        },
      }),
      delete: () => {
        throw new Error('delete interdit');
      },
      upsert: () => {
        throw new Error('upsert non attendu ici');
      },
    }),
  } as unknown as SupabaseClient;
  return { sb, tables, ecritures };
}

const INTERNE = 'tournoi-interne';
const NOMS = ['Alpha', 'Bravo', 'Charlie', 'Delta'];

function bracket(verrouille = true): BracketThomas {
  const p = (userId: string, position: number | null) => ({ userId, position, resultat: 'en_attente' as const, joueurAbsent: false });
  return {
    jeu: 'bracket',
    jeuTennis: 'tennis',
    tournoi: {
      id: 'thomas-1', nom: 'Test', tour: 'ATP', annee: 2026, type: 'ATP_250', surface: 'HARD', lieu: 'Ici',
      drawSize: 4, statut: 'EN_COURS', verrouille, lockAt: null,
    },
    participants: [
      { userId: 'u-daddy', pseudo: 'Daddy', rempli: true, pointsTotaux: 0 },
      { userId: 'u-laki', pseudo: 'Laki', rempli: true, pointsTotaux: 0 },
      { userId: 'u-moust', pseudo: 'moustiton', rempli: true, pointsTotaux: 0 },
    ],
    joueurs: NOMS.map((n, i) => ({
      position: i + 1, prenom: `${n}o`, nom: n.toUpperCase(), tete: null, statut: null, pays: null, classement: null, apiPlayerId: null,
    })),
    tours: [
      {
        tour: 1, nom: 'Demies', statut: 'A_VENIR',
        matchs: [
          { index: 0, position1: 1, position2: 2, vainqueur: null, score: null, pronostics: [p('u-daddy', 1), p('u-laki', 2), p('u-moust', 1)] },
          { index: 1, position1: 3, position2: 4, vainqueur: null, score: null, pronostics: [p('u-daddy', 3), p('u-laki', 4), p('u-moust', null)] },
        ],
      },
      {
        tour: 2, nom: 'Finale', statut: 'A_VENIR',
        matchs: [{ index: 0, position1: null, position2: null, vainqueur: null, score: null, pronostics: [p('u-daddy', 1), p('u-laki', 4), p('u-moust', 1)] }],
      },
    ],
  };
}

function base(lien: string | null = INTERNE, roundPicks: Ligne[] = []) {
  return fausseBase({
    tn_bracket_externe_tournois: [{ id: 'thomas-1', tournament_id_interne: lien }],
    tn_tournaments: [{ id: INTERNE, rounds: ['SF', 'F'] }],
    tn_matches: [
      { tournament_id: INTERNE, round: 'SF', position: 0, player1_id: 'j1', player2_id: 'j2' },
      { tournament_id: INTERNE, round: 'SF', position: 1, player1_id: 'j3', player2_id: 'j4' },
      { tournament_id: INTERNE, round: 'F', position: 0, player1_id: null, player2_id: null },
    ],
    tn_players: NOMS.map((n, i) => ({ id: `j${i + 1}`, name: `${n[0]}. ${n}` })),
    tn_participants: [
      { id: 'id-laki', name: 'Laki' },
      { id: 'id-thomas', name: 'Thomas' },
    ],
    tn_bracket_round_picks: roundPicks,
  });
}

const resume = (rows: Ligne[]) =>
  rows
    .map((r) => `${r.participant_id ?? 'moi'} ${r.round}|${r.position}=${r.player_id}`)
    .sort();

describe('pontVersRoundPicks', () => {
  it('écrit les pronostics des trois stocks, aux bons emplacements', async () => {
    const { sb, tables } = base();
    const r = await pontVersRoundPicks(sb, sb, bracket());
    expect(r).toMatchObject({ statut: 'ok', ecrit: true, inseres: 8, modifies: 0, identiques: 0, sansPronostic: 1 });
    expect(resume(tables.tn_bracket_round_picks)).toEqual([
      'id-laki F|0=j4', 'id-laki SF|0=j2', 'id-laki SF|1=j4',
      'id-thomas F|0=j1', 'id-thomas SF|0=j1',
      'moi F|0=j1', 'moi SF|0=j1', 'moi SF|1=j3',
    ]);
    expect(tables.tn_bracket_round_picks.every((l) => l.tournament_id === INTERNE)).toBe(true);
  });

  it('idempotent : la deuxième synchro n’écrit plus rien et ne change rien', async () => {
    const { sb, tables, ecritures } = base();
    await pontVersRoundPicks(sb, sb, bracket());
    const apres1 = structuredClone(tables.tn_bracket_round_picks);
    const n1 = ecritures.length;

    const r2 = await pontVersRoundPicks(sb, sb, bracket());
    expect(r2).toMatchObject({ statut: 'ok', inseres: 0, modifies: 0, identiques: 8, ecarts: [] });
    expect(ecritures.length).toBe(n1);
    expect(tables.tn_bracket_round_picks).toEqual(apres1);
  });

  it('écart avec une saisie manuelle : signalé, jamais écrasé ; --ecraser le remplace', async () => {
    const manuelle = { id: 'm1', tournament_id: INTERNE, participant_id: 'id-laki', round: 'F', position: 0, player_id: 'j2' };
    const autre = { id: 'm2', tournament_id: INTERNE, participant_id: null, round: 'SF', position: 9, player_id: 'j9' };
    const { sb, tables } = base(INTERNE, [manuelle, autre]);

    const r = await pontVersRoundPicks(sb, sb, bracket());
    if (r.statut !== 'ok') throw new Error(r.statut);
    expect(r.ecarts).toEqual([
      expect.objectContaining({ stock: 'Laki', round: 'F', position: 0, nomInterne: 'B. Bravo', nomThomas: 'D. Delta' }),
    ]);
    expect(tables.tn_bracket_round_picks.find((l) => l.id === 'm1')?.player_id).toBe('j2');

    const r2 = await pontVersRoundPicks(sb, sb, bracket(), { ecraser: true });
    expect(r2).toMatchObject({ statut: 'ok', inseres: 0, modifies: 1 });
    expect(tables.tn_bracket_round_picks.find((l) => l.id === 'm1')?.player_id).toBe('j4');
    // Jamais de suppression : la ligne hors API est toujours là.
    expect(tables.tn_bracket_round_picks.find((l) => l.id === 'm2')).toEqual(autre);
  });

  it('tournament_id_interne NULL : message clair, aucune lecture interne ni écriture', async () => {
    const { sb, ecritures } = base(null);
    const r = await pontVersRoundPicks(sb, sb, bracket());
    expect(r.statut).toBe('sans_lien');
    expect(ecritures).toEqual([]);
  });

  it('non verrouillé : rien n’est écrit', async () => {
    const { sb, ecritures } = base();
    expect((await pontVersRoundPicks(sb, sb, bracket(false))).statut).toBe('non_verrouille');
    expect(ecritures).toEqual([]);
  });

  it('aperçu (écriture null) : même résumé, rien d’écrit', async () => {
    const { sb, ecritures } = base();
    const r = await pontVersRoundPicks(sb, null, bracket());
    expect(r).toMatchObject({ statut: 'ok', ecrit: false, inseres: 8 });
    expect(ecritures).toEqual([]);
  });

  it('tableaux non superposables : refus, rien d’écrit', async () => {
    const { sb, tables, ecritures } = base();
    tables.tn_matches[0] = { ...tables.tn_matches[0], player1_id: 'j2', player2_id: 'j1' };
    const r = await pontVersRoundPicks(sb, sb, bracket());
    expect(r.statut).toBe('refuse');
    expect(ecritures).toEqual([]);
  });
});
