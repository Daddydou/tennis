// @vitest-environment node
/**
 * ÉQUIPE FIGÉE À LA PREMIÈRE ÉCRITURE — db/fantasy-historique.ts
 *
 * Un second calcul avec d'autres espérances (Elo mis à jour) ne doit changer
 * ni la composition ni `e_predit` d'une ligne existante : seuls les points
 * réels, `score_reel` et `termine` avancent. Le volet propre, une fois écrit,
 * n'est jamais écrasé.
 *
 * Supabase est remplacé par une table en mémoire : on teste la règle
 * d'écriture, pas le réseau.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fantasy } from '../fantasy-cache';
import type { EngineInput } from '../projections';
import type { Match, MatchPlayer, Player } from '@/lib/types';
import { detailReelJoueur } from '@/lib/fantasy';

/* ---------------------- tn_fantasy_historique en mémoire ------------------- */

type Ligne = Record<string, unknown>;
const table = new Map<string, Ligne>();

function requete() {
  const filtres: [string, 'eq' | 'is', unknown][] = [];
  let action: { type: 'select' } | { type: 'update'; valeurs: Ligne } = { type: 'select' };
  const correspond = (l: Ligne) =>
    filtres.every(([col, op, v]) => (op === 'eq' ? l[col] === v : (l[col] ?? null) === v));
  const executer = () => {
    if (action.type === 'update') {
      for (const [id, l] of table) if (correspond(l)) table.set(id, { ...l, ...action.valeurs });
    }
    return { data: null, error: null };
  };
  const q = {
    select: () => q,
    update: (valeurs: Ligne) => ((action = { type: 'update', valeurs }), q),
    upsert: (valeurs: Ligne) => {
      const id = valeurs.tournament_id as string;
      table.set(id, { ...(table.get(id) ?? {}), ...valeurs });
      return Promise.resolve({ data: null, error: null });
    },
    eq: (col: string, v: unknown) => (filtres.push([col, 'eq', v]), q),
    is: (col: string, v: unknown) => (filtres.push([col, 'is', v]), q),
    maybeSingle: () =>
      Promise.resolve({ data: [...table.values()].find(correspond) ?? null, error: null }),
    then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) =>
      Promise.resolve(executer()).then(ok, ko),
  };
  return q;
}
const client = { from: () => requete() };

vi.mock('@/db/server', () => ({ supabaseAdmin: () => client }));
vi.mock('@/db/anon', () => ({ supabaseAnon: () => client }));

const {
  enregistrerAnterieur,
  enregistrerHistorique,
  equipeEvaluee,
  equipeEvalueeFigee,
} = await import('../fantasy-historique');
const { contexteFantasy } = await import('../fantasy-cache');

/* --------------------------------- Tableau --------------------------------- */

const ROUNDS = ['QF', 'SF', 'F'];
const RANGS: Record<string, number> = { a: 3, b: 15, c: 40, d: 50, e: 8, f: 25, g: 60, h: 70 };

const joueur = (id: string): Player => ({
  id, tour: 'ATP', name: id.toUpperCase(), country: null, rank: RANGS[id], seed: null,
  half: 'top', eloOverall: 1800, eloHard: 1800, eloClay: 1800, eloGrass: 1800,
});

const cote = (id: string | null, gagne: boolean, joue: boolean): MatchPlayer => ({
  id, name: id ?? '', seed: null, country: null, isBye: false, winner: joue && gagne,
  sets: joue
    ? [{ games: gagne ? 6 : 3, tiebreak: null }, { games: gagne ? 6 : 4, tiebreak: null }]
    : [],
});

/** `gagnant` null = match pas encore joué. */
function match(round: string, position: number, p1: string | null, p2: string | null, gagnant: string | null): Match {
  const joue = gagnant !== null;
  return {
    matchId: null, round, roundLabel: round, position, half: position < 2 ? 'top' : 'bottom',
    status: joue ? 'completed' : 'scheduled',
    players: [cote(p1, gagnant === p1, joue), cote(p2, gagnant === p2, joue)],
  };
}

