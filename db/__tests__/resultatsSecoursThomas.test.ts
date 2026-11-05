// @vitest-environment node
/**
 * Écriture des résultats de secours (db/resultatsSecoursThomas.ts) sur un faux client Supabase :
 * les écritures sont conditionnelles (`winner_id is null`, place suivante vide), rejouer ne change rien.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { BracketThomas, MatchThomas } from '@/lib/thomasApi';
import { reprendreResultatsThomas } from '../resultatsSecoursThomas';

type Ligne = Record<string, unknown>;

/** Faux client : select / eq / is / in / update(...).select(), assez pour ce module. */
function faux(tables: Record<string, Ligne[]>) {
  const ecritures: { table: string; patch: Ligne; lignes: number }[] = [];
  const from = (table: string) => {
    const filtres: ((l: Ligne) => boolean)[] = [];
    let patch: Ligne | null = null;
    const correspond = () => tables[table].filter((l) => filtres.every((f) => f(l)));
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (k: string, v: unknown) => (filtres.push((l) => l[k] === v), b),
      is: (k: string, v: unknown) => (filtres.push((l) => l[k] === v), b),
      in: (k: string, vs: unknown[]) => (filtres.push((l) => vs.includes(l[k])), b),
      update: (p: Ligne) => ((patch = p), b),
      maybeSingle: async () => ({ data: correspond()[0] ?? null, error: null }),
      then: (ok: (r: { data: Ligne[]; error: null }) => unknown) => {
        const cibles = correspond();
        if (patch) {
          for (const l of cibles) Object.assign(l, patch);
          ecritures.push({ table, patch, lignes: cibles.length });
        }
        return Promise.resolve({ data: cibles, error: null }).then(ok);
      },
    };
    return b;
  };
  return { sb: { from } as unknown as SupabaseClient, ecritures };
}

const NOMS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];

function base() {
  const matchs: Ligne[] = [
    ...[0, 1, 2, 3].map((i) => ({
      tournament_id: 'T', round: 'QF', position: i, player1_id: `j${2 * i + 1}`, player2_id: `j${2 * i + 2}`, status: 'scheduled', winner_id: null, sets: [],
    })),
    { tournament_id: 'T', round: 'SF', position: 0, player1_id: null, player2_id: null, status: 'scheduled', winner_id: null, sets: [] },
    { tournament_id: 'T', round: 'SF', position: 1, player1_id: null, player2_id: null, status: 'scheduled', winner_id: null, sets: [] },
  ];
  return faux({
    tn_tournaments: [{ id: 'T', rounds: ['QF', 'SF', 'F'] }],
    tn_matches: matchs,
    tn_players: NOMS.map((n, i) => ({ id: `j${i + 1}`, name: `${n[0]}. ${n}` })),
  });
}

const mt = (index: number, v: number | null, score: string | null): MatchThomas => ({
  index, position1: 2 * index + 1, position2: 2 * index + 2, vainqueur: v, score, pronostics: [],
});

function bracket(qf: [number | null, string | null][]): BracketThomas {
  return {
    jeu: 'bracket', jeuTennis: 'tennis',
    tournoi: { id: 't', nom: 'Test', tour: 'ATP', annee: 2026, type: 'ATP_500', surface: 'HARD', lieu: 'Ici', drawSize: 8, statut: 'EN_COURS', verrouille: true, lockAt: null },
    participants: [],
    joueurs: NOMS.map((n, i) => ({ position: i + 1, prenom: `${n[0]}${n.slice(1).toLowerCase()}a`, nom: n.toUpperCase(), tete: null, statut: null, pays: null, classement: null, apiPlayerId: `a${i}` })),
    tours: [
      { tour: 1, nom: 'Quarts', statut: 'EN_COURS', matchs: qf.map(([v, s], i) => mt(i, v, s)) },
      { tour: 2, nom: 'Demies', statut: 'A_VENIR', matchs: [mt(0, null, null), mt(1, null, null)] },
      { tour: 3, nom: 'Finale', statut: 'A_VENIR', matchs: [mt(0, null, null)] },
    ],
  };
}

describe('reprendreResultatsThomas', () => {
  const thomas = bracket([[null, null], [4, '6-3 6-4'], [null, null], [null, null]]);

  it('écrit le vainqueur, les sets et fait avancer le vainqueur dans la demie', async () => {
    const { sb, ecritures } = base();
    const r = await reprendreResultatsThomas(sb, 'T', thomas);
    if ('erreurs' in r) throw new Error(r.erreurs.join('\n'));
    expect(r.repris).toEqual([{ round: 'QF', position: 1, vainqueur: 'D. Delta', perdant: 'C. Charlie' }]);
    expect(r.avances).toBe(1);
    expect(r.ecrit).toBe(true);
    expect(ecritures[0].patch).toMatchObject({ winner_id: 'j4', status: 'completed' });
    expect(ecritures[1].patch).toMatchObject({ player2_id: 'j4' });
  });

  it('rejouer ne change rien (le match a maintenant un vainqueur)', async () => {
    const { sb, ecritures } = base();
    await reprendreResultatsThomas(sb, 'T', thomas);
    const avant = ecritures.length;
    const r2 = await reprendreResultatsThomas(sb, 'T', thomas);
    if ('erreurs' in r2) throw new Error(r2.erreurs.join('\n'));
    expect(r2.repris).toEqual([]);
    expect(ecritures).toHaveLength(avant);
  });

  it('une place déjà occupée dans le match suivant n\'est pas écrasée', async () => {
    const { sb, ecritures } = base();
    // La demie 0 a déjà un joueur 2 (import officiel passé avant).
    const sf = (await (sb.from('tn_matches') as unknown as { eq: (k: string, v: unknown) => { eq: (k: string, v: unknown) => PromiseLike<{ data: Ligne[] }> } })
      .eq('round', 'SF').eq('position', 0)).data[0];
    sf.player2_id = 'j3';
    const r = await reprendreResultatsThomas(sb, 'T', thomas);
    if ('erreurs' in r) throw new Error(r.erreurs.join('\n'));
    expect(r.repris).toHaveLength(1);
    expect(r.avances).toBe(0);
    expect(sf.player2_id).toBe('j3');
    expect(ecritures.filter((e) => 'player2_id' in e.patch && e.lignes > 0)).toHaveLength(0);
  });

  it('aperçu (ecrire: false) : annonce ce qui serait repris, n\'écrit rien', async () => {
    const { sb, ecritures } = base();
    const r = await reprendreResultatsThomas(sb, 'T', thomas, false);
    if ('erreurs' in r) throw new Error(r.erreurs.join('\n'));
    expect(r.repris).toHaveLength(1);
    expect(r.ecrit).toBe(false);
    expect(ecritures).toEqual([]);
  });

  it('tournoi interne introuvable : erreur claire', async () => {
    const { sb } = base();
    const r = await reprendreResultatsThomas(sb, 'AUTRE', thomas);
    expect('erreurs' in r).toBe(true);
  });
});
