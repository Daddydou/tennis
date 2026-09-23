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
import { detecterDoublons } from '../lib/matching.ts';
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

/* ========================================================================
 * CAS RÉEL SUPPLÉMENTAIRE — O. Oliynykova, une des neuf joueuses WTA
 * fusionnées par la migration 0019 (ID historique 327182, ID neuf 325729
 * servi par le tableau de l'US Open 2026 pour cette joueuse non classée).
 * Rejoue exactement ce cas pour prouver que le rapprochement suffit à lui
 * seul — sans même atteindre le garde-fou ajouté ci-dessous.
 * ======================================================================== */
{
  const ex = extrait([match('R128', 0, ['325729', 'AUTRE1'], ['O. Oliynykova', 'J. Adverse'])]);
  const joueursExistants = [
    { id: '327182', name: 'O. Oliynykova' },
    { id: 'AUTRE1', name: 'J. Adverse' },
  ];
  const { extract, reconciliations } = reconcilierIdsJoueurs(ex, joueursExistants);

  assert(
    reconciliations.length === 1 && reconciliations[0]?.idExistant === '327182',
    `Oliynykova (cas réel migration 0019) : ID neuf 325729 rapproché de l’ID historique 327182 (obtenu ${JSON.stringify(reconciliations)})`,
  );
  assert(
    extract.matches[0].players[0].id === '327182',
    'Oliynykova : aucun doublon écrit, l’extrait réécrit porte l’ID historique',
  );

  // Le résultat de CE rapprochement, une fois écrit, ne doit plus déclencher
  // le garde-fou post-écriture d'app/import/actions.ts (détection partagée,
  // cf. bloc suivant) : c'est le comportement attendu d'un import normal.
  const apresEcriture = [
    { id: '327182', tour: 'WTA', name: 'O. Oliynykova' },
    { id: 'AUTRE1', tour: 'WTA', name: 'J. Adverse' },
  ];
  assert(
    detecterDoublons(apresEcriture).length === 0,
    'Oliynykova : après écriture, aucun doublon détecté (le rapprochement a fait son travail)',
  );
}

/* ========================================================================
 * FILET DE SÉCURITÉ — le rapprochement par nom peut manquer un doublon (ex.
 * variante de nom que `normaliserNom` ne réduit pas à la même clé, ou un
 * futur appel qui n'invoquerait pas `reconcilierIdsJoueurs`). Ce cas simule
 * exactement ça : deux lignes `tn_players` du même nom exact, comme si la
 * réconciliation n'avait pas tourné — le garde-fou d'`app/import/actions.ts`
 * (même détection, `detecterDoublons`) doit le voir et REFUSER l'import,
 * plutôt que de laisser passer silencieusement une deuxième identité pour
 * une même joueuse, comme c'est arrivé deux fois avant que ce garde-fou
 * n'existe (migrations 0011, 0019).
 * ======================================================================== */
{
  const apresEcritureAvecDoublon = [
    { id: '327182', tour: 'WTA', name: 'O. Oliynykova' },
    { id: '999888', tour: 'WTA', name: 'O. Oliynykova' }, // reconciliation manquée
    { id: 'AUTRE1', tour: 'WTA', name: 'J. Adverse' },
  ];
  const doublons = detecterDoublons(apresEcritureAvecDoublon);
  assert(
    doublons.length === 1 && doublons[0].lignes.length === 2,
    `garde-fou : un doublon manqué par le rapprochement est bien détecté (obtenu ${JSON.stringify(doublons)})`,
  );

  // Homonymie RÉELLE (X. Wang) : le garde-fou ne doit jamais la signaler,
  // même comportement que le script scripts/verifier-doublons-joueurs.mts.
  const apresEcritureHomonymie = [
    { id: '326160', tour: 'WTA', name: 'X. Wang' },
    { id: '326376', tour: 'WTA', name: 'X. Wang' },
  ];
  assert(
    detecterDoublons(apresEcritureHomonymie).length === 0,
    'garde-fou : l’homonymie réelle X. Wang n’est jamais signalée comme un doublon',
  );
}

if (echecs > 0) {
  console.error(`\n${echecs} test(s) en échec.`);
  process.exit(1);
}
console.log('\nTOUS LES TESTS PASSENT');