const tournoi = {
  id: 't1', external_id: null, slug: 'test', name: 'Test 2026', tour: 'ATP' as const,
  category: 'ATP250', surface: 'hard' as const, draw_size: 8, best_of: 3, year: 2026,
  start_date: '2026-08-17', status: 'running' as const, rounds: ROUNDS, created_at: null,
};
const players = Object.fromEntries(Object.keys(RANGS).map((id) => [id, joueur(id)]));

/** Premier import : seuls les quarts sont joués. */
const engine1: EngineInput = {
  tournament: tournoi,
  players,
  matches: [
    match('QF', 0, 'a', 'b', 'a'), match('QF', 1, 'c', 'd', 'c'),
    match('QF', 2, 'e', 'f', 'e'), match('QF', 3, 'g', 'h', 'h'),
    match('SF', 0, 'a', 'c', null), match('SF', 1, 'e', 'h', null),
    match('F', 0, null, null, null),
  ],
};

/** Import suivant : tableau terminé. */
const engine2: EngineInput = {
  tournament: { ...tournoi, status: 'completed' },
  players,
  matches: [
    ...engine1.matches.filter((m) => m.round === 'QF'),
    match('SF', 0, 'a', 'c', 'c'), match('SF', 1, 'e', 'h', 'h'),
    match('F', 0, 'c', 'h', 'h'),
  ],
};

const fantasy = (e: Record<string, number>): Fantasy => ({
  tirage: 'QF', ...contexteFantasy(tournoi),
  joueurs: Object.fromEntries(
    Object.entries(e).map(([playerId, eTotal]) => [playerId, { playerId, eTotal, detail: [] }]),
  ),
});
/** Elo du premier calcul : a, b, c, d en tête de leur palier. */
const fantasy1 = fantasy({ a: 90, b: 70, c: 60, d: 55, e: 80, f: 50, g: 20, h: 10 });
/** Elo mis à jour : e, f, g, h passent devant — une autre équipe serait optimale. */
const fantasy2 = fantasy({ a: 40, b: 30, c: 20, d: 15, e: 95, f: 85, g: 75, h: 70 });

/** Équipe propre : a (perd en demie) et h (gagne le tournoi). */
const equipePropre = [
  { palier: 1, playerId: 'a', nom: 'A', rang: 3, ePoints: 61, reel: 0 },
  { palier: 2, playerId: null, nom: null, rang: null, ePoints: 0, reel: 0 },
  { palier: 3, playerId: 'h', nom: 'H', rang: 70, ePoints: 50, reel: 0 },
];
const anterieurA = { releveLe: '2026-08-10', ePredit: 111, reel: 22, joueursSansElo: 1, equipe: equipePropre };
const anterieurB = { releveLe: '2026-08-31', ePredit: 999, reel: 99, joueursSansElo: 7, equipe: [] };

const ids = (equipe: unknown) => (equipe as { playerId: string | null }[]).map((m) => m.playerId);

beforeEach(() => table.clear());

