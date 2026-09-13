/**
 * TESTS DE NON-RÉGRESSION — lib/bracket.ts (pronostic déterministe du
 * Bracket, /tournoi/[id]/bracket), après branchement du blend Elo/cotes.
 *
 * Node pur, même convention que scripts/test-bracketsim.mts :
 * `npm run test:bracket-deterministe`.
 */
import { construireBracket, vainqueurDuel, type CritereJoueur, type MatchTirage } from '../lib/bracket.ts';
import { creerBlendProduction, indexerCotes, type CoteMatch } from '../lib/cotes.ts';

let echecs = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    echecs++;
    console.error('ÉCHEC:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const ELOS: Record<string, CritereJoueur> = {
  FAVORI: { elo: 2100, rang: 3 },
  OUTSIDER: { elo: 1600, rang: 80 },
  A: { elo: 1750, rang: 40 },
  B: { elo: 1720, rang: 45 },
};
const critere = (id: string): CritereJoueur => ELOS[id] ?? { elo: 1500, rang: null };

/* ========================================================================
 * vainqueurDuel — SANS probabiliteMatch, comportement IDENTIQUE à l'ancien
 * (comparaison directe des Elo) : non-régression.
 * ======================================================================== */
{
  assert(vainqueurDuel('FAVORI', 'OUTSIDER', critere) === 'FAVORI', 'sans blend : l’Elo seul décide (FAVORI > OUTSIDER)');
  assert(vainqueurDuel('OUTSIDER', 'FAVORI', critere) === 'FAVORI', 'symétrique : l’ordre des arguments ne change pas le vainqueur');

  // Égalité stricte d'Elo : on retombe sur le rang, exactement comme avant.
  const EGAUX: Record<string, CritereJoueur> = { X: { elo: 1800, rang: 20 }, Y: { elo: 1800, rang: 5 } };
  const critereEgaux = (id: string) => EGAUX[id];
  assert(vainqueurDuel('X', 'Y', critereEgaux) === 'Y', 'Elo strictement égaux : le mieux classé l’emporte (rang 5 < rang 20)');
}

/* ========================================================================
 * vainqueurDuel — AVEC une cote utilisable qui contredit l'Elo : le blend
 * (30 % Elo / 70 % cotes) peut inverser le vainqueur prédit.
 * ======================================================================== */
{
  const cotes: CoteMatch[] = [
    // Le marché donne OUTSIDER largement favori (0.85), à l'inverse net de
    // l'Elo (FAVORI 2100 vs OUTSIDER 1600).
    { playerAId: 'OUTSIDER', playerBId: 'FAVORI', probaA: 0.85, commenceTime: '2026-09-20T00:00:00Z', recupereLe: '2026-09-01T00:00:00Z' },
  ];
  const blend = creerBlendProduction(indexerCotes(cotes));

  assert(
    vainqueurDuel('FAVORI', 'OUTSIDER', critere, blend) === 'OUTSIDER',
    'avec une cote qui contredit fortement l’Elo : le blend peut inverser le favori prédit',
  );

  // Un AUTRE duel, sans cote utilisable : repli silencieux, résultat inchangé.
  assert(
    vainqueurDuel('A', 'B', critere, blend) === vainqueurDuel('A', 'B', critere),
    'un duel SANS cote utilisable n’est pas affecté par le blend (repli silencieux)',
  );
}

/* ========================================================================
 * construireBracket — champion et coteUtilisee cohérents sur un quart de
 * tableau (2 demies + 1 finale), avec une seule cote qui inverse SF/0.
 * ======================================================================== */
{
  const matches: MatchTirage[] = [
    { round: 'SF', position: 0, players: [{ id: 'FAVORI', isBye: false }, { id: 'OUTSIDER', isBye: false }] },
    { round: 'SF', position: 1, players: [{ id: 'A', isBye: false }, { id: 'B', isBye: false }] },
  ];
  const rounds = ['SF', 'F'];

  const sansBlend = construireBracket(matches, rounds, critere);
  assert(sansBlend.champion === 'FAVORI', 'sans blend : FAVORI gagne SF/0 puis la finale contre A (Elo le plus haut)');
  assert(sansBlend.duels.every((d) => d.coteUtilisee === false), 'sans blend : aucun duel marqué « cote utilisée »');

  const cotes: CoteMatch[] = [
    { playerAId: 'OUTSIDER', playerBId: 'FAVORI', probaA: 0.85, commenceTime: '2026-09-20T00:00:00Z', recupereLe: '2026-09-01T00:00:00Z' },
  ];
  const index = indexerCotes(cotes);
  const blend = creerBlendProduction(index);
  const avecBlend = construireBracket(matches, rounds, critere, blend, (a, b) => index.probabiliteA(a, b) !== null);

  assert(avecBlend.champion === 'A', 'avec le blend : OUTSIDER passe SF/0 (cote), puis perd la finale contre A (Elo, sans cote sur ce duel)');
  const sf0 = avecBlend.duels.find((d) => d.round === 'SF' && d.position === 0)!;
  const sf1 = avecBlend.duels.find((d) => d.round === 'SF' && d.position === 1)!;
  const finale = avecBlend.duels.find((d) => d.round === 'F')!;
  assert(sf0.coteUtilisee === true, 'SF/0 (FAVORI vs OUTSIDER) : cote utilisée, marquée');
  assert(sf1.coteUtilisee === false, 'SF/1 (A vs B) : pas de cote pour ce duel, pas marquée');
  assert(finale.coteUtilisee === false, 'F (OUTSIDER vs A, résolu après coup) : pas de cote pour CE duel précis (la cote portait sur FAVORI/OUTSIDER)');
}

if (echecs > 0) {
  console.error(`\n${echecs} test(s) en échec.`);
  process.exit(1);
}
console.log('\nTOUS LES TESTS PASSENT');
