/**
 * TESTS DE NON-RÉGRESSION — lib/bracketSim.ts et lib/montecarlo.ts
 *
 * Le projet n'a pas de test runner (cf. AGENTS.md/CLAUDE.md, aucun jest/
 * vitest en dépendance) : ce fichier suit la convention déjà en place pour
 * les scripts (`scripts/*.mts`, exécutables directement par `node`), avec un
 * `assert` maison qui lève au premier échec plutôt qu'un framework complet.
 *
 *   npm run test:bracketsim
 *
 * Fixture volontairement réduite à 3 tours (QF/SF/F, barème 1/2/4 pts) au
 * lieu des 7 tours réels d'un tableau de 128 (16/32/64 à ces mêmes tours) :
 * seule la STRUCTURE (qui joue qui) doit être fidèle au cas réel pour que le
 * test vaille quelque chose, pas l'échelle absolue des points. Les noms et
 * appariements du quart de tableau sont ceux de l'US Open 2026 (ATP) tels
 * qu'observés en base au moment des signalements.
 *
 * Modèle BRACKET, UN TOUR À LA FOIS : chaque stock pronostique le vainqueur
 * de chaque MATCH, tour par tour, indépendamment d'un tour à l'autre (table
 * tn_bracket_round_picks) — les cartes de pronostics ci-dessous sont donc
 * construites À LA MAIN, un `cleDuel` par match pronostiqué, exactement
 * comme l'écran les assemble à partir de plusieurs tours enregistrés
 * séparément. Aucune ancre unique (`predictionsDepuisAncre`, abandonnée).
 */
import {
  augmenterAvecPlusieursVictoires,
  augmenterAvecVictoires,
  chercherScenariosGagnants,
  cheminDuJoueur,
  cleDuel,
  ensemblesAtteignables,
  filtrerDepuisTour,
  resoudreArbre,
  scoreDuStock,
  vainqueursReels,
  type MatchReel,
  type StockGarantie,
} from '../lib/bracketSim.ts';
import {
  classerScenariosVictoire,
  simulerProbabilitesVictoire,
  tirerFinDeTournoi,
  type StockBracket,
} from '../lib/montecarlo.ts';
import type { Player } from '../lib/types.ts';

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
 * FIXTURE — quart de tableau réel de l'US Open 2026 (ATP)
 * ======================================================================== */
const rounds = ['QF', 'SF', 'F']; // points 1, 2, 4
const ZVEREV = 'Z355';
const VDZ = 'V812';
const KHACHANOV = 'KE29';
const BLOCKX = 'B0PG';
const TIAFOE = 'TD51';
const MICHELSEN = 'M0QI';
const SHELTON = 'S0S1';
const ALCARAZ = 'A0E2';

const matches: MatchReel[] = [
  { round: 'QF', position: 0, player1Id: ZVEREV, player2Id: VDZ, winnerId: null },
  { round: 'QF', position: 1, player1Id: KHACHANOV, player2Id: BLOCKX, winnerId: null },
  { round: 'QF', position: 2, player1Id: TIAFOE, player2Id: MICHELSEN, winnerId: null },
  { round: 'QF', position: 3, player1Id: SHELTON, player2Id: ALCARAZ, winnerId: null },
  { round: 'SF', position: 0, player1Id: null, player2Id: null, winnerId: null },
  { round: 'SF', position: 1, player1Id: null, player2Id: null, winnerId: null },
  { round: 'F', position: 0, player1Id: null, player2Id: null, winnerId: null },
];

const roundDepart = 'QF';

// Pronostics du fixture, un `cleDuel` par tour REGISTRÉ séparément (comme
// l'écran, qui persiste chaque tour indépendamment) : Moi et Laki suivent
// des joueurs différents de Thomas, qui suit Tiafoe à chaque tour — le cas
// concret du signalement historique, transposé au nouveau modèle.
function predsSuivant(playerId: string): Map<string, string> {
  return new Map(
    cheminDuJoueur(matches, rounds, playerId).map(({ round, position }) => [cleDuel(round, position), playerId]),
  );
}
const predsMoi = predsSuivant(ZVEREV);
const predsLaki = predsSuivant(SHELTON);
const predsThomas = predsSuivant(TIAFOE);

/* ========================================================================
 * BUG (corrigé) — resoudreArbre : un trou dans un tour suivant n'est PAS un
 * bye et ne doit jamais « avancer » l'unique camp connu.
 * ======================================================================== */
{
  const reel = resoudreArbre(matches, rounds, () => null);
  const sf0 = reel.duels.find((d) => d.round === 'SF' && d.position === 0)!;
  assert(sf0.a === null && sf0.b === null && sf0.vainqueur === null, 'SF/0 reste indéterminé tant que QF/0 et QF/1 ne le sont pas (pas de bye fantôme)');
}

