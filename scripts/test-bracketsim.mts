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
 * qu'observés en base au moment du signalement.
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
import { simulerProbabilitesVictoire, tirerFinDeTournoi, type StockBracket } from '../lib/montecarlo.ts';
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

// Pronostics réels constatés en base au moment du signalement.
const predsMoi = new Map([[cleDuel('QF', 0), ZVEREV], [cleDuel('QF', 3), ALCARAZ]]);
const predsLaki = new Map([[cleDuel('QF', 0), ZVEREV], [cleDuel('QF', 3), SHELTON]]);
const predsThomas = new Map([[cleDuel('QF', 2), TIAFOE], [cleDuel('QF', 3), ALCARAZ]]);

/* ========================================================================
 * BUG 1 (corrigé) — resoudreArbre : un trou dans un tour suivant n'est PAS
 * un bye et ne doit jamais « avancer » l'unique camp connu.
 * ======================================================================== */
{
  const reel = resoudreArbre(matches, rounds, () => null);
  const sf0 = reel.duels.find((d) => d.round === 'SF' && d.position === 0)!;
  assert(sf0.a === null && sf0.b === null && sf0.vainqueur === null, 'SF/0 reste indéterminé tant que QF/0 et QF/1 ne le sont pas (pas de bye fantôme)');
}

/* ========================================================================
 * BUG 2 (corrigé) — resoudreArbre : le vrai résultat verrouille MÊME quand
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
 * filtrerDepuisTour — pas de double comptage avec les points déjà gagnés,
 * et une prédiction sur un joueur déjà éliminé vaut toujours 0.
 * ======================================================================== */
{
  const matchesAvecQF0Decide: MatchReel[] = matches.map((m) =>
    m.round === 'QF' && m.position === 0 ? { ...m, winnerId: ZVEREV } : m,
  );
  const filtre = filtrerDepuisTour(predsThomas, rounds, roundDepart);
  assert(filtre.size === 2, 'filtrerDepuisTour depuis QF garde les 2 pronostics de Thomas (tous ≥ QF ici)');

  const reference = resoudreArbre(matchesAvecQF0Decide, rounds, () => null);
  const predsAvecJoueurElimine = new Map([[cleDuel('QF', 0), VDZ]]); // VdZ a perdu QF/0 pour de vrai
  assert(scoreDuStock(predsAvecJoueurElimine, reference, rounds) === 0, "une prédiction sur le perdant réel d'un match décidé vaut 0");
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
 * POINT 3 DU SIGNALEMENT — cas concret Thomas / Tiafoe
 *
 * Avec les pronostics RÉELS actuels (Thomas s'arrête à QF/2 -> Tiafoe, sans
 * entrée en SF ni en F), aucun scénario ne doit garantir Thomas : c'est le
 * comportement OBSERVÉ, et il est CORRECT — Thomas n'a simplement pas
 * complété son pronostic jusqu'à la finale (il n'y a rien à « repêcher »,
 * cf. le rapport joint à ce test). Une fois la finale renseignée pour lui
 * (F/0 -> Tiafoe, ce que l'utilisateur pensait avoir fait), l'événement
 * simple « Tiafoe remporte le tournoi » DOIT apparaître.
 * ======================================================================== */
{
  const stocksIncomplet: StockGarantie[] = [
    { id: 'moi', dejaGagne: 0, predictions: predsMoi },
    { id: 'laki', dejaGagne: 0, predictions: predsLaki },
    { id: 'thomas', dejaGagne: 0, predictions: predsThomas },
  ];
  const scenariosIncomplet = chercherScenariosGagnants(matches, rounds, roundDepart, stocksIncomplet);
  assert(!scenariosIncomplet.has('thomas'), 'Thomas (pronostic réel, sans F/0) : aucun scénario garanti — attendu, pas un bug');

  const predsThomasComplet = new Map(predsThomas);
  predsThomasComplet.set(cleDuel('F', 0), TIAFOE);
  const stocksComplet: StockGarantie[] = [
    { id: 'moi', dejaGagne: 0, predictions: predsMoi },
    { id: 'laki', dejaGagne: 0, predictions: predsLaki },
    { id: 'thomas', dejaGagne: 0, predictions: predsThomasComplet },
  ];
  const scenariosComplet = chercherScenariosGagnants(matches, rounds, roundDepart, stocksComplet);
  const evThomas = scenariosComplet.get('thomas');
  assert(
    !!evThomas && evThomas.length === 1 && evThomas[0].playerId === TIAFOE && evThomas[0].round === 'F',
    `Thomas (F/0 -> Tiafoe ajouté) : « Tiafoe remporte le tournoi » détecté (obtenu ${JSON.stringify(evThomas)})`,
  );
}

/* ========================================================================
 * POINT 2 DU SIGNALEMENT — les points simulés réagissent bien à un clic
 * sur un tour à venir, pour un stock dont le pronostic correspond.
 * ======================================================================== */
{
  const scenarioClic = new Map([[cleDuel('QF', 0), ZVEREV]]);
  const arbreScenario = resoudreArbre(matches, rounds, (r, p) => scenarioClic.get(cleDuel(r, p)) ?? null);
  const ptsMoi = scoreDuStock(filtrerDepuisTour(predsMoi, rounds, roundDepart), arbreScenario, rounds);
  const ptsThomas = scoreDuStock(filtrerDepuisTour(predsThomas, rounds, roundDepart), arbreScenario, rounds);
  assert(ptsMoi === 1, `un clic sur QF/0 -> Zverev rapporte des points à Moi qui l'avait prédit (obtenu ${ptsMoi}, attendu 1)`);
  assert(ptsThomas === 0, "le même clic ne rapporte rien à Thomas, qui n'a rien prédit sur ce match (0 attendu, pas un bug)");
}

/* ========================================================================
 * POINT 1 DU SIGNALEMENT — les probabilités Monte Carlo somment à 1
 * (jamais 500 %), quel que soit le nombre de stocks.
 * ======================================================================== */
{
  const players: Record<string, Player> = Object.fromEntries(
    [
      [ZVEREV, 2054], [VDZ, 1748], [KHACHANOV, 1761], [BLOCKX, 1810],
      [TIAFOE, 1904], [MICHELSEN, 1835], [SHELTON, 1960], [ALCARAZ, 2103],
    ].map(([id, elo]) => [id, { id, eloOverall: elo, eloHard: elo, eloClay: elo, eloGrass: elo } as unknown as Player]),
  );
  const stocksMC: StockBracket[] = [
    { id: 'moi', dejaGagne: 0, predictions: filtrerDepuisTour(predsMoi, rounds, roundDepart) },
    { id: 'laki', dejaGagne: 0, predictions: filtrerDepuisTour(predsLaki, rounds, roundDepart) },
    { id: 'thomas', dejaGagne: 0, predictions: filtrerDepuisTour(predsThomas, rounds, roundDepart) },
  ];
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

if (echecs > 0) {
  console.error(`\n${echecs} test(s) en échec.`);
  process.exit(1);
}
console.log('\nTOUS LES TESTS PASSENT');
