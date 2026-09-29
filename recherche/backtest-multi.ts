/**
 * BACKTEST MULTI-TOURNOIS — MONTE CARLO vs CLASSEMENT ATP
 * =========================================================
 *
 * Rejoue chaque tournoi de ./tournois/ (ordre alphabetique = chronologique)
 * en WALK-FORWARD : les Elo du tournoi N sont calcules sur les tournois
 * 1..N-1 SEULEMENT. Les backtests Madrid/RG historiques utilisent elos.json,
 * calcule sur des tournois qui incluent ou suivent parfois celui qu'on teste :
 * ici, aucun resultat futur ne fuit dans la prevision.
 *
 * Elo initiaux : derives de la meilleure tete de serie observee jusqu'au
 * tournoi N inclus (le seeding est connu AVANT le tournoi, pas de fuite).
 *
 * Strategies comparees (memes slots, meme bareme) :
 *   - MONTE CARLO      simulation + affectation hongroise (moteur de l'app)
 *   - MC + ECART BO5   idem avec l'ecart bo5 (lib/elo.ts, `ecartFormat`),
 *                      seulement sur les tournois bo5
 *   - CLASSEMENT       glouton sur la tete de serie (definition des
 *                      backtests historiques)
 *   - MEILLEUR ELO     glouton sur l'Elo effectif de la surface
 *   - ORACLE           affectation hongroise sur les points reels
 *
 * Usage : npx tsx recherche/backtest-multi.ts [iterations=10000]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseExtract,
  extraireJoueurs,
  joueursParTour,
  devinerBestOf,
  devinerSurface,
} from '../lib/parser';
import { pointsAtRound } from '../lib/scoring';
import { optimiser, genererSlots, type Esperances } from '../lib/optimizer';
import { simulerTournoi } from '../lib/montecarlo';
import { calculerElos, eloDepuisRang, eloEffectif, ecartFormat, ELO_DEFAUT, type EloRecord } from '../lib/elo';
import type { DrawExtract, Pick as PickJoueur, Player, Surface } from '../lib/types';

const ITERATIONS = Number(process.argv[2] ?? 10000);
/** Tournois d'historique minimum avant de commencer a evaluer. */
const MIN_HISTORIQUE = 3;
const POIDS_SURFACE = 0.6;

const DOSSIER = join(__dirname, 'tournois');
const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith('.json')).sort();

interface Tournoi {
  fichier: string;
  ex: DrawExtract;
  surface: Surface;
  bestOf: 3 | 5;
}
const tournois: Tournoi[] = fichiers.map((f) => {
  const ex = parseExtract(JSON.parse(readFileSync(join(DOSSIER, f), 'utf-8')));
  return {
    fichier: f,
    ex,
    surface: devinerSurface(ex.tournament.slug),
    bestOf: devinerBestOf(ex.tour, ex.tournament.slug),
  };
});

type Strat = 'ORACLE' | 'MONTE CARLO' | 'MC + ECART BO5' | 'CLASSEMENT' | 'MEILLEUR ELO';
interface Ligne {
  fichier: string;
  bestOf: 3 | 5;
  pts: Partial<Record<Strat, number>>;
}
const lignes: Ligne[] = [];

console.log('='.repeat(78));
console.log(`BACKTEST MULTI-TOURNOIS — walk-forward, Monte Carlo ${ITERATIONS} iterations, graine 42`);
console.log('='.repeat(78));

