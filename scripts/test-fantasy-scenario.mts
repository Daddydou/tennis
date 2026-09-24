/**
 * TESTS — simulateur « et si » du Fantasy (lib/fantasyScenario.ts), branché
 * sur la vraie simulation (lib/montecarlo.ts `simulerDepuis`).
 *
 * Node pur (aucun React, aucun Supabase), même convention que
 * scripts/test-bracketsim.mts : `npm run test:fantasy-scenario`.
 */
import {
  cleDuelJoueurs,
  probabiliteAvecSurcharges,
  projeterJoueur,
} from '../lib/fantasyScenario.ts';
import { PROBABILITE_ELO_SEULE } from '../lib/elo.ts';
import { POINTS_BYE } from '../lib/fantasy.ts';
import { simulerDepuis } from '../lib/montecarlo.ts';
import type { Match, MatchPlayer, Player } from '../lib/types.ts';

let echecs = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    echecs++;
    console.error('ÉCHEC:', msg);
  } else {
    console.log('ok:', msg);
  }
}

// ── Clé et orientation des surcharges ──
{
  assert(cleDuelJoueurs('b', 'a') === 'a|b' && cleDuelJoueurs('a', 'b') === 'a|b', 'clé indépendante de l’ordre');
  const proba = probabiliteAvecSurcharges(PROBABILITE_ELO_SEULE, new Map([['a|b', 0.9]]));
  assert(proba('a', 'b', 0.5) === 0.9, 'surcharge lue du point de vue du premier id');
  assert(Math.abs(proba('b', 'a', 0.5) - 0.1) < 1e-12, 'duel pris dans l’autre sens : probabilité complémentaire');
  assert(proba('a', 'c', 0.37) === 0.37, 'duel non surchargé : modèle de base');
  assert(probabiliteAvecSurcharges(PROBABILITE_ELO_SEULE, new Map()) === PROBABILITE_ELO_SEULE, 'aucune surcharge : le modèle tel quel');
}

// ── Projection d'un joueur ──
{
  const rounds = ['R16', 'QF', 'SF', 'F'];
  const bareme = [1, 1.2, 1.6, 2];
  const p = projeterJoueur(rounds, bareme, 2, [10, 12, 99, 99], { SF: 5, F: 3 }, { SF: 1, F: 0.5 }, new Set());
  assert(p.acquis === 22, 'acquis = réel pondéré des seuls tours avant le départ (R16, QF)');
  assert(Math.abs(p.espere - (5 * 1.6 + 3 * 2)) < 1e-9, 'espéré = espérance pondérée à partir du départ (SF, F)');
  assert(Math.abs(p.total - p.acquis - p.espere) < 1e-9, 'total = acquis + espéré');
  const bye = projeterJoueur(rounds, bareme, 0, [0, 0, 0, 0], {}, {}, new Set(['R16']));
  assert(bye.espere === POINTS_BYE, 'un bye au tour de départ vaut POINTS_BYE, comme dans le Fantasy');
  const elimine = projeterJoueur(rounds, bareme, 2, [10, 0, 0, 0], undefined, undefined, new Set());
  assert(elimine.espere === 0 && elimine.total === 10, 'joueur absent de la simulation : il garde ses acquis, rien de plus');
}

// ── Effet réel d'un réglage sur la simulation ──
{
  const joueur = (id: string, winner = false): MatchPlayer => ({
    id, name: id, seed: null, country: null, isBye: false, winner, sets: [],
  });
  const vide: MatchPlayer = { id: null, name: '', seed: null, country: null, isBye: false, winner: false, sets: [] };
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const players: Record<string, Player> = Object.fromEntries(
    ids.map((id, i) => [id, {
      id, tour: 'ATP', name: id, country: null, rank: i + 1, seed: null, half: i < 4 ? 'top' : 'bottom',
      eloOverall: 2000 - i * 40, eloHard: 2000 - i * 40, eloClay: 2000 - i * 40, eloGrass: 2000 - i * 40,
    } satisfies Player]),
  );
  const rounds = ['QF', 'SF', 'F'];
  const matches: Match[] = [
    ...[0, 1, 2, 3].map((i): Match => ({
      matchId: null, round: 'QF', roundLabel: 'QF', position: i, half: i < 2 ? 'top' : 'bottom',
      status: 'scheduled', players: [joueur(ids[2 * i]), joueur(ids[2 * i + 1])],
    })),
    ...[0, 1].map((i): Match => ({ matchId: null, round: 'SF', roundLabel: 'SF', position: i, half: i ? 'bottom' : 'top', status: 'scheduled', players: [vide, vide] })),
    { matchId: null, round: 'F', roundLabel: 'F', position: 0, half: 'top', status: 'scheduled', players: [vide, vide] },
  ];
  const run = (surcharges: Map<string, number>) =>
    simulerDepuis(matches, players, rounds, 'QF', 3000, 3, 'hard', 0.6, 42, undefined, probabiliteAvecSurcharges(PROBABILITE_ELO_SEULE, surcharges));

  const base = run(new Map());
  const memeGraine = run(new Map());
  assert(JSON.stringify(base) === JSON.stringify(memeGraine), 'sans réglage, deux passes de même graine sont identiques (l’écart ne vient que des réglages)');

  const aPerd = run(new Map([['a|b', 0]]));
  assert((aPerd.presence.a?.SF ?? 0) === 0, 'a forcé perdant en QF : jamais présent en SF');
  assert((aPerd.presence.b?.SF ?? 0) === 1, 'b forcé gagnant : toujours en SF');
  const totalA = (mc: typeof base) => Object.values(mc.esperances.a ?? {}).reduce((s, v) => s + v, 0);
  assert(totalA(aPerd) < totalA(base), `l’espérance de a baisse (${totalA(base).toFixed(1)} → ${totalA(aPerd).toFixed(1)})`);
  assert((aPerd.esperances.a?.QF ?? 0) === 0, 'issue imposée à 0 % : défaite en sets secs, aucun point au QF');
  const bGagne = run(new Map([['a|b', 0]]));
  assert(Object.values(bGagne.esperances.b ?? {}).length > 0 && (bGagne.esperances.b?.QF ?? 0) >= 5, 'b vainqueur imposé : au moins les 5 points de la victoire au QF');
}

if (echecs > 0) {
  console.error(`\n${echecs} test(s) en échec.`);
  process.exit(1);
}
console.log('\nTOUS LES TESTS PASSENT');
