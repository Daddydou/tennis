/**
 * TESTS — paliers Fantasy datés (lib/fantasyRegles.ts `compositionPour`).
 *
 * Les paliers hors Grand Chelem ont changé le 2026-09-28. L'équipe n'étant
 * jamais stockée (recomposée à chaque affichage, import et backfill), ce test
 * garantit que :
 *   - un tournoi passé (start_date < 2026-09-28, ou sans date) garde
 *     EXACTEMENT les paliers, l'équipe et le score d'avant le changement ;
 *   - un tournoi à partir du 2026-09-28 utilise Top 20 / 21-40 / 41-70 / 71+ ;
 *   - le Grand Chelem ne change pas.
 *
 * Node pur (aucun React, aucun Supabase) : `npm run test:fantasy-paliers`.
 */
import {
  baremeTournoi,
  composerEquipe,
  compositionPour,
  detailReelJoueur,
  totalEquipe,
  type CandidatFantasy,
  type FamilleFantasy,
  type Palier,
} from '../lib/fantasy.ts';
import type { Match, MatchPlayer } from '../lib/types.ts';

let echecs = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    echecs++;
    console.error('ÉCHEC:', msg);
  } else {
    console.log('ok:', msg);
  }
}

/** Réduit des paliers à leurs bornes, pour comparer sans les libellés. */
const bornes = (ps: Palier[]) => ps.map((p) => [p.numero, p.rangMin, p.rangMax]);
const memes = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * COPIE LITTÉRALE des paliers tels qu'ils étaient AVANT ce changement
 * (lib/fantasyRegles.ts, commit f690678). Volontairement recopiés ici et non
 * importés : c'est la référence figée contre laquelle l'historique est vérifié.
 */
const AVANT: Record<FamilleFantasy, [number, number, number | null][]> = {
  GC: [[1, 1, 10], [2, 11, 20], [3, 21, 40], [4, 41, 70], [5, 71, null]],
  M1000: [[1, 1, 10], [2, 11, 30], [3, 31, null], [4, 31, null]],
  AUTRE: [[1, 1, 10], [2, 11, 30], [3, 31, null], [4, 31, null]],
};
const NOUVEAU_HORS_GC: [number, number, number | null][] = [
  [1, 1, 20], [2, 21, 40], [3, 41, 70], [4, 71, null],
];
const versPaliers = (b: [number, number, number | null][]): Palier[] =>
  b.map(([numero, rangMin, rangMax]) => ({ numero, rangMin, rangMax, libelle: '' }));

const FAMILLES: FamilleFantasy[] = ['GC', 'M1000', 'AUTRE'];
const DATES_PASSEES = ['2025-12-29', '2026-09-21', '2026-09-27', null, undefined, '', 'n/a'];
const DATES_FUTURES = ['2026-09-28', '2026-09-28T00:00:00+00:00', '2026-10-05', '2027-01-12'];

// ── Bornes : passé inchangé, futur au nouveau découpage, GC fixe ──
{
  for (const f of FAMILLES) {
    for (const d of DATES_PASSEES) {
      assert(memes(bornes(compositionPour(f, d)), AVANT[f]), `${f} / ${String(d)} : bornes d'avant, à l'identique`);
    }
    for (const d of DATES_FUTURES) {
      const attendu = f === 'GC' ? AVANT.GC : NOUVEAU_HORS_GC;
      assert(memes(bornes(compositionPour(f, d)), attendu), `${f} / ${d} : ${f === 'GC' ? 'GC inchangé' : 'Top 20 / 21-40 / 41-70 / 71+'}`);
    }
  }
  const libelles = compositionPour('AUTRE', '2026-09-28').map((p) => p.libelle);
  assert(memes(libelles, ['1 à 20', '21 à 40', '41 à 70', '71 et au-delà']), `libellés affichés : ${libelles.join(' | ')}`);
}

