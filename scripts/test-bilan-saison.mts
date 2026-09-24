/**
 * TESTS — bilan de saison (lib/bilanSaison.ts).
 *
 * Node pur (aucun React, aucun Supabase), même convention que
 * scripts/test-bracketsim.mts : `npm run test:bilan-saison`.
 */
import {
  bilanFantasy,
  cumulSaison,
  joueursLesPlusRentables,
  joueursLesPlusVictorieux,
  progressionsElo,
} from '../lib/bilanSaison.ts';

let echecs = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    echecs++;
    console.error('ÉCHEC:', msg);
  } else {
    console.log('ok:', msg);
  }
}

// ── Progression Elo ──
{
  const b = progressionsElo([
    { slug: 'a', nom: 'Alpha', releveLe: '2026-08-10', elo: 2000 },
    { slug: 'a', nom: 'Alpha', releveLe: '2026-07-27', elo: 1950 },
    { slug: 'a', nom: 'Alpha', releveLe: '2026-09-14', elo: 2030 },
    { slug: 'b', nom: 'Beta', releveLe: '2026-07-27', elo: 1900 },
    { slug: 'b', nom: 'Beta', releveLe: '2026-09-14', elo: 1850 },
    // Une seule date : pas mesurable, jamais compté à 0
    { slug: 'c', nom: 'Gamma', releveLe: '2026-09-14', elo: 1700 },
    // Un Elo manquant n'est pas un relevé exploitable
    { slug: 'd', nom: 'Delta', releveLe: '2026-07-27', elo: null },
    { slug: 'd', nom: 'Delta', releveLe: '2026-09-14', elo: 1600 },
  ]);
  assert(b.du === '2026-07-27' && b.au === '2026-09-14' && b.nbReleves === 3, 'période = premier et dernier relevé de l’archive');
  assert(b.progressions.length === 2, `seuls Alpha et Beta sont mesurables (obtenu ${b.progressions.length})`);
  assert(b.progressions[0].slug === 'a' && b.progressions[0].delta === 80, 'Alpha : 1950 → 2030, +80, relevés triés par date');
  assert(b.progressions[1].delta === -50, 'Beta en dernier : −50');
  assert(progressionsElo([]).du === null, 'archive vide : aucune période');
}

// ── Cumul de saison ──
{
  const cumul = cumulSaison(
    [null, 'p1', 'p2'],
    [
      { tournoiId: 't1', stockId: null, picks: 40, bracket: 10 },
      { tournoiId: 't2', stockId: null, picks: 55, bracket: null },
      { tournoiId: 't1', stockId: 'p1', picks: 0, bracket: 8 },
    ],
  );
  assert(cumul[0].total === 105 && cumul[0].picks === 95 && cumul[0].bracket === 10, 'moi : 95 picks + 10 bracket');
  assert(cumul[0].meilleur?.tournoiId === 't2' && cumul[0].meilleur.points === 55, 'meilleur tournoi : t2 (55) devant t1 (50)');
  assert(cumul[1].total === 8 && cumul[1].nbTournois === 1, 'p1 : 8 points de bracket sur un tournoi');
  assert(cumul[2].total === 0 && cumul[2].meilleur === null && cumul[2].nbTournois === 0, 'p2 sans rien : présent, à 0, sans meilleur tournoi');
}

// ── Picks les plus rentables ──
{
  const r = joueursLesPlusRentables([
    { player_id: 'x', points: 10 },
    { player_id: 'y', points: 14 },
    { player_id: 'x', points: 8 },
    { player_id: 'z', points: 0 },
    { player_id: 'w', points: null },
  ]);
  assert(r.length === 2 && r[0].playerId === 'x' && r[0].points === 18 && r[0].fois === 2, 'x cumule 18 sur 2 picks, en tête');
  assert(!r.some((j) => j.playerId === 'z' || j.playerId === 'w'), 'un joueur à 0 point n’est pas « rentable »');
}

// ── Victoires ──
{
  const v = joueursLesPlusVictorieux([
    { winner_id: 'a', status: 'completed' },
    { winner_id: 'a', status: 'walkover' },
    { winner_id: 'a', status: 'bye' },
    { winner_id: 'b', status: 'retired' },
    { winner_id: 'b', status: 'live' },
    { winner_id: null, status: 'scheduled' },
  ]);
  assert(v[0].playerId === 'a' && v[0].victoires === 2, 'a : victoire + w.o., le bye ne compte pas');
  assert(v[1].playerId === 'b' && v[1].victoires === 1, 'b : l’abandon compte, le match live non');
}

// ── Fantasy ──
{
  const f = bilanFantasy([
    { tournoiId: 't1', predit: 100, reel: 120, termine: true },
    { tournoiId: 't2', predit: 90, reel: 60, termine: true },
    { tournoiId: 't3', predit: 95, reel: 300, termine: false },
  ]);
  assert(f.termines === 2 && f.reel === 180 && f.predit === 190, 'seuls les tournois terminés comptent');
  assert(f.meilleur?.tournoiId === 't1', 'le tournoi en cours, même en tête, n’est pas le meilleur');
}

if (echecs > 0) {
  console.error(`\n${echecs} test(s) en échec.`);
  process.exit(1);
}
console.log('\nTOUS LES TESTS PASSENT');
