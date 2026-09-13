/**
 * TESTS DE NON-RÉGRESSION — lib/parser.ts `reconcilierIdsJoueurs`
 *
 * Node pur (aucun React, aucun Supabase), même convention que
 * scripts/test-bracketsim.mts : `npm run test:reconciliation`.
 *
 * Cas réel du signalement : l'import de l'US Open 2026 (WTA) a créé un
 * second ID pour neuf joueuses déjà en base (ex. E. Kalieva : 327834
 * ailleurs, 380396 sur ce seul tournoi) — même famille de bug que R. Jodar
 * (migration 0011, ID ATP vs Sportradar). Les fixtures ci-dessous
 * reproduisent ce cas, plus l'homonymie réelle (deux X. Wang) qui ne doit
 * JAMAIS se faire fusionner.
 */
import { reconcilierIdsJoueurs } from '../lib/parser.ts';
import type { DrawExtract, Match } from '../lib/types.ts';

let echecs = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    echecs++;
    console.error('ÉCHEC:', msg);
  } else {
    console.log('ok:', msg);
  }
}

/** Construit un match minimal à deux joueurs, pour ces tests uniquement. */
function match(round: string, position: number, joueurs: [string, string], noms: [string, string]): Match {
  return {
    matchId: null,
    round,
    roundLabel: round,
    position,
    half: 'top',
    status: 'completed',
    players: [
      { id: joueurs[0], name: noms[0], seed: null, country: null, isBye: false, winner: true, sets: [] },
      { id: joueurs[1], name: noms[1], seed: null, country: null, isBye: false, winner: false, sets: [] },
    ],
  };
}

function extrait(matches: Match[]): DrawExtract {
  return {
    extractedAt: '2026-09-13T00:00:00Z',
    sourceUrl: '',
    tournament: { slug: 'us-open', externalId: '560', year: 2026 },
    tour: 'WTA',
    roundsFound: ['R128'],
    matchCount: matches.length,
    matches,
  };
}

/* ========================================================================
 * CAS RÉEL DU SIGNALEMENT — E. Kalieva a un ID historique (327834, connu
 * en base) ; l'extraction US Open la porte sous un ID neuf (380396). Le
 * rapprochement doit retrouver l'ID historique et NE PAS écrire le neuf.
 * ======================================================================== */
{
  const ex = extrait([match('R128', 0, ['380396', 'AUTRE1'], ['E. Kalieva', 'J. Adverse'])]);
  const joueursExistants = [
    { id: '327834', name: 'E. Kalieva' },
    { id: 'AUTRE1', name: 'J. Adverse' },
  ];
  const { extract, reconciliations, ambigus } = reconcilierIdsJoueurs(ex, joueursExistants);

  assert(reconciliations.length === 1, `1 rapprochement effectué (obtenu ${reconciliations.length})`);
  assert(
    reconciliations[0]?.idExtrait === '380396' && reconciliations[0]?.idExistant === '327834',
    'Kalieva : ID neuf 380396 rapproché de l’ID historique 327834',
  );
  assert(ambigus.length === 0, 'aucune ambiguïté sur ce cas');
  assert(
    extract.matches[0].players[0].id === '327834',
    `l’extrait réécrit porte l’ID historique, pas le neuf (obtenu ${extract.matches[0].players[0].id})`,
  );
}

