/**
 * TESTS DE NON-RÉGRESSION — blend Elo/cotes en production
 * (lib/cotes.ts `indexerCotes`/`creerBlendProduction`, lib/elo.ts
 * `ProbabiliteMatch`/`PROBABILITE_ELO_SEULE`, lib/montecarlo.ts
 * `simulerMatch`/`simulerTournoi`).
 *
 * Node pur (aucun React, aucun Supabase), même convention que
 * scripts/test-bracketsim.mts : `npm run test:blend-cotes`.
 */
import { blendAvecCotes, POIDS_ELO_MARCHE } from '../lib/elo.ts';
import {
  coteUtilisable,
  indexerCotes,
  creerBlendProduction,
  type CoteMatch,
} from '../lib/cotes.ts';
import { creerRandom, simulerMatch, simulerTournoi } from '../lib/montecarlo.ts';
import type { Match, Player } from '../lib/types.ts';

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
 * coteUtilisable — appariée aux deux joueurs, consensus, antérieure au
 * coup d'envoi (jamais une cote live).
 * ======================================================================== */
{
  const base: CoteMatch = {
    playerAId: 'A1',
    playerBId: 'B1',
    probaA: 0.6,
    commenceTime: '2026-09-14T15:00:00Z',
    recupereLe: '2026-09-13T10:00:00Z',
  };
  assert(coteUtilisable(base) === true, 'cote appariée, datée, capturée avant le coup d’envoi : utilisable');
  assert(coteUtilisable({ ...base, playerAId: null }) === false, 'joueur A non apparié : inutilisable');
  assert(coteUtilisable({ ...base, playerBId: null }) === false, 'joueur B non apparié : inutilisable');
  assert(coteUtilisable({ ...base, probaA: null }) === false, 'aucun consensus (0 book apparié) : inutilisable');
  assert(coteUtilisable({ ...base, commenceTime: null }) === false, 'coup d’envoi inconnu : ne peut pas être jugée antérieure, écartée par prudence');
  assert(
    coteUtilisable({ ...base, recupereLe: '2026-09-14T16:00:00Z' }) === false,
    'capturée APRÈS le coup d’envoi (cote live) : inutilisable — c’est le biais de look-ahead qu’on évite',
  );
  assert(
    coteUtilisable({ ...base, recupereLe: base.commenceTime! }) === false,
    'capturée EXACTEMENT au coup d’envoi : pas strictement antérieure, inutilisable',
  );
}

/* ========================================================================
 * indexerCotes — orientation correcte quel que soit le sens demandé, seules
 * les cotes utilisables sont indexées.
 * ======================================================================== */
{
  const cotes: CoteMatch[] = [
    { playerAId: 'A1', playerBId: 'B1', probaA: 0.7, commenceTime: '2026-09-14T15:00:00Z', recupereLe: '2026-09-13T10:00:00Z' },
    // Live (recupereLe après commenceTime) : ne doit PAS entrer dans l'index.
    { playerAId: 'A2', playerBId: 'B2', probaA: 0.5, commenceTime: '2026-09-14T15:00:00Z', recupereLe: '2026-09-14T16:00:00Z' },
  ];
  const index = indexerCotes(cotes);
  assert(index.taille === 1, `1 seule cote utilisable indexée (obtenu ${index.taille})`);
  assert(index.probabiliteA('A1', 'B1') === 0.7, 'P(A1 gagne) dans le sens stocké');
  assert(index.probabiliteA('B1', 'A1') === 0.3 || Math.abs(index.probabiliteA('B1', 'A1')! - 0.3) < 1e-9, 'P(B1 gagne) = 1 - P(A1 gagne), sens inversé');
  assert(index.probabiliteA('A2', 'B2') === null, 'le duel A2/B2 (cote live, exclue) n’est pas dans l’index : repli sur null');
  assert(index.probabiliteA('X', 'Y') === null, 'un duel absent de tn_odds : null, jamais une valeur inventée');
}

