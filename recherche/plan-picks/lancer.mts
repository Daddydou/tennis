/**
 * Lance le banc d'essai des stratégies de picks (cf. banc.ts).
 *
 *   verif <slug>                  compare le calcul exact au Monte Carlo du moteur
 *   sim <slug> [<slug>…] [n=3000] espérance de chaque stratégie dans le modèle
 *   reel                          rejoue tous les tournois terminés
 *
 * À lancer depuis la racine du dépôt :
 *   node --env-file=.env.local --experimental-loader ../_donnees/loader-profil.mjs recherche/plan-picks/lancer.mts sim basel
 */
import { supabaseAnon } from '../../db/anon';
import { loadEngineData } from '../../db/moteur';
import { surfacePourElo } from '../../db/queries';
import { simulerTournoi } from '../../lib/montecarloTournoi';
import { affectationHongroise } from '../../lib/optimizerAffectation';
import {
  construireTableau,
  creerRollout,
  creerStatique,
  eloMax,
  glouton,
  jouer,
  espParTourDe,
  propager,
  recalcule,
  scenarioReel,
  simuler,
  type Scenario,
  type Tableau,
} from './banc';

const [mode = 'sim', ...args] = process.argv.slice(2);
const f1 = (x: number) => x.toFixed(1).padStart(6);

interface Ligne {
  id: string;
  slug: string;
  tour: string;
  draw_size: number;
  status: string;
}

async function tournois(filtre: (q: ReturnType<ReturnType<typeof supabaseAnon>['from']>) => unknown): Promise<Ligne[]> {
  const q = supabaseAnon().from('tn_tournaments').select('id, slug, tour, draw_size, status, start_date').order('start_date', { ascending: false });
  const { data, error } = (await (filtre(q as never) as Promise<{ data: Ligne[] | null; error: { message: string } | null }>));
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function charger(l: Ligne) {
  const e = await loadEngineData(l.id);
  if (!e) throw new Error(`Tournoi ${l.slug} introuvable`);
  const rounds = e.tournament.rounds ?? [];
  const surface = surfacePourElo(e.tournament.surface);
  const t = construireTableau(e.matches, e.players, rounds, (e.tournament.best_of ?? 3) as 3 | 5, surface);
  return { e, t, surface };
}

function oracle(t: Tableau, sc: Scenario): number {
  const idx = [...Array(t.n).keys()];
  const gains = t.slots.map((s) => {
    const r = t.rounds.indexOf(s.round);
    const vivants = new Set(sc.survivants[r]);
    return idx.map((j) => (!vivants.has(j) || (s.half && t.moitie[j] !== s.half) ? 0 : sc.points[r][j]));
  });
  const aff = affectationHongroise(gains);
  return aff.reduce((s, c, i) => s + (c >= 0 ? gains[i][c] : 0), 0);
}

async function verif(slug: string) {
  const [l] = await tournois((q) => (q as { eq: (c: string, v: string) => unknown }).eq('slug', slug));
  const { e, t, surface } = await charger(l);
  const mc = simulerTournoi(e.matches, e.players, t.rounds, 20000, t.bestOf, surface, 0.6, 42);
  const exact = propager(t, t.grille, 0);
  let maxAbs = 0;
  let somme = 0;
  let nb = 0;
  for (const id of t.ids) {
    for (const r of t.rounds) {
      const a = exact[id]?.[r] ?? 0;
      const b = mc.esperances[id]?.[r] ?? 0;
      maxAbs = Math.max(maxAbs, Math.abs(a - b));
      somme += Math.abs(a - b);
      nb++;
    }
  }
  console.log(`${slug}: écart exact/Monte Carlo — moyen ${(somme / nb).toFixed(3)} pt, max ${maxAbs.toFixed(3)} pt (sur ${nb} valeurs)`);
}

async function sim(slugs: string[], n: number) {
  for (const slug of slugs) {
    const lignes = await tournois((q) => (q as { eq: (c: string, v: string) => unknown }).eq('slug', slug));
    for (const l of lignes) {
      const { t } = await charger(l);
      const debut = Date.now();
      const avecRollout = process.env.ROLLOUT === '1';
      const res = simuler(
        t,
        {
          glouton,
          elo: eloMax,
          statique: creerStatique(t),
          recalcule,
          ...(avecRollout ? { rollout: creerRollout(Number(process.env.ROLLOUT_K ?? 64), Number(process.env.ROLLOUT_M ?? 4)) } : {}),
        },
        n,
        [
          ['recalcule', 'glouton'],
          ['recalcule', 'statique'],
          ['statique', 'glouton'],
          ...(avecRollout ? ([['rollout', 'recalcule']] as [string, string][]) : []),
        ],
      );
      console.log(`\n${l.slug} ${l.tour} (${l.draw_size}, ${t.slots.length} picks) — ${n} tournois simulés en ${((Date.now() - debut) / 1000).toFixed(0)} s`);
      for (const [k, s] of Object.entries(res.parPolitique)) console.log(`  ${k.padEnd(10)} ${f1(s.moyenne)} pts  (± ${s.et.toFixed(2)})`);
      for (const [k, s] of Object.entries(res.ecarts)) console.log(`  écart ${k.padEnd(22)} ${s.moyenne >= 0 ? '+' : ''}${s.moyenne.toFixed(2)} pts  (± ${s.et.toFixed(2)})`);
    }
  }
}

async function reel() {
  const lignes = await tournois((q) => (q as { eq: (c: string, v: string) => unknown }).eq('status', 'completed'));
  const tot = { glouton: 0, elo: 0, statique: 0, recalcule: 0, oracle: 0 };
  const victoires = { statique: 0, recalcule: 0, egal: 0 };
  let nb = 0;
  console.log('tournoi'.padEnd(18) + ['gloutn', 'elo', 'statiq', 'recalc', 'max'].map((x) => x.padStart(7)).join(''));
  for (const l of lignes) {
    const { e, t } = await charger(l);
    const sc = scenarioReel(t, e.matches);
    if (!sc) {
      console.log(`${l.slug.padEnd(18)} données incomplètes, ignoré`);
      continue;
    }
    const esp = espParTourDe(t, sc);
    const r = {
      glouton: jouer(t, sc, glouton, esp),
      elo: jouer(t, sc, eloMax, esp),
      statique: jouer(t, sc, creerStatique(t), esp),
      recalcule: jouer(t, sc, recalcule, esp),
      oracle: oracle(t, sc),
    };
    console.log(`${(l.slug + ' ' + l.tour).padEnd(18)}${f1(r.glouton)} ${f1(r.elo)} ${f1(r.statique)} ${f1(r.recalcule)} ${f1(r.oracle)}`.replace(/ +(\d)/g, ' $1'));
    for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += r[k];
    if (r.recalcule > r.glouton + 0.01) victoires.recalcule++;
    else if (r.recalcule < r.glouton - 0.01) victoires.statique++;
    else victoires.egal++;
    nb++;
  }
  console.log(`\n${nb} tournois — points moyens par tournoi`);
  for (const [k, v] of Object.entries(tot)) console.log(`  ${k.padEnd(10)} ${(v / nb).toFixed(1)}`);
  console.log(`recalculé vs écran actuel : mieux ${victoires.recalcule} fois, moins bien ${victoires.statique} fois, égal ${victoires.egal} fois`);
}

if (mode === 'verif') await verif(args[0] ?? 'basel');
else if (mode === 'reel') await reel();
else {
  const nArg = args.find((a) => a.startsWith('n='));
  await sim(args.filter((a) => !a.startsWith('n=')), nArg ? Number(nArg.slice(2)) : 3000);
}