/* ========================================================================
 * HOMONYMIE RÉELLE — deux « X. Wang » distinctes déjà en base (cf.
 * migration 0011). Un ID neuf sous ce même nom ne doit JAMAIS être fusionné
 * avec l’une ou l’autre : ambiguïté remontée, ID neuf conservé tel quel.
 * ======================================================================== */
{
  const ex = extrait([match('R128', 0, ['999999', 'AUTRE2'], ['X. Wang', 'J. Rivale'])]);
  const joueursExistants = [
    { id: '326160', name: 'X. Wang' },
    { id: '326376', name: 'X. Wang' },
    { id: 'AUTRE2', name: 'J. Rivale' },
  ];
  const { extract, reconciliations, ambigus } = reconcilierIdsJoueurs(ex, joueursExistants);

  assert(reconciliations.length === 0, 'aucune fusion sur un nom ambigu (deux candidates)');
  assert(ambigus.length === 1 && ambigus[0].idExtrait === '999999', 'l’ambiguïté est remontée pour l’ID neuf');
  assert(
    ambigus[0]?.candidats.length === 2,
    `les deux candidates sont listées, même nom (obtenu ${JSON.stringify(ambigus[0]?.candidats)})`,
  );
  assert(
    extract.matches[0].players[0].id === '999999',
    'l’extrait N’EST PAS réécrit : l’ID neuf reste tel quel, aucune fusion hasardeuse',
  );
}

/* ========================================================================
 * JOUEUSE RÉELLEMENT NOUVELLE — aucun nom correspondant en base : pas de
 * rapprochement, pas d’ambiguïté, l’ID de l’extraction est conservé (c’est
 * la seule chose à faire, une vraie nouvelle joueuse).
 * ======================================================================== */
{
  const ex = extrait([match('R128', 0, ['NEUVE1', 'AUTRE3'], ['Q. Debutante', 'J. Adverse'])]);
  const joueursExistants = [{ id: 'AUTRE3', name: 'J. Adverse' }];
  const { extract, reconciliations, ambigus } = reconcilierIdsJoueurs(ex, joueursExistants);

  assert(reconciliations.length === 0 && ambigus.length === 0, 'joueuse neuve : ni fusion ni ambiguïté');
  assert(extract.matches[0].players[0].id === 'NEUVE1', 'son ID d’extraction est conservé tel quel');
}

/* ========================================================================
 * ID DÉJÀ CONNU — l’extraction porte exactement l’ID déjà en base (le cas
 * courant, un joueur classé) : aucun rapprochement par nom n’est même
 * tenté, l’extrait ressort inchangé.
 * ======================================================================== */
{
  const ex = extrait([match('R128', 0, ['327834', 'AUTRE1'], ['E. Kalieva', 'J. Adverse'])]);
  const joueursExistants = [
    { id: '327834', name: 'E. Kalieva' },
    { id: 'AUTRE1', name: 'J. Adverse' },
  ];
  const { extract, reconciliations, ambigus } = reconcilierIdsJoueurs(ex, joueursExistants);

  assert(reconciliations.length === 0 && ambigus.length === 0, 'ID déjà connu : rien à réconcilier');
  assert(extract.matches[0].players[0].id === '327834', 'l’extrait ressort inchangé');
}

/* ========================================================================
 * PLUSIEURS EMPLACEMENTS, MÊME JOUEUSE — un ID neuf qui revient à
 * plusieurs tours du même import n’est rapproché (et testé) qu’UNE fois,
 * mais réécrit PARTOUT où il apparaît.
 * ======================================================================== */
{
  const ex = extrait([
    match('R128', 0, ['380396', 'AUTRE1'], ['E. Kalieva', 'J. Adverse']),
    match('R64', 0, ['380396', 'AUTRE2'], ['E. Kalieva', 'J. Rivale']),
  ]);
  const joueursExistants = [
    { id: '327834', name: 'E. Kalieva' },
    { id: 'AUTRE1', name: 'J. Adverse' },
    { id: 'AUTRE2', name: 'J. Rivale' },
  ];
  const { extract, reconciliations } = reconcilierIdsJoueurs(ex, joueursExistants);

  assert(reconciliations.length === 1, `un seul rapprochement malgré 2 apparitions (obtenu ${reconciliations.length})`);
  assert(
    extract.matches[0].players[0].id === '327834' && extract.matches[1].players[0].id === '327834',
    'l’ID historique est substitué sur LES DEUX tours',
  );
}

if (echecs > 0) {
  console.error(`\n${echecs} test(s) en échec.`);
  process.exit(1);
}
console.log('\nTOUS LES TESTS PASSENT');