/* ========================================================================
 * BUG (corrigé) — resoudreArbre : le vrai résultat verrouille MÊME quand
 * l'adversaire n'est pas encore structurellement connu (cas d'une
 * hypothèse posée via augmenterAvecVictoires, avant que l'autre camp du
 * même tour ne soit lui-même déterminé).
 * ======================================================================== */
{
  const augmente = augmenterAvecVictoires(matches, rounds, TIAFOE, 'F')!;
  const reference = resoudreArbre(augmente, rounds, () => null);
  const f0 = reference.duels.find((d) => d.round === 'F' && d.position === 0)!;
  assert(f0.vainqueur === TIAFOE && f0.verrouille, 'F/0 verrouillé sur Tiafoe même avec b=null (adversaire pas encore déterminé)');
}

/* ========================================================================
 * filtrerDepuisTour — les tours avant le tour choisi sortent du pronostic
 * (couverts par la saisie manuelle « déjà gagné », jamais recalculés).
 * ======================================================================== */
{
  assert(predsThomas.size === 3, `Thomas a pronostiqué Tiafoe sur ses 3 emplacements QF/SF/F (obtenu ${predsThomas.size})`);
  const depuisSF = filtrerDepuisTour(predsThomas, rounds, 'SF');
  assert(depuisSF.size === 2 && !depuisSF.has(cleDuel('QF', 2)), 'depuis SF, QF/2 sort du pronostic (avant le tour choisi)');
}

/* ========================================================================
 * augmenterAvecVictoires / augmenterAvecPlusieursVictoires — contradictions
 * ======================================================================== */
{
  assert(augmenterAvecVictoires(matches, rounds, ZVEREV, 'F') !== null, 'Zverev peut hypothétiquement remporter le tournoi (encore en lice)');
  assert(cheminDuJoueur(matches, rounds, TIAFOE).length === 3, 'chemin de Tiafoe : 3 emplacements (QF, SF, F)');

  const contradiction = augmenterAvecPlusieursVictoires(matches, rounds, [
    { playerId: ZVEREV, round: 'F' },
    { playerId: TIAFOE, round: 'F' },
  ]);
  assert(contradiction === null, 'Zverev et Tiafoe ne peuvent pas remporter le tournoi tous les deux (ils se rencontreraient en finale)');
}

/* ========================================================================
 * CAS CONCRET DU SIGNALEMENT — Thomas suit Tiafoe à chaque tour, seul à le
 * faire. Si Tiafoe remporte le tournoi, Thomas doit gagner à coup sûr : ni
 * Moi (Zverev) ni Laki (Shelton) ne peuvent l'égaler si leur propre suivi
 * est éliminé avant la finale.
 * ======================================================================== */
{
  const stocks: StockGarantie[] = [
    { id: 'moi', dejaGagne: 0, predictions: predsMoi },
    { id: 'laki', dejaGagne: 0, predictions: predsLaki },
    { id: 'thomas', dejaGagne: 0, predictions: predsThomas },
  ];
  const scenarios = chercherScenariosGagnants(matches, rounds, roundDepart, stocks);
  const evThomas = scenarios.get('thomas');
  assert(
    !!evThomas && evThomas.length === 1 && evThomas[0].playerId === TIAFOE && evThomas[0].round === 'F',
    `Thomas (suit Tiafoe, seul) : « Tiafoe remporte le tournoi » détecté (obtenu ${JSON.stringify(evThomas)})`,
  );

  // Si Laki suit AUSSI Tiafoe (mêmes pronostics que Thomas), plus personne
  // n'est seul à en profiter : le scénario doit disparaître pour les deux.
  const stocksMemeSuivi: StockGarantie[] = [
    stocks[0],
    { id: 'laki', dejaGagne: 0, predictions: predsThomas },
    stocks[2],
  ];
  const scenariosMemeSuivi = chercherScenariosGagnants(matches, rounds, roundDepart, stocksMemeSuivi);
  assert(!scenariosMemeSuivi.has('thomas') && !scenariosMemeSuivi.has('laki'), 'pronostic partagé (Laki = Thomas = Tiafoe) : plus aucun scénario garanti pour l\'un ou l\'autre');
}

/* ========================================================================
 * Points simulés : réagissent bien à un clic sur un tour à venir, pour un
 * stock dont le pronostic correspond.
 * ======================================================================== */
{
  const scenarioClic = new Map([[cleDuel('QF', 0), ZVEREV]]);
  const arbreScenario = resoudreArbre(matches, rounds, (r, p) => scenarioClic.get(cleDuel(r, p)) ?? null);
  const ptsMoi = scoreDuStock(predsMoi, arbreScenario, rounds);
  const ptsThomas = scoreDuStock(predsThomas, arbreScenario, rounds);
  assert(ptsMoi === 1, `un clic sur QF/0 -> Zverev rapporte des points à Moi qui l'a pronostiqué (obtenu ${ptsMoi}, attendu 1)`);
  assert(ptsThomas === 0, "le même clic ne rapporte rien à Thomas, dont le pronostic (Tiafoe) ne joue pas QF/0 (0 attendu, pas un bug)");
}

