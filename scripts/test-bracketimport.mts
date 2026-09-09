/**
 * TESTS DE NON-RÉGRESSION — lib/bracketImport.ts
 *
 * Node pur (aucun React, aucun Supabase), même convention que
 * scripts/test-bracketsim.mts : `npm run test:bracketimport`.
 */
import {
  parseExtraitBracket,
  resoudreExtraitBracket,
  resoudreParticipant,
} from '../lib/bracketImport.ts';

let echecs = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    echecs++;
    console.error('ÉCHEC:', msg);
  } else {
    console.log('ok:', msg);
  }
}

/* ========================================================================
 * FIXTURE — quart de tableau réel de l'US Open 2026 (ATP), noms « Game
 * Tracker » (Prénom NOM) tels qu'un extracteur externe les produirait.
 * ======================================================================== */
const rounds = ['R32', 'R16', 'QF', 'SF', 'F'];
const joueursDuTableau = [
  { id: 'Z355', name: 'A. Zverev' },
  { id: 'V812', name: 'B. Van de Zandschulp' },
  { id: 'KE29', name: 'K. Khachanov' },
  { id: 'B0PG', name: 'A. Blockx' },
  { id: 'TD51', name: 'F. Tiafoe' },
  { id: 'M0QI', name: 'A. Michelsen' },
  { id: 'S0S1', name: 'B. Shelton' },
  { id: 'A0E2', name: 'C. Alcaraz' },
];

/* ========================================================================
 * parseExtraitBracket — forme du JSON
 * ======================================================================== */
{
  const json = {
    participant: 'Laki',
    tours: [
      {
        tour: 'QF',
        matchs: [
          { position: 0, joueurs: ['Alexander ZVEREV', 'Botic VAN DE ZANDSCHULP'], pronostique: 'Alexander ZVEREV', statut: 'en_attente' },
        ],
      },
    ],
  };
  const extrait = parseExtraitBracket(json);
  assert(extrait.participant === 'Laki', 'parseExtraitBracket lit le participant');
  assert(extrait.tours.length === 1 && extrait.tours[0].matchs.length === 1, 'parseExtraitBracket lit tours/matchs');

  for (const invalide of [
    null,
    {},
    { participant: 'Laki' },
    { participant: 'Laki', tours: 'pas un tableau' },
    { participant: 'Laki', tours: [{ tour: 'QF' }] },
    { participant: 'Laki', tours: [{ tour: 'QF', matchs: [{ position: -1, joueurs: ['A', 'B'], pronostique: 'A', statut: 'en_attente' }] }] },
    { participant: 'Laki', tours: [{ tour: 'QF', matchs: [{ position: 0, joueurs: ['A'], pronostique: 'A', statut: 'en_attente' }] }] },
    { participant: 'Laki', tours: [{ tour: 'QF', matchs: [{ position: 0, joueurs: ['A', 'B'], pronostique: 'A', statut: 'douteux' }] }] },
  ]) {
    let leve = false;
    try {
      parseExtraitBracket(invalide);
    } catch {
      leve = true;
    }
    assert(leve, `parseExtraitBracket rejette ${JSON.stringify(invalide)}`);
  }
}

/* ========================================================================
 * resoudreExtraitBracket — rattachement des noms (Prénom NOM -> DB), tours
 * révélés progressivement, et cohérence tour/tableau réel.
 * ======================================================================== */
{
  const extrait = parseExtraitBracket({
    participant: 'Laki',
    tours: [
      {
        tour: 'QF',
        matchs: [
          { position: 0, joueurs: ['Alexander ZVEREV', 'Botic VAN DE ZANDSCHULP'], pronostique: 'Alexander ZVEREV', statut: 'en_attente' },
          { position: 2, joueurs: ['Frances TIAFOE', 'Alex MICHELSEN'], pronostique: 'Frances TIAFOE', statut: 'en_attente' },
        ],
      },
    ],
  });

  const { picks, toursIgnores, nonApparies, incoherences } = resoudreExtraitBracket(extrait, rounds, joueursDuTableau);
  assert(picks.length === 2, `2 pronostics résolus sur le quart réel (obtenu ${picks.length})`);
  assert(picks.some((p) => p.round === 'QF' && p.position === 0 && p.playerId === 'Z355'), 'Alexander ZVEREV -> Z355 (A. Zverev) sur QF/0');
  assert(picks.some((p) => p.round === 'QF' && p.position === 2 && p.playerId === 'TD51'), 'Frances TIAFOE -> TD51 (F. Tiafoe) sur QF/2');
  assert(toursIgnores.length === 0, 'QF existe dans le tableau réel : aucun tour ignoré');
  assert(nonApparies.length === 0 && incoherences.length === 0, 'aucun nom non rattaché ni incohérence sur ce fixture propre');
}