describe('enregistrerHistorique — équipe figée', () => {
  it('le second Elo composerait une autre équipe (le test a un sens)', () => {
    expect(ids(equipeEvaluee(engine2, fantasy2).membres)).not.toEqual(
      ids(equipeEvaluee(engine1, fantasy1).membres),
    );
  });

  it('un second appel avec un autre Elo garde équipe et e_predit, avance réel et termine', async () => {
    const premier = equipeEvaluee(engine1, fantasy1);
    expect(await enregistrerHistorique(engine1, premier, anterieurA)).toEqual({ ok: true });
    const avant = structuredClone(table.get('t1')!);
    expect(avant.termine).toBe(false);

    expect(
      await enregistrerHistorique(engine2, equipeEvaluee(engine2, fantasy2), anterieurB),
    ).toEqual({ ok: true });
    const apres = table.get('t1')!;

    expect(ids(apres.equipe)).toEqual(ids(avant.equipe));
    expect(apres.e_predit).toBe(avant.e_predit);
    const ePoints = (l: Ligne) => (l.equipe as { ePoints: number }[]).map((m) => m.ePoints);
    expect(ePoints(apres)).toEqual(ePoints(avant));

    // Points réels de la MÊME équipe, recalculés sur le tableau complet.
    const attendu = equipeEvaluee(engine2, fantasy1);
    expect(ids(attendu.membres)).toEqual(ids(avant.equipe));
    expect(apres.score_reel).toBeCloseTo(attendu.reelTotal, 9);
    expect(apres.score_reel).not.toBe(avant.score_reel);
    expect(apres.termine).toBe(true);
    expect(apres.computed_at).not.toBe(undefined);

    // Volet propre : composition et prédiction figées, le second volet est
    // ignoré ; seuls ses points réels suivent les résultats.
    for (const col of ['e_predit_anterieur', 'elo_releve_le', 'joueurs_sans_elo']) {
      expect(apres[col]).toEqual(avant[col]);
    }
    expect(apres.e_predit_anterieur).toBe(111);
    const propre = (l: Ligne) => l.equipe_anterieure as typeof equipePropre;
    const sansReel = (l: Ligne) => propre(l).map((m) => ({ ...m, reel: null }));
    expect(sansReel(apres)).toEqual(sansReel(avant));
    const reel = (id: string) =>
      detailReelJoueur(engine2.matches, id, ROUNDS, contexteFantasy(tournoi).bareme).total;
    expect(propre(apres).map((m) => m.reel)).toEqual([reel('a'), 0, reel('h')]);
    expect(apres.score_reel_anterieur).toBeCloseTo(reel('a') + reel('h'), 9);
    expect(apres.score_reel_anterieur).not.toBe(avant.score_reel_anterieur);
  });

  it('volet propre absent à la première écriture : écrit au suivant, puis plus jamais', async () => {
    await enregistrerHistorique(engine1, equipeEvaluee(engine1, fantasy1));
    expect(table.get('t1')!.e_predit_anterieur ?? null).toBe(null);

    await enregistrerHistorique(engine1, equipeEvaluee(engine1, fantasy2), anterieurA);
    expect(table.get('t1')!.e_predit_anterieur).toBe(111);

    await enregistrerHistorique(engine2, equipeEvaluee(engine2, fantasy2), anterieurB);
    expect(table.get('t1')!.e_predit_anterieur).toBe(111);
    expect(table.get('t1')!.elo_releve_le).toBe('2026-08-10');
    expect(table.get('t1')!.joueurs_sans_elo).toBe(1);
  });

  it('enregistrerAnterieur ne remplit que un volet propre NULL', async () => {
    await enregistrerHistorique(engine2, equipeEvaluee(engine2, fantasy1));
    await enregistrerAnterieur('t1', anterieurA);
    expect(table.get('t1')!.e_predit_anterieur).toBe(111);
    await enregistrerAnterieur('t1', anterieurB);
    expect(table.get('t1')!.e_predit_anterieur).toBe(111);
    expect(table.get('t1')!.score_reel_anterieur).toBe(22);
  });

  it("l'écran lit l'équipe stockée dès qu'une ligne existe", async () => {
    // Sans ligne : composition optimale sur le cache courant.
    expect(ids((await equipeEvalueeFigee(engine2, fantasy2)).membres)).toEqual(
      ids(equipeEvaluee(engine2, fantasy2).membres),
    );

    await enregistrerHistorique(engine1, equipeEvaluee(engine1, fantasy1));
    const affichee = await equipeEvalueeFigee(engine2, fantasy2);
    expect(ids(affichee.membres)).toEqual(ids(table.get('t1')!.equipe));
    expect(affichee.eTotal).toBe(table.get('t1')!.e_predit);
    expect(affichee.reelTotal).toBeCloseTo(equipeEvaluee(engine2, fantasy1).reelTotal, 9);
    expect(affichee.termine).toBe(true);
  });
});
