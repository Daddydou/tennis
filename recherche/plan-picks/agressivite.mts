/**
 * Calibre les niveaux d'agressivité. Chaque poids de risque k est joué
 * COMME DANS L'APPLICATION : le plan « E + k·σ » est recalculé à l'ouverture
 * de chaque tour avec les vrais survivants, et seuls les picks du tour courant
 * sont joués. Mêmes tournois tirés pour tous les k ; les rivaux picorent
 * « meilleur survivant ».
 *
 *   node --env-file=.env.local --experimental-loader ../_donnees/loader-profil.mjs recherche/plan-picks/agressivite.mts acapulco doha
 */
import { loadEngineData } from '../../db/moteur';
import { surfacePourElo } from '../../db/queries';
import { planifier } from '../../lib/planPicks';
import { creerTableau, propagerMoments, type Tableau } from '../../lib/planTableau';
import { creerRandom } from '../../lib/montecarloTournoi';
import { supabaseAnon } from '../../db/anon';
import type { Half, Slot } from '../../lib/types';

const N = Number(process.env.N ?? 300);
const KS = (process.env.KS ?? '-1,-0.5,0,0.5,1,1.5').split(',').map(Number);
const f = (x: number, d = 1) => x.toFixed(d).padStart(6);

interface Scen {
  survivants: (number | null)[][];
  points: Float64Array[];
}

function tirer(t: Tableau, rnd: () => number): Scen {
  const survivants: (number | null)[][] = [];
  const points: Float64Array[] = [];
  let actuels = [...t.grille];
  for (let r = 0; r < t.rounds.length; r++) {
    survivants.push(actuels);
    const pts = new Float64Array(t.n);
    const suiv: (number | null)[] = [];
    for (let i = 0; i < actuels.length; i += 2) {
      const a = actuels[i];
      const b = actuels[i + 1] ?? null;
      if (a !== null && b === null) suiv.push(a);
      else if (b !== null && a === null) suiv.push(b);
      else if (a === null || b === null) suiv.push(null);
      else {
        const res = t.tirer(a, b, rnd);
        pts[a] = res.ptsA;
        pts[b] = res.ptsB;
        suiv.push(res.gagnantEstA ? a : b);
      }
    }
    points.push(pts);
    actuels = suiv;
  }
  return { survivants, points };
}

/** k = null : l'écran historique (meilleur survivant par espérance). */
function jouer(t: Tableau, sc: Scen, k: number | null): number {
  const moitie: Record<string, Half> = {};
  t.ids.forEach((id, j) => (moitie[id] = t.moitie[j]));
  const utilises = new Set<number>();
  let total = 0;
  for (let r = 0; r < t.rounds.length; r++) {
    const slotsRestants: Slot[] = t.slots.filter((s) => t.rounds.indexOf(s.round) >= r);
    const duTour = t.slots.filter((s) => s.round === t.rounds[r]);
    const m = propagerMoments(t, sc.survivants[r], r);
    const vivants = new Set(sc.survivants[r].filter((j): j is number => j !== null));
    const voulus = new Map<string, number>();
    if (k !== null) {
      const plan = planifier({
        slots: slotsRestants,
        esperances: m.esp,
        moitie,
        exclus: new Set([...utilises].map((j) => t.ids[j])),
        risque: { ecart: m.ecart, k },
      });
      for (const p of plan.picks) voulus.set(`${p.round}|${p.half ?? ''}`, t.ids.indexOf(p.playerId));
    }
    const pris = new Set<number>();
    for (const slot of duTour) {
      let choisi = voulus.get(`${slot.round}|${slot.half ?? ''}`) ?? -1;
      if (choisi < 0 || !vivants.has(choisi) || utilises.has(choisi) || pris.has(choisi)) {
        choisi = -1;
        let meilleur = -Infinity;
        for (const j of vivants) {
          if (utilises.has(j) || pris.has(j)) continue;
          if (slot.half && t.moitie[j] !== slot.half) continue;
          const e = m.esp[t.ids[j]]?.[t.rounds[r]] ?? 0;
          if (e > meilleur) {
            meilleur = e;
            choisi = j;
          }
        }
      }
      if (choisi >= 0) {
        pris.add(choisi);
        utilises.add(choisi);
        total += sc.points[r][choisi];
      }
    }
  }
  return total;
}

const quantile = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.round(q * (xs.length - 1))];

for (const slug of process.argv.slice(2)) {
  const { data } = await supabaseAnon().from('tn_tournaments').select('id').eq('slug', slug).order('start_date', { ascending: false }).limit(1);
  const id = data?.[0]?.id as string | undefined;
  if (!id) continue;
  const e = await loadEngineData(id);
  if (!e) continue;
  const rounds = e.tournament.rounds ?? [];
  const t = creerTableau(e.matches, e.players, rounds, (e.tournament.best_of ?? 3) as 3 | 5, surfacePourElo(e.tournament.surface));
  const rnd = creerRandom(11);
  const debut = Date.now();
  const scs = Array.from({ length: N }, () => tirer(t, rnd));
  const rival = scs.map((sc) => jouer(t, sc, null));
  console.log(`\n${slug} (${t.n} joueurs, ${t.slots.length} picks) — ${N} tournois, rivaux = écran historique`);
  console.log('        moyenne  mauvais  bon cas  devant les 2 rivaux');
  const lignes: [string, number | null][] = [['écran', null], ...KS.map((k): [string, number] => [`k=${k >= 0 ? '+' : ''}${k}`, k])];
  for (const [nom, k] of lignes) {
    const tot = scs.map((sc) => jouer(t, sc, k));
    const m = tot.reduce((s, x) => s + x, 0) / N;
    const premier = tot.reduce((s, x, i) => s + (x > rival[i] ? 1 : x === rival[i] ? 0.5 : 0), 0) / N;
    console.log(`  ${nom.padEnd(7)}${f(m)}${f(quantile(tot, 0.1))}${f(quantile(tot, 0.9))}   ${(100 * premier).toFixed(0)} %`);
  }
  console.log(`  (${((Date.now() - debut) / 1000).toFixed(0)} s)`);
}
