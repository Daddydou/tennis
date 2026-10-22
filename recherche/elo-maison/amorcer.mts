/**
 * ELO MAISON — amorçage de la table tn_elo_maison (migration 0028) depuis l'historique.
 *
 * Rejoue 1990 → dernier jour couvert (archive + API en cache) avec les paramètres de
 * production (lib/eloMaison.ts), puis écrit les joueurs actifs depuis 2024 et le dernier
 * jour traité par circuit (tn_elo_maison_suivi). La mise à jour quotidienne
 * (db/eloMaison.ts) repart de là.
 *
 *   node --max-old-space-size=6144 --env-file=.env.local --experimental-loader ./scripts/test-loader.mjs recherche/elo-maison/amorcer.mts            # aperçu, rien n'est écrit
 *   … amorcer.mts --ecrire                                                                                                                     # écrit (service role)
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chargerHistorique, RACINE } from './donnees.mts';
import { colonnesApp, PARAMS_PRODUCTION, rejouer, VERSION_ELO_MAISON } from '../../lib/eloMaison.ts';
import { normaliserNom } from '../../lib/matching.ts';

const ECRIRE = process.argv.includes('--ecrire');
const h = chargerHistorique({ debut: 1990 });
const { notes } = rejouer(h.matchs, PARAMS_PRODUCTION);

// Dernier jour couvert SANS TROU par les pages de l'API, par circuit (fenêtres consécutives).
const couvert: Record<'atp' | 'wta', string> = { atp: '2026-05-31', wta: '2026-05-31' };
for (const tour of ['atp', 'wta'] as const) {
  const fenetres = readdirSync(join(RACINE, 'api'))
    .filter((f) => f.startsWith(`${tour}-`) && f.endsWith('-p1.json'))
    .map((f) => f.match(/^\w+-(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})-p1\.json$/)!)
    .map((m) => ({ debut: m[1], fin: m[2] }))
    .sort((a, b) => a.debut.localeCompare(b.debut));
  for (const f of fenetres) {
    const lendemain = new Date(Date.parse(`${couvert[tour]}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    if (f.debut !== lendemain) break;
    couvert[tour] = f.fin;
  }
}

// Identifiant API de chaque joueur de l'historique (rattachement fait au chargement).
const matchstat = new Map<string, string>();
for (const [cleApi, cle] of h.liensApi) matchstat.set(cle, cleApi.split(':m')[1]);

const DEPUIS = Math.floor(Date.parse('2024-01-01T00:00:00Z') / 86400000);
const lignes = [];
for (const [cle, n] of notes) {
  if (n.dernierJour < DEPUIS) continue;
  const j = h.joueurs.get(cle);
  if (!j) continue;
  const tour = cle.startsWith('WTA') ? 'wta' : 'atp';
  lignes.push({
    ta_slug: cle,
    tour,
    ta_name: j.nom,
    ta_name_normalized: normaliserNom(j.nom),
    country: j.pays,
    matchstat_id: matchstat.get(cle) ?? (cle.includes(':m') ? cle.split(':m')[1] : null),
    ...colonnesApp(n),
    atp_rank: null,
    note_generale: n.general,
    note_dur: n.surface[0],
    note_terre: n.surface[1],
    note_gazon: n.surface[2],
    note_moquette: n.surface[3],
    n: n.n,
    n_dur: n.nSurface[0],
    n_terre: n.nSurface[1],
    n_gazon: n.nSurface[2],
    n_moquette: n.nSurface[3],
    dernier_jour: Math.floor(n.dernierJour),
  });
}

for (const tour of ['atp', 'wta']) {
  const l = lignes.filter((x) => x.tour === tour).sort((a, b) => b.note_generale - a.note_generale);
  console.log(`\n${tour.toUpperCase()} : ${l.length} joueurs actifs depuis 2024, données jusqu'au ${couvert[tour as 'atp']}`);
  for (const x of l.slice(0, 12)) {
    console.log(`  ${x.ta_name.padEnd(26)} général ${x.note_generale.toFixed(0)} (n=${x.n}) · app : dur ${x.elo_hard.toFixed(0)} terre ${x.elo_clay.toFixed(0)} gazon ${x.elo_grass.toFixed(0)}`);
  }
}

if (!ECRIRE) {
  console.log('\nAperçu : rien n’a été écrit (ajouter --ecrire).');
} else {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Doublons d'identifiant API (deux clés rattachées au même id) : on n'en garde aucun.
  const vus = new Map<string, number>();
  for (const x of lignes) if (x.matchstat_id) vus.set(`${x.tour}|${x.matchstat_id}`, (vus.get(`${x.tour}|${x.matchstat_id}`) ?? 0) + 1);
  for (const x of lignes) if (x.matchstat_id && (vus.get(`${x.tour}|${x.matchstat_id}`) ?? 0) > 1) x.matchstat_id = null;
  for (let i = 0; i < lignes.length; i += 500) {
    const { error } = await sb.from('tn_elo_maison').upsert(lignes.slice(i, i + 500), { onConflict: 'ta_slug' });
    if (error) throw new Error(`tn_elo_maison : ${error.message}`);
  }
  for (const tour of ['atp', 'wta'] as const) {
    const { error } = await sb.from('tn_elo_maison_suivi').upsert(
      { tour, dernier_jour_traite: couvert[tour], matchs_traites: 0, version: VERSION_ELO_MAISON, mis_a_jour: new Date().toISOString() },
      { onConflict: 'tour' },
    );
    if (error) throw new Error(`tn_elo_maison_suivi : ${error.message}`);
  }
  console.log(`\nÉcrit : ${lignes.length} joueurs, suivi ATP ${couvert.atp} / WTA ${couvert.wta}.`);
}
