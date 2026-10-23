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
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chargerHistorique, RACINE } from './donnees.mts';
import { colonnesApp, PARAMS_PRODUCTION, rejouer, VERSION_ELO_MAISON } from '../../lib/eloMaison.ts';
import { chercherCorrespondance, construireIndex, normaliserNom } from '../../lib/matching.ts';

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

console.log('\nRattachement API -> archive :');
for (const [k, v] of Object.entries(h.stats).filter(([k]) => k.startsWith('api')).sort()) console.log(`  ${k.padEnd(28)} ${v}`);

// Controle : joueurs de l'app (tn_players) ambigus ou absents dans la table qui serait ecrite.
{
  const sbAnon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  for (const tour of ['atp', 'wta'] as const) {
    const idx = construireIndex(lignes.filter((x) => x.tour === tour) as any, []);
    const { data } = await sbAnon.from('tn_players').select('name').eq('tour', tour.toUpperCase()).range(0, 999);
    const noms = (data ?? []).map((d: { name: string }) => d.name).filter((n: string) => !/QUALIFIER|^Q\. |LUCKY|BYE/i.test(n));
    const amb: string[] = [];
    const abs: string[] = [];
    for (const n of noms) {
      const r = chercherCorrespondance(idx, n);
      if (r.statut === 'ambigu') amb.push(`${n} (${r.candidats.map((c: any) => c.ta_slug).join(', ')})`);
      else if (r.statut === 'absent') abs.push(n);
    }
    console.log(`\nControle ${tour.toUpperCase()} : ${noms.length} joueurs de l'app, ${amb.length} ambigus, ${abs.length} absents.`);
    for (const a of amb) console.log(`  ambigu : ${a}`);
    console.log(`  absents : ${abs.join(', ')}`);
  }
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
  const jourNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);

  // 0. Garde-fou : si le cron a déjà traité des jours APRÈS le dernier jour couvert ici, écrire
  //    ferait perdre ces jours (les notes repartiraient d'avant). On n'écrase pas sans --forcer.
  const { data: suivis, error: eSuivi } = await sb.from('tn_elo_maison_suivi').select('*');
  if (eSuivi) throw new Error(`tn_elo_maison_suivi : ${eSuivi.message}`);
  for (const s of suivis ?? []) {
    const c = couvert[s.tour as 'atp'];
    if (c && s.dernier_jour_traite > c && !process.argv.includes('--forcer')) {
      throw new Error(`Le suivi ${s.tour} est déjà au ${s.dernier_jour_traite}, après ${c} : compléter le cache API (combler-api.mjs) ou relancer avec --forcer.`);
    }
  }

  // 1. Sauvegarde complète de la table avant toute écriture.
  const avant: any[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from('tn_elo_maison').select('*').order('ta_slug').range(i, i + 999);
    if (error) throw new Error(`tn_elo_maison : ${error.message}`);
    avant.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const dossier = join(RACINE, 'sauvegardes');
  mkdirSync(dossier, { recursive: true });
  const fichier = join(dossier, `tn_elo_maison-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(fichier, JSON.stringify({ suivis, lignes: avant }));
  console.log(`\nSauvegarde : ${avant.length} lignes, ${fichier}`);

  // 2. Doublons d'identifiant API (deux clés rattachées au même id) : on n'en garde aucun.
  const vus = new Map<string, number>();
  for (const x of lignes) if (x.matchstat_id) vus.set(`${x.tour}|${x.matchstat_id}`, (vus.get(`${x.tour}|${x.matchstat_id}`) ?? 0) + 1);
  for (const x of lignes) if (x.matchstat_id && (vus.get(`${x.tour}|${x.matchstat_id}`) ?? 0) > 1) x.matchstat_id = null;

  // 3. Les lignes de l'ancien amorçage qui ne sont plus produites (doublons fusionnés, joueurs
  //    rattachés à l'archive) disparaissent, sinon elles resteraient en homonymes. Seules sont
  //    concernées celles dont le dernier match est couvert par cet amorçage ; une ligne créée
  //    plus tard par le cron est conservée. Le matchstat_id est libéré AVANT l'écriture : un
  //    index unique (tour, matchstat_id) interdit sinon deux lignes pour le même identifiant.
  const nouvelles = new Set(lignes.map((x) => x.ta_slug));
  const obsoletes = avant.filter((l) => !nouvelles.has(l.ta_slug) && l.dernier_jour <= jourNum(couvert[l.tour as 'atp']));
  for (let i = 0; i < obsoletes.length; i += 200) {
    const { error } = await sb.from('tn_elo_maison').delete().in('ta_slug', obsoletes.slice(i, i + 200).map((l) => l.ta_slug));
    if (error) throw new Error(`tn_elo_maison (purge) : ${error.message}`);
  }
  console.log(`Purge : ${obsoletes.length} ligne(s) obsolète(s) supprimée(s) (sauvegardées ci-dessus).`);

  // 4. Écriture.
  for (let i = 0; i < lignes.length; i += 500) {
    const { error } = await sb.from('tn_elo_maison').upsert(lignes.slice(i, i + 500), { onConflict: 'ta_slug' });
    if (error) throw new Error(`tn_elo_maison : ${error.message}`);
  }
  for (const tour of ['atp', 'wta'] as const) {
    const { error } = await sb.from('tn_elo_maison_suivi').upsert(
      {
        tour,
        dernier_jour_traite: couvert[tour],
        matchs_traites: h.matchs.filter((m) => m.tour === tour.toUpperCase()).length,
        version: VERSION_ELO_MAISON,
        mis_a_jour: new Date().toISOString(),
      },
      { onConflict: 'tour' },
    );
    if (error) throw new Error(`tn_elo_maison_suivi : ${error.message}`);
  }
  console.log(`\nÉcrit : ${lignes.length} joueurs, suivi ATP ${couvert.atp} / WTA ${couvert.wta}.`);
}