// ── Équipe et score réels sur un mini-tableau (8 joueurs, QF → F) ──
//
// Rangs et espérances choisis pour que les deux découpages donnent des
// équipes DIFFÉRENTES — sans quoi le test ne prouverait rien.
const joueurs: { id: string; rang: number; eTotal: number }[] = [
  { id: 'a', rang: 5, eTotal: 10 },
  { id: 'b', rang: 15, eTotal: 30 },
  { id: 'g', rang: 12, eTotal: 5 },
  { id: 'c', rang: 25, eTotal: 20 },
  { id: 'd', rang: 35, eTotal: 25 },
  { id: 'e', rang: 50, eTotal: 15 },
  { id: 'h', rang: 60, eTotal: 8 },
  { id: 'f', rang: 80, eTotal: 3 },
];
const candidats: CandidatFantasy[] = joueurs.map((j) => ({ playerId: j.id, rang: j.rang, eTotal: j.eTotal }));

const mp = (id: string, winner: boolean): MatchPlayer => ({
  id, name: id, seed: null, country: null, isBye: false, winner,
  sets: winner ? [{ games: 6, tiebreak: null }, { games: 6, tiebreak: null }] : [{ games: 4, tiebreak: null }, { games: 4, tiebreak: null }],
});
const match = (round: string, position: number, gagnant: string, perdant: string): Match => ({
  matchId: `${round}-${position}`, round, roundLabel: round, position,
  half: position <= 2 ? 'top' : 'bottom', status: 'completed',
  players: [mp(gagnant, true), mp(perdant, false)],
});
const rounds = ['QF', 'SF', 'F'];
const matches: Match[] = [
  match('QF', 1, 'b', 'a'), match('QF', 2, 'd', 'c'),
  match('QF', 3, 'e', 'f'), match('QF', 4, 'g', 'h'),
  match('SF', 1, 'b', 'd'), match('SF', 2, 'e', 'g'),
  match('F', 1, 'b', 'e'),
];

const equipe = (paliers: Palier[]) => composerEquipe(paliers, candidats);
const ids = (ps: Palier[]) => equipe(ps).map((m) => m.playerId);
const scoreReel = (famille: FamilleFantasy, ps: Palier[]) =>
  equipe(ps).reduce(
    (s, m) => s + (m.playerId ? detailReelJoueur(matches, m.playerId, rounds, baremeTournoi(famille, rounds.length)).total : 0),
    0,
  );

for (const f of ['M1000', 'AUTRE'] as const) {
  const avant = versPaliers(AVANT[f]);
  const passe = compositionPour(f, '2026-09-21');
  const futur = compositionPour(f, '2026-09-28');

  assert(memes(ids(passe), ids(avant)), `${f} passé : même équipe qu'avant (${ids(passe).join(',')})`);
  assert(memes(ids(passe), ['a', 'b', 'd', 'e']), `${f} passé : équipe attendue a,b,d,e (1-10, 11-30, 31+, 31+)`);
  assert(totalEquipe(equipe(passe)) === totalEquipe(equipe(avant)), `${f} passé : même espérance d'équipe (${totalEquipe(equipe(passe))})`);
  assert(scoreReel(f, passe) === scoreReel(f, avant), `${f} passé : même score réel (${scoreReel(f, passe)})`);

  assert(memes(ids(futur), ['b', 'd', 'e', 'f']), `${f} à venir : équipe b,d,e,f (Top 20, 21-40, 41-70, 71+) — obtenu ${ids(futur).join(',')}`);
  assert(!memes(ids(futur), ids(passe)), `${f} : le mini-tableau distingue bien les deux découpages`);
}

{
  const passe = compositionPour('GC', '2026-09-21');
  const futur = compositionPour('GC', '2026-09-28');
  assert(memes(ids(passe), ids(futur)), 'GC : même équipe avant et après la date d’effet');
}

if (echecs > 0) {
  console.error(`\n${echecs} test(s) en échec.`);
  process.exit(1);
}
console.log('\nTOUS LES TESTS PASSENT');