/* ========================================================================
 * creerBlendProduction — repli silencieux sur l'Elo seul SANS cote, blend
 * exact avec cote, au poids POIDS_ELO_MARCHE (30 % Elo / 70 % cotes).
 * ======================================================================== */
{
  const cotes: CoteMatch[] = [
    { playerAId: 'A1', playerBId: 'B1', probaA: 0.8, commenceTime: '2026-09-14T15:00:00Z', recupereLe: '2026-09-13T10:00:00Z' },
  ];
  const index = indexerCotes(cotes);
  const blend = creerBlendProduction(index);

  const pEloSeul = 0.55; // n'importe quelle proba Elo, peu importe ici
  assert(
    blend('X', 'Y', pEloSeul) === pEloSeul,
    'sans cote pour ce duel : repli silencieux, la probabilité Elo ressort inchangée',
  );

  const attendu = blendAvecCotes(pEloSeul, 0.8, POIDS_ELO_MARCHE);
  const obtenu = blend('A1', 'B1', pEloSeul);
  assert(Math.abs(obtenu - attendu) < 1e-9, `avec cote : blend exact à ${POIDS_ELO_MARCHE * 100}% Elo (attendu ${attendu}, obtenu ${obtenu})`);
  // 30 % Elo / 70 % cotes : le résultat doit être BEAUCOUP plus proche de la
  // cote (0.8) que de l'Elo seul (0.55).
  assert(Math.abs(obtenu - 0.8) < Math.abs(obtenu - pEloSeul), 'le blend penche vers les cotes (70 %), pas vers l’Elo (30 %)');

  const obtenuInverse = blend('B1', 'A1', 1 - pEloSeul);
  assert(Math.abs(obtenuInverse - (1 - obtenu)) < 1e-9, 'symétrique : demander P(B1 gagne) donne 1 - P(A1 gagne)');
}

/* ========================================================================
 * simulerMatch — pMatchOverride remplace pVictoire(eloA, eloB) mais rien
 * d'autre (même bareme, même tirage de sets une fois pm connu).
 * ======================================================================== */
{
  const rnd = creerRandom(7);
  // Elo strictement égaux -> pVictoire = 0.5 sans override.
  const sansOverride = simulerMatch(1800, 1800, 3, rnd);
  const rnd2 = creerRandom(7);
  // Même graine, même Elo, mais override à 0.5 explicite : résultat identique.
  const avecOverrideIdentique = simulerMatch(1800, 1800, 3, rnd2, undefined, 0.5);
  assert(
    JSON.stringify(sansOverride) === JSON.stringify(avecOverrideIdentique),
    'pMatchOverride === pVictoire(eloA, eloB) par défaut : résultat identique à même graine',
  );

  // Sur beaucoup de tirages, un override à 0.95 doit faire gagner A largement
  // plus souvent que ne le suggérerait un Elo égal (0.5) — la seule façon
  // pour l'override de changer quoi que ce soit au résultat.
  const rndStats = creerRandom(11);
  let victoiresA = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const r = simulerMatch(1800, 1800, 3, rndStats, undefined, 0.95);
    if (r.gagnantEstA) victoiresA++;
  }
  const taux = victoiresA / N;
  assert(taux > 0.85, `override à 0.95 : A gagne largement plus souvent qu'un Elo égal ne le prédirait (obtenu ${taux})`);
}

/* ========================================================================
 * simulerTournoi — SANS probabiliteMatch, comportement STRICTEMENT
 * identique à avant (non-régression) ; AVEC, le blend déplace bien les
 * espérances vers ce que dit la cote, sur un tableau où l'Elo seul et la
 * cote se contredisent.
 * ======================================================================== */
const rounds = ['QF', 'SF', 'F'];
const FAVORI = 'FAVORI'; // Elo net au-dessus, mais la cote va le donner perdant.
const OUTSIDER = 'OUTSIDER';
const AUTRE1 = 'AUTRE1';
const AUTRE2 = 'AUTRE2';
const AUTRE3 = 'AUTRE3';
const AUTRE4 = 'AUTRE4';

