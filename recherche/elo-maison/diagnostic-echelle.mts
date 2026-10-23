/**
 * ELO MAISON - diagnostic d'echelle (LECTURE SEULE, cle anon).
 *
 * Compare la distribution des Elo de tn_elo_maison et de ta_elo, et la relation
 * classement -> Elo sur les joueurs de l'app (tn_players). Sert a recaler :
 *   - l'Elo des joueurs inconnus (db/elo.ts : ELO_DEFAUT_RESOLU = 1650, pense pour Tennis Abstract) ;
 *   - la conversion classement -> Elo (lib/elo.ts : eloDepuisRang, idem).
 *
 *   node --env-file=.env.local --experimental-loader ./scripts/test-loader.mjs recherche/elo-maison/diagnostic-echelle.mts
 */
import { createClient } from '@supabase/supabase-js';
import { chercherCorrespondance, construireIndex } from '../../lib/matching.ts';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function tout<T>(table: string, colonnes: string, filtre?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) {
    let q = sb.from(table).select(colonnes).range(i, i + 999);
    if (filtre) q = filtre(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table} : ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

const quantile = (v: number[], q: number) => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
};
const f = (x: number) => (Number.isFinite(x) ? x.toFixed(0) : 'n/a');
const aujourdhui = Math.floor(Date.now() / 86400000);

const COLS = 'ta_slug, ta_name, ta_name_normalized, country, tour, elo_overall, elo_hard, elo_clay, elo_grass, atp_rank, updated_at';

for (const tour of ['atp', 'wta'] as const) {
  const maison = await tout<any>('tn_elo_maison', `${COLS}, n, dernier_jour`, (q) => q.eq('tour', tour).order('ta_slug'));
  const ta = await tout<any>('ta_elo', COLS, (q) => q.eq('tour', tour).order('ta_slug'));
  const actifs = maison.filter((l) => l.n >= 20 && aujourdhui - l.dernier_jour <= 365);
  const eM = actifs.map((l) => Number(l.elo_overall));
  const eT = ta.map((l) => Number(l.elo_overall)).filter(Number.isFinite);
  console.log(`\n=== ${tour.toUpperCase()} ===`);
  console.log(`maison : ${maison.length} lignes, ${actifs.length} actifs (>=20 matchs, match < 1 an)`);
  console.log(`  Elo general actifs  p10 ${f(quantile(eM, 0.1))} p50 ${f(quantile(eM, 0.5))} p90 ${f(quantile(eM, 0.9))} p99 ${f(quantile(eM, 0.99))} max ${f(Math.max(...eM))}`);
  console.log(`  tous les joueurs     p50 ${f(quantile(maison.map((l) => Number(l.elo_overall)), 0.5))}`);
  console.log(`TA : ${ta.length} lignes  p10 ${f(quantile(eT, 0.1))} p50 ${f(quantile(eT, 0.5))} p90 ${f(quantile(eT, 0.9))} p99 ${f(quantile(eT, 0.99))} max ${f(Math.max(...eT))}`);

  // Joueurs de l'app (tn_players) : retrouves dans maison / TA, et distribution de leur Elo maison.
  const joueurs = await tout<any>('tn_players', 'id, name, tour', (q) => q.eq('tour', tour.toUpperCase()));
  const idxM = construireIndex(maison, []);
  const idxT = construireIndex(ta, []);
  const vM: number[] = [];
  const vT: number[] = [];
  const absents: string[] = [];
  const ambigus: string[] = [];
  for (const j of joueurs) {
    const cm = chercherCorrespondance(idxM, j.name);
    if (cm.statut === 'trouve') vM.push(Number(cm.ligne.elo_overall));
    else if (cm.statut === 'ambigu') ambigus.push(j.name);
    else absents.push(j.name);
    const ct = chercherCorrespondance(idxT, j.name);
    if (ct.statut === 'trouve') vT.push(Number(ct.ligne.elo_overall));
  }
  console.log(`joueurs de l'app : ${joueurs.length} ; trouves maison ${vM.length}, ambigus ${ambigus.length}, absents ${absents.length} ; trouves TA ${vT.length}`);
  console.log(`  Elo maison des joueurs de l'app  p5 ${f(quantile(vM, 0.05))} p10 ${f(quantile(vM, 0.1))} p25 ${f(quantile(vM, 0.25))} p50 ${f(quantile(vM, 0.5))} p75 ${f(quantile(vM, 0.75))} p95 ${f(quantile(vM, 0.95))}`);
  console.log(`  Elo TA des joueurs de l'app      p5 ${f(quantile(vT, 0.05))} p10 ${f(quantile(vT, 0.1))} p25 ${f(quantile(vT, 0.25))} p50 ${f(quantile(vT, 0.5))} p75 ${f(quantile(vT, 0.75))} p95 ${f(quantile(vT, 0.95))}`);
  console.log(`  absents (extrait) : ${absents.slice(0, 15).join(', ')}`);
  console.log(`  ambigus (extrait) : ${ambigus.slice(0, 15).join(', ')}`);
  // Quelques joueurs repere, maison contre TA.
  for (const nom of tour === 'atp' ? ['J. Sinner', 'C. Alcaraz', 'A. Zverev', 'N. Djokovic'] : ['A. Sabalenka', 'I. Swiatek', 'C. Gauff', 'A. Anisimova']) {
    const cm = chercherCorrespondance(idxM, nom);
    const ct = chercherCorrespondance(idxT, nom);
    const g = (c: any) => (c.statut === 'trouve' ? `${f(Number(c.ligne.elo_overall))}/${f(Number(c.ligne.elo_hard))}/${f(Number(c.ligne.elo_clay))}` : c.statut);
    console.log(`  ${nom.padEnd(14)} maison ${g(cm)}   TA ${g(ct)}   (general/dur/terre)`);
  }
}