/* ========================================================================
 * Probabilités Monte Carlo : somment à 1 (jamais 500 %), quel que soit le
 * nombre de stocks.
 * ======================================================================== */
const players: Record<string, Player> = Object.fromEntries(
  [
    [ZVEREV, 2054], [VDZ, 1748], [KHACHANOV, 1761], [BLOCKX, 1810],
    [TIAFOE, 1904], [MICHELSEN, 1835], [SHELTON, 1960], [ALCARAZ, 2103],
  ].map(([id, elo]) => [id, { id, eloOverall: elo, eloHard: elo, eloClay: elo, eloGrass: elo } as unknown as Player]),
);
const stocksMC: StockBracket[] = [
  { id: 'moi', dejaGagne: 0, predictions: predsMoi },
  { id: 'laki', dejaGagne: 0, predictions: predsLaki },
  { id: 'thomas', dejaGagne: 0, predictions: predsThomas },
];
{
  const resultat = simulerProbabilitesVictoire(matches, new Map(), players, rounds, stocksMC, 2000, 'hard');
  const somme = Object.values(resultat.victoires).reduce((a, b) => a + b, 0);
  assert(Math.abs(somme - 1) < 1e-9, `les probabilités somment à 1, jamais 5 (500 %) — obtenu ${somme}`);
  assert(
    Object.values(resultat.victoires).every((v) => v >= 0 && v <= 1),
    'chaque probabilité individuelle reste dans [0, 1]',
  );

  const rnd = (() => {
    let s = 3;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  })();
  const tirage = tirerFinDeTournoi(matches, new Map(), players, rounds, rnd, 'hard');
  assert(tirage.duels.every((d) => d.vainqueur !== null), 'un tirage complet tranche les 7 duels');
  assert(vainqueursReels(matches).size === 0, "la fixture elle-même n'a aucun résultat réel décidé (tout est simulé)");
  assert(ensemblesAtteignables(matches, rounds).get(cleDuel('F', 0))!.size === 8, 'les 8 joueurs du quart sont encore atteignables en finale avant tout résultat');
}

/* ========================================================================
 * classerScenariosVictoire — les 3 meilleurs scénarios par stock,
 * remplaçant la recherche de garantie absolue.
 * ======================================================================== */
{
  // Thomas ne suit que Tiafoe : un seul candidat, forcément classé en tête
  // (aucun autre concurrent), avec la même probabilité que le classement
  // Monte Carlo brut ci-dessus une fois Tiafoe acquis vainqueur.
  const scenariosThomas = classerScenariosVictoire(
    matches, new Map(), players, rounds, stocksMC, 'thomas', [TIAFOE], 1500, 'hard',
  );
  assert(scenariosThomas.length === 1 && scenariosThomas[0].playerId === TIAFOE, 'Thomas : un seul scénario candidat (Tiafoe), présent');
  assert(scenariosThomas[0].probabilite > 0.9, `si Tiafoe remporte le tournoi, Thomas (seul à le suivre) gagne quasi sûrement (obtenu ${scenariosThomas[0].probabilite})`);

  // Un candidat déjà éliminé réellement est omis, pas affiché à 0 %.
  const eliminee = { ...matches[0], winnerId: VDZ } as MatchReel; // Zverev perd son QF pour de vrai
  const matchesZverevElimine = [eliminee, ...matches.slice(1)];
  const scenariosMoiElimine = classerScenariosVictoire(
    matchesZverevElimine, new Map(), players, rounds, stocksMC, 'moi', [ZVEREV], 500, 'hard',
  );
  assert(scenariosMoiElimine.length === 0, 'Zverev réellement éliminé : aucun scénario "Zverev remporte le tournoi", pas un scénario à 0 %');

  // Classement décroissant sur plusieurs candidats.
  const scenariosMulti = classerScenariosVictoire(
    matches, new Map(), players, rounds, stocksMC, 'moi', [ZVEREV, VDZ, TIAFOE], 800, 'hard',
  );
  for (let i = 1; i < scenariosMulti.length; i++) {
    assert(scenariosMulti[i - 1].probabilite >= scenariosMulti[i].probabilite, 'classerScenariosVictoire trie par probabilité décroissante');
  }
}

if (echecs > 0) {
  console.error(`\n${echecs} test(s) en échec.`);
  process.exit(1);
}
console.log('\nTOUS LES TESTS PASSENT');