// Tour absent du tableau réel (ex. un tableau de 32 qui commence à R32, pas
// R128) : signalé, ses matchs ne sont PAS importés — mais le reste du JSON
// l'est toujours (import progressif partiel).
{
  const roundsPetitTableau = ['R32', 'R16', 'QF', 'SF', 'F'];
  const extrait = parseExtraitBracket({
    participant: 'Laki',
    tours: [
      { tour: 'R128', matchs: [{ position: 0, joueurs: ['Alexander ZVEREV', 'Botic VAN DE ZANDSCHULP'], pronostique: 'Alexander ZVEREV', statut: 'en_attente' }] },
      { tour: 'QF', matchs: [{ position: 0, joueurs: ['Alexander ZVEREV', 'Botic VAN DE ZANDSCHULP'], pronostique: 'Alexander ZVEREV', statut: 'en_attente' }] },
    ],
  });
  const { picks, toursIgnores } = resoudreExtraitBracket(extrait, roundsPetitTableau, joueursDuTableau);
  assert(picks.length === 1 && picks[0].round === 'QF', 'seul QF (dans le tableau réel) est importé, pas R128');
  assert(toursIgnores.length === 1 && toursIgnores[0].tour === 'R128', 'R128 signalé comme ignoré (absent du tableau de 32)');
}

// Nom non rattaché (faute de frappe/joueur absent du tableau) : signalé,
// pas silencieusement ignoré, et n'empêche pas le reste de l'import.
{
  const extrait = parseExtraitBracket({
    participant: 'Laki',
    tours: [
      {
        tour: 'QF',
        matchs: [
          { position: 0, joueurs: ['Alexander ZVEREVZZ', 'Botic VAN DE ZANDSCHULP'], pronostique: 'Alexander ZVEREVZZ', statut: 'en_attente' },
          { position: 2, joueurs: ['Frances TIAFOE', 'Alex MICHELSEN'], pronostique: 'Frances TIAFOE', statut: 'en_attente' },
        ],
      },
    ],
  });
  const { picks, nonApparies } = resoudreExtraitBracket(extrait, rounds, joueursDuTableau);
  assert(picks.length === 1 && picks[0].position === 2, 'QF/2 (nom valide) importé malgré le nom cassé sur QF/0');
  assert(
    nonApparies.some((n) => n.nom === 'Alexander ZVEREVZZ' && n.raison === 'absent' && n.contexte === 'QF/0'),
    `« Alexander ZVEREVZZ » signalé comme non apparié sur QF/0 (obtenu ${JSON.stringify(nonApparies)})`,
  );
}

// Pronostic incohérent : le nom pronostiqué ne fait pas partie des 2 joueurs
// du duel — signalé distinctement, aucun pronostic écrit pour ce match.
{
  const extrait = parseExtraitBracket({
    participant: 'Laki',
    tours: [
      { tour: 'QF', matchs: [{ position: 0, joueurs: ['Alexander ZVEREV', 'Botic VAN DE ZANDSCHULP'], pronostique: 'Frances TIAFOE', statut: 'en_attente' }] },
    ],
  });
  const { picks, incoherences } = resoudreExtraitBracket(extrait, rounds, joueursDuTableau);
  assert(picks.length === 0, 'aucun pronostic écrit quand le nom pronostiqué ne fait pas partie du duel');
  assert(incoherences.length === 1 && incoherences[0].contexte === 'QF/0', 'incohérence signalée sur QF/0');
}

// Import progressif : un second extrait (tour supplémentaire révélé) se
// résout indépendamment — rien dans le module ne fusionne ni n'écrase, ça
// vit dans l'écriture (Server Action), mais la résolution reste stable tour
// par tour, ce que ce test fige.
{
  const extraitSF = parseExtraitBracket({
    participant: 'Laki',
    tours: [{ tour: 'SF', matchs: [{ position: 0, joueurs: ['Alexander ZVEREV', 'Frances TIAFOE'], pronostique: 'Alexander ZVEREV', statut: 'en_attente' }] }],
  });
  const { picks } = resoudreExtraitBracket(extraitSF, rounds, joueursDuTableau);
  assert(picks.length === 1 && picks[0].round === 'SF' && picks[0].position === 0 && picks[0].playerId === 'Z355', 'un import SF seul se résout, indépendant du QF déjà importé par ailleurs');
}

/* ========================================================================
 * resoudreParticipant — alias du jeu -> stock de l'app
 * ======================================================================== */
{
  const participants = [
    { id: 'laki-id', name: 'Laki' },
    { id: 'thomas-id', name: 'Thomas' },
  ];

  const daddy = resoudreParticipant('Daddy', participants);
  assert(daddy.ok && daddy.stockId === null, 'Daddy -> moi (participant_id null)');

  const laki = resoudreParticipant('Laki', participants);
  assert(laki.ok && laki.stockId === 'laki-id', 'Laki -> le participant nommé Laki');

  const moustiton = resoudreParticipant('moustiton', participants);
  assert(moustiton.ok && moustiton.stockId === 'thomas-id', 'moustiton (pseudo jeu) -> le participant nommé Thomas');

  const inconnu = resoudreParticipant('PseudoInconnu', participants);
  assert(!inconnu.ok, 'alias de jeu inconnu -> erreur explicite, pas un stock au hasard');

  const thomasAbsent = resoudreParticipant('moustiton', [{ id: 'laki-id', name: 'Laki' }]);
  assert(!thomasAbsent.ok, 'Thomas configuré nulle part en base -> erreur explicite, pas un stock fantôme');
}

if (echecs > 0) {
  console.error(`\n${echecs} test(s) en échec.`);
  process.exit(1);
}
console.log('\nTOUS LES TESTS PASSENT');
