/**
 * Plan de picks d'un tournoi EN COURS, pour « Moi » — lecture seule (n'écrit rien).
 *
 *   node --env-file=.env.local --experimental-loader ../_donnees/loader-profil.mjs recherche/plan-picks/plan-actuel.mts basel vienna
 *
 * Reprend ce que fait l'écran Picks : tour courant = premier tour dont les
 * picks ne sont pas tous posés ; espérances = projections Monte Carlo en cache
 * pour ce tour (blend Elo/cotes compris).
 */
import { supabaseAnon } from '../../db/anon';
import { loadEngineData } from '../../db/moteur';
import { projectionsEnCache } from '../../db/projections';
import { getTousLesPicks, surfacePourElo } from '../../db/queries';
import { simulerDepuis } from '../../lib/montecarloTournoi';
import { genererSlots, recommanderPourTour } from '../../lib/optimizer';
import { planAvecPlanB } from '../../lib/planPicks';
import type { Half } from '../../lib/types';

const f = (x: number) => x.toFixed(1);

for (const slug of process.argv.slice(2)) {
  const { data } = await supabaseAnon().from('tn_tournaments').select('id, name, tour').eq('slug', slug).order('start_date', { ascending: false }).limit(1);
  const l = data?.[0];
  if (!l) {
    console.log(`${slug}: introuvable`);
    continue;
  }
  const [e, tous] = await Promise.all([loadEngineData(l.id as string), getTousLesPicks(l.id as string)]);
  if (!e) continue;
  const rounds = e.tournament.rounds ?? [];
  const slots = genererSlots(rounds);
  const mes = tous.filter((p) => (p.participant_id ?? null) === null);
  const pris = new Set(mes.map((p) => `${p.round}|${p.half ?? ''}`));
  const restants = slots.filter((s) => !pris.has(`${s.round}|${s.half ?? ''}`));
  const exclus = new Set(mes.map((p) => p.player_id));
  const courant = restants[0]?.round ?? null;
  console.log(`\n=== ${l.name} (${l.tour}) — picks posés : ${mes.length}/${slots.length}, tour courant : ${courant ?? 'aucun'}`);
  if (!courant) continue;

  let proj = await projectionsEnCache(l.id as string, courant);
  if (!proj) {
    console.log('  (cache vide pour ce tour : Monte Carlo Elo seul recalculé ici, 20 000 tirages)');
    const surface = surfacePourElo(e.tournament.surface);
    const mc = simulerDepuis(e.matches, e.players, rounds, process.env.DEPART ?? courant, 20000, (e.tournament.best_of ?? 3) as 3 | 5, surface);
    proj = { esperances: mc.esperances } as typeof proj;
  }
  const moitie: Record<string, Half> = {};
  for (const [id, p] of Object.entries(e.players)) moitie[id] = p.half;
  const nom = (id: string) => `${e.players[id]?.name ?? id} (#${e.players[id]?.rank ?? '?'})`;

  const plan = planAvecPlanB({ slots: restants, esperances: proj.esperances, moitie, exclus });
  console.log(`  Plan complet — espérance totale ${f(plan.total)} pts`);
  for (const p of plan.picks) {
    const b = p.planB ? ` | plan B : ${nom(p.planB.playerId)} (−${f(p.planB.perte)} pt sur le plan)` : '';
    console.log(`   ${p.round.padEnd(4)} ${(p.half ?? 'unique').padEnd(7)} ${nom(p.playerId).padEnd(34)} ${f(p.ePoints).padStart(5)}${b}`);
  }
  if (plan.sansJoueur.length) console.log(`   sans joueur : ${plan.sansJoueur.map((s) => `${s.round} ${s.half ?? ''}`).join(', ')}`);

  console.log(`  Écran actuel, tour ${courant} (3 premiers par moitié) :`);
  for (const s of restants.filter((x) => x.round === courant)) {
    const reco = recommanderPourTour(proj.esperances, e.players, courant, s.half, exclus, 3);
    console.log(`   ${(s.half ?? 'unique').padEnd(7)} ${reco.map((r) => `${nom(r.playerId)} ${f(r.ePoints)}`).join('  >  ')}`);
  }
}