for (let i = MIN_HISTORIQUE; i < tournois.length; i++) {
  const { fichier, ex, surface, bestOf } = tournois[i];
  const rounds = ex.roundsFound;
  const slots = genererSlots(rounds);
  const presents = joueursParTour(ex);

  // --- Elo walk-forward : tournois 0..i-1, initiaux depuis les seeds 0..i
  const seedsMax: Record<string, number> = {};
  for (const t of tournois.slice(0, i + 1)) {
    for (const [id, p] of Object.entries(extraireJoueurs(t.ex))) {
      if (p.seed !== null) seedsMax[id] = Math.min(seedsMax[id] ?? Infinity, p.seed);
    }
  }
  const initiaux: Record<string, number> = {};
  for (const [id, s] of Object.entries(seedsMax)) initiaux[id] = eloDepuisRang(s * 2);
  const records = calculerElos(
    tournois.slice(0, i).map((t) => ({ matches: t.ex.matches, surface: t.surface, bestOf: t.bestOf })),
    initiaux
  );

  const joueurs = (avecEcart: boolean): Record<string, Player> => {
    const players = extraireJoueurs(ex);
    for (const [id, p] of Object.entries(players)) {
      const r: EloRecord | undefined = records[id];
      const init = initiaux[id] ?? ELO_DEFAUT;
      const e = avecEcart && r ? ecartFormat(r, bestOf) : 0;
      p.eloOverall = (r?.overall ?? init) + e;
      p.eloHard = (r?.bySurface.hard ?? init) + e;
      p.eloClay = (r?.bySurface.clay ?? init) + e;
      p.eloGrass = (r?.bySurface.grass ?? init) + e;
    }
    return players;
  };
  const players = joueurs(false);
  const surfaceMc = surface === 'carpet' ? 'hard' : surface;
  const eloSurf = (id: string) => {
    const p = players[id];
    const s = surfaceMc === 'clay' ? p.eloClay : surfaceMc === 'grass' ? p.eloGrass : p.eloHard;
    return eloEffectif(p.eloOverall, s, POIDS_SURFACE);
  };

  const ev = (picks: { playerId: string; round: string }[]) =>
    picks.reduce((s, x) => s + pointsAtRound(ex.matches, x.playerId, x.round, bestOf), 0);

  function glouton(cle: (id: string) => number): PickJoueur[] {
    const out: PickJoueur[] = [];
    const used = new Set<string>();
    for (const s of slots) {
      const d = (presents[s.round] ?? []).filter(
        (id) => !used.has(id) && (!s.half || players[id]?.half === s.half));
      if (!d.length) continue;
      const b = d.reduce((x, y) => (cle(x) >= cle(y) ? x : y));
      used.add(b);
      out.push({ round: s.round, half: s.half, playerId: b, playerName: players[b].name });
    }
    return out;
  }

  const mc = (p: Record<string, Player>) =>
    ev(optimiser(
      simulerTournoi(ex.matches, p, rounds, ITERATIONS, bestOf, surfaceMc, POIDS_SURFACE, 42).esperances,
      p, slots));

  const reels: Esperances = {};
  for (const r of rounds) for (const id of presents[r] ?? [])
    (reels[id] ??= {})[r] = pointsAtRound(ex.matches, id, r, bestOf);

  const pts: Ligne['pts'] = {
    ORACLE: ev(optimiser(reels, players, slots)),
    'MONTE CARLO': mc(players),
    CLASSEMENT: ev(glouton((id) => -(players[id]?.seed ?? 999))),
    'MEILLEUR ELO': ev(glouton(eloSurf)),
  };
  if (bestOf === 5) pts['MC + ECART BO5'] = mc(joueurs(true));
  lignes.push({ fichier, bestOf, pts });

  console.log(
    `${fichier.padEnd(24)} bo${bestOf} ${surface.padEnd(5)} ` +
      `oracle ${String(pts.ORACLE).padStart(3)} · MC ${String(pts['MONTE CARLO']).padStart(3)} · ` +
      `classement ${String(pts.CLASSEMENT).padStart(3)} · Elo ${String(pts['MEILLEUR ELO']).padStart(3)}` +
      (pts['MC + ECART BO5'] !== undefined ? ` · MC+écart ${pts['MC + ECART BO5']}` : '')
  );
}

// ---------------------------------------------------------------- synthese

const pct = (l: Ligne, s: Strat) => (l.pts[s]! / l.pts.ORACLE!) * 100;
console.log(`\n${'='.repeat(78)}\nSYNTHESE — ${lignes.length} tournois\n${'='.repeat(78)}`);
console.log(`${'STRATEGIE'.padEnd(16)}${'TOTAL'.padStart(8)}${'% ORACLE MOYEN'.padStart(17)}`);
for (const s of ['ORACLE', 'MONTE CARLO', 'CLASSEMENT', 'MEILLEUR ELO'] as Strat[]) {
  const tot = lignes.reduce((a, l) => a + l.pts[s]!, 0);
  const moy = lignes.reduce((a, l) => a + pct(l, s), 0) / lignes.length;
  console.log(`${s.padEnd(16)}${String(tot).padStart(8)}${moy.toFixed(1).padStart(16)}%`);
}

/** Test du signe bilatéral (ex aequo écartés) : P(au moins aussi déséquilibré | pile ou face). */
function testDuSigne(gagnes: number, perdus: number): number {
  const n = gagnes + perdus;
  const k = Math.min(gagnes, perdus);
  let p = 0;
  let c = 1; // C(n, 0)
  for (let j = 0; j <= k; j++) {
    p += c / 2 ** n;
    c = (c * (n - j)) / (j + 1);
  }
  return Math.min(1, 2 * p);
}

function duel(a: Strat, b: Strat, filtre: (l: Ligne) => boolean = () => true) {
  const ls = lignes.filter((l) => filtre(l) && l.pts[a] !== undefined && l.pts[b] !== undefined);
  let g = 0, p = 0, n = 0, ecart = 0;
  for (const l of ls) {
    const d = l.pts[a]! - l.pts[b]!;
    ecart += d;
    if (d > 0) g++; else if (d < 0) p++; else n++;
  }
  console.log(
    `${a} vs ${b} (${ls.length} tournois) : ${g} gagnés, ${p} perdus, ${n} nuls · ` +
      `écart moyen ${(ecart / (ls.length || 1)).toFixed(1)} pts · test du signe p = ${testDuSigne(g, p).toFixed(3)}`
  );
}

console.log('');
duel('MONTE CARLO', 'CLASSEMENT');
duel('MONTE CARLO', 'CLASSEMENT', (l) => l.bestOf === 3);
duel('MONTE CARLO', 'CLASSEMENT', (l) => l.bestOf === 5);
duel('MONTE CARLO', 'MEILLEUR ELO');
duel('MC + ECART BO5', 'MONTE CARLO');
console.log('\np < 0.05 : écart significatif. Au-delà, on ne peut pas trancher sur ces données.');