const matches: Match[] = [
  {
    matchId: null, round: 'QF', roundLabel: 'QF', position: 0, half: 'top', status: 'scheduled',
    players: [
      { id: FAVORI, name: FAVORI, seed: null, country: null, isBye: false, winner: false, sets: [] },
      { id: OUTSIDER, name: OUTSIDER, seed: null, country: null, isBye: false, winner: false, sets: [] },
    ],
  },
  {
    matchId: null, round: 'QF', roundLabel: 'QF', position: 1, half: 'top', status: 'scheduled',
    players: [
      { id: AUTRE1, name: AUTRE1, seed: null, country: null, isBye: false, winner: false, sets: [] },
      { id: AUTRE2, name: AUTRE2, seed: null, country: null, isBye: false, winner: false, sets: [] },
    ],
  },
  {
    matchId: null, round: 'QF', roundLabel: 'QF', position: 2, half: 'bottom', status: 'scheduled',
    players: [
      { id: AUTRE3, name: AUTRE3, seed: null, country: null, isBye: false, winner: false, sets: [] },
      { id: AUTRE4, name: AUTRE4, seed: null, country: null, isBye: false, winner: false, sets: [] },
    ],
  },
];

function joueur(id: string, elo: number): Player {
  return { id, tour: 'ATP', name: id, country: null, rank: null, seed: null, half: 'top', eloOverall: elo, eloHard: elo, eloClay: elo, eloGrass: elo };
}
const players: Record<string, Player> = {
  [FAVORI]: joueur(FAVORI, 2100),
  [OUTSIDER]: joueur(OUTSIDER, 1600),
  [AUTRE1]: joueur(AUTRE1, 1700),
  [AUTRE2]: joueur(AUTRE2, 1700),
  [AUTRE3]: joueur(AUTRE3, 1700),
  [AUTRE4]: joueur(AUTRE4, 1700),
};

{
  const sansBlend = simulerTournoi(matches, players, rounds, 4000, 3, 'hard', 0.6, 42);
  // Comportement historique : l'Elo seul favorise nettement FAVORI (2100 vs 1600).
  assert(
    sansBlend.esperances[FAVORI]?.QF > sansBlend.esperances[OUTSIDER]?.QF,
    'sans probabiliteMatch (repli par défaut) : l’Elo seul décide, FAVORI largement devant OUTSIDER en QF',
  );

  const cotes: CoteMatch[] = [
    // La cote contredit fortement l'Elo : le marché donne OUTSIDER largement favori.
    { playerAId: FAVORI, playerBId: OUTSIDER, probaA: 0.1, commenceTime: '2026-09-20T00:00:00Z', recupereLe: '2026-09-01T00:00:00Z' },
  ];
  const blend = creerBlendProduction(indexerCotes(cotes));
  const avecBlend = simulerTournoi(matches, players, rounds, 4000, 3, 'hard', 0.6, 42, undefined, blend);

  assert(
    avecBlend.esperances[OUTSIDER]?.QF > avecBlend.esperances[FAVORI]?.QF,
    'avec le blend (30 % Elo / 70 % cotes, cote très défavorable au favori Elo) : OUTSIDER passe devant FAVORI en QF',
  );

  // Repli silencieux, prouvé proprement : un tournoi SANS AUCUNE cote
  // utilisable (index vide) donne un résultat BIT À BIT identique à
  // l'absence totale de probabiliteMatch, à même graine. (On ne compare pas
  // ici un tirage AVEC cote à un tirage SANS sur d'autres duels du même
  // essai : changer le nombre de tirages aléatoires consommés par UN duel
  // décale tous les tirages suivants du même essai — un effet papillon du
  // flux pseudo-aléatoire partagé, pas un défaut du blend.)
  const indexVide = indexerCotes([]);
  assert(indexVide.taille === 0, 'aucune cote fournie : index vide');
  const blendVide = creerBlendProduction(indexVide);
  const sansBlendExplicite = simulerTournoi(matches, players, rounds, 4000, 3, 'hard', 0.6, 42);
  const avecIndexVide = simulerTournoi(matches, players, rounds, 4000, 3, 'hard', 0.6, 42, undefined, blendVide);
  assert(
    JSON.stringify(sansBlendExplicite) === JSON.stringify(avecIndexVide),
    'un index de cotes VIDE reproduit EXACTEMENT le comportement sans blend, match par match, essai par essai',
  );
}

if (echecs > 0) {
  console.error(`\n${echecs} test(s) en échec.`);
  process.exit(1);
}
console.log('\nTOUS LES TESTS PASSENT');
