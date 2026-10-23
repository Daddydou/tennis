/**
 * ELO MAISON — comparaison avec Tennis Abstract et les cotes, sur les matchs de L'APP.
 *
 * Pour chaque match joué d'un tournoi importé dans l'app (à partir du premier relevé Tennis
 * Abstract archivé, fin juillet 2026), trois probabilités AVANT le match :
 *   - Elo Tennis Abstract tel que l'app l'utilise : dernier relevé de ta_elo_historique
 *     antérieur au match, rapproché par le nom (même code que l'app), 0,6 surface / 0,4
 *     général, échelle 400 ;
 *   - Elo maison : rejoué depuis 1990 jusqu'au match (paramètres retenus + recalibrage) ;
 *   - marché : tn_odds (consensus sans marge, capturé avant le coup d'envoi), quand il existe.
 * Mêmes matchs pour les méthodes comparées, mêmes mesures.
 *
 * Trou de données : l'archive s'arrête début juin, l'API est téléchargée au fil des jours.
 * Les matchs des tournois de l'app postérieurs au dernier jour couvert par l'API sont
 * AJOUTÉS à l'historique (comme un import) avant de rejouer — sans les Challengers de cette
 * période : désavantage pour l'Elo maison, à garder en tête tant que le trou n'est pas comblé.
 *
 *   node --max-old-space-size=6144 --env-file=.env.local --experimental-loader ./scripts/test-loader.mjs recherche/elo-maison/comparer.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chargerHistorique, type MatchHisto, type Niveau, type Surface } from './donnees.mts';
import { mesurer, rejouer, versBo5, type Params } from './modele.mts';
import { chercherCorrespondance, construireIndex, type LigneTa } from '../../lib/matching.ts';

const DOSSIER = join(import.meta.dirname, 'resultats');
const params: Params = JSON.parse(readFileSync(join(DOSSIER, 'params-optimaux.json'), 'utf8'));
const recal = JSON.parse(readFileSync(join(DOSSIER, 'evaluation.json'), 'utf8')).recalibrage as number;
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

const h = chargerHistorique({ debut: 1990 });
const finHisto = h.matchs.reduce((m, x) => (x.date > m ? x.date : m), '0');
console.log(`Historique : ${h.matchs.length} matchs jusqu'au ${finHisto}`);

type T = { id: string; name: string; tour: 'ATP' | 'WTA'; surface: Surface; start_date: string; best_of: number; category: string };
type M = { tournament_id: string; round: string; round_order: number; position: number; player1_id: string; player2_id: string; winner_id: string | null; status: string; sets: { g1: number; g2: number }[] };
type P = { id: string; name: string; tour: string };
const tournois = await tout<T>('tn_tournaments', 'id, name, tour, surface, start_date, best_of, category', (q) => q.gte('start_date', '2026-05-25'));
const matchsApp = await tout<M>('tn_matches', 'tournament_id, round, round_order, position, player1_id, player2_id, winner_id, status, sets', (q) => q.in('tournament_id', tournois.map((t) => t.id)));
const joueursApp = await tout<P>('tn_players', 'id, name, tour');
const nomApp = new Map(joueursApp.map((j) => [j.id, j]));

// --- Joueurs de l'app → clés de l'historique (même rapprochement par nom que l'app pour TA) ---
const actifs = new Set<string>();
for (const m of h.matchs) if (m.date >= '20250101') { actifs.add(m.gagnant); actifs.add(m.perdant); }
const index = { ATP: null as any, WTA: null as any };
for (const tour of ['ATP', 'WTA'] as const) {
  const lignes: LigneTa[] = [];
  for (const k of actifs) {
    if (!k.startsWith(tour)) continue;
    const j = h.joueurs.get(k);
    if (!j) continue;
    const { normaliserNom } = await import('../../lib/matching.ts');
    lignes.push({ ta_name: j.nom, ta_name_normalized: normaliserNom(j.nom), ta_slug: k });
  }
  index[tour] = construireIndex(lignes, []);
}
const cleDe = new Map<string, string | null>();
for (const j of joueursApp) {
  const t = (j.tour === 'WTA' ? 'WTA' : 'ATP') as 'ATP' | 'WTA';
  const r = chercherCorrespondance(index[t], j.name);
  cleDe.set(j.id, r.statut === 'trouve' ? r.ligne.ta_slug : null);
}

// --- Matchs de l'app ajoutés à l'historique après sa fin ---
const jourDe = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);
const niveauDe = (c: string): Niveau => (c === 'GS' ? 'G' : c === 'M1000' || c === 'WTA1000' ? 'M' : c === 'Finals' || c === 'WTAFinals' ? 'F' : 'A');
const tournoiDe = new Map(tournois.map((t) => [t.id, t]));
const ajoutes: { i: number; app: M }[] = [];
const extra: MatchHisto[] = [];
for (const m of matchsApp) {
  const t = tournoiDe.get(m.tournament_id)!;
  if (!m.winner_id || !m.player1_id || !m.player2_id || m.status !== 'completed' && m.status !== 'retired') continue;
  const date = t.start_date.replace(/-/g, '');
  const jour = jourDe(t.start_date) + (m.round_order ?? 1) * (t.category === 'GS' ? 1.6 : 0.9);
  const kg = cleDe.get(m.winner_id);
  const perdantId = m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
  const kp = cleDe.get(perdantId);
  const g1 = (m.sets ?? []).reduce((s, x) => s + (x.g1 ?? 0), 0);
  const g2 = (m.sets ?? []).reduce((s, x) => s + (x.g2 ?? 0), 0);
  const gagnantEst1 = m.winner_id === m.player1_id;
  const rec: MatchHisto = {
    tour: t.tour, jour, date, niveau: niveauDe(t.category), surface: t.surface, bestOf: t.best_of === 5 ? 5 : 3,
    gagnant: kg ?? `${t.tour}:app${m.winner_id}`, perdant: kp ?? `${t.tour}:app${perdantId}`,
    jeuxG: gagnantEst1 ? g1 : g2, jeuxP: gagnantEst1 ? g2 : g1, abandon: m.status === 'retired',
    tournoi: t.name, tour_: m.round, rangG: null, rangP: null, source: 'api',
  };
  // Après la fin de l'historique seulement (sinon le match y est déjà, via l'archive ou l'API).
  if (date > finHisto) extra.push(rec);
  ajoutes.push({ i: -1, app: m });
  (rec as any).__app = m;
}
const tous = [...h.matchs, ...extra].sort((a, b) => a.jour - b.jour);
const r = rejouer(tous, params);
const logit = (p: number) => Math.log(p / (1 - p));
const pMaison = (p: number) => 1 / (1 + Math.exp(-recal * logit(Math.min(1 - 1e-9, Math.max(1e-9, p)))));

// Prédiction maison pour CHAQUE match de l'app : retrouvée dans l'historique rejoué (archive,
// API ou ajout ci-dessus) par la paire de joueurs à ±10 jours du début du tournoi.
const parPaire = new Map<string, number[]>();
tous.forEach((m, i) => {
  if (m.date < '20260520') return;
  const k = [m.gagnant, m.perdant].sort().join('|');
  (parPaire.get(k) ?? parPaire.set(k, []).get(k)!).push(i);
});

// --- Tennis Abstract au fil des relevés ---
type TA = { releve_le: string; tour: string; ta_name: string; ta_name_normalized: string; ta_slug: string; elo_overall: number; elo_hard: number | null; elo_clay: number | null; elo_grass: number | null };
const ta = await tout<TA>('ta_elo_historique', 'releve_le, tour, ta_name, ta_name_normalized, ta_slug, elo_overall, elo_hard, elo_clay, elo_grass');
const exceptions = await tout<any>('ta_name_exceptions', 'atp_name_normalized, ta_name_normalized, ta_slug, tour');
const releves = new Map<string, ReturnType<typeof construireIndex<TA>>>();
for (const cle of new Set(ta.map((x) => `${x.tour}|${x.releve_le}`))) {
  const [tour, d] = cle.split('|');
  releves.set(cle, construireIndex(ta.filter((x) => x.tour === tour && x.releve_le === d), exceptions.filter((e) => e.tour === tour)));
}
const datesReleve = (tour: string) => [...releves.keys()].filter((k) => k.startsWith(tour)).map((k) => k.split('|')[1]).sort();
const surfTA = (x: TA, s: Surface) => Number((s === 'clay' ? x.elo_clay : s === 'grass' ? x.elo_grass : x.elo_hard) ?? x.elo_overall);
const effTA = (x: TA, s: Surface) => 0.6 * surfTA(x, s) + 0.4 * Number(x.elo_overall);

// --- Cotes ---
type O = { tournament_id: string; player_a_id: string; player_b_id: string; proba_a: number; commence_time: string | null; recupere_le: string };
const cotes = await tout<O>('tn_odds', 'tournament_id, player_a_id, player_b_id, proba_a, commence_time, recupere_le', (q) => q.in('tournament_id', tournois.map((t) => t.id)));
const coteDe = (m: M, gagnant: string) => {
  const o = cotes.find((c) => c.tournament_id === m.tournament_id && new Set([c.player_a_id, c.player_b_id]).has(m.player1_id) && new Set([c.player_a_id, c.player_b_id]).has(m.player2_id));
  if (!o || !o.commence_time || o.recupere_le >= o.commence_time || o.proba_a == null) return null;
  return o.player_a_id === gagnant ? Number(o.proba_a) : 1 - Number(o.proba_a);
};

// --- Échantillon de comparaison ---
const lignes: { tour: string; gs: boolean; ta: number; ta2: number; maison: number; marche: number | null }[] = [];
let sansTA = 0, sansMaison = 0;
for (const m of matchsApp) {
  const t = tournoiDe.get(m.tournament_id)!;
  if (!m.winner_id || !m.player1_id || !m.player2_id || (m.status !== 'completed' && m.status !== 'retired')) continue;
  const tourMin = t.tour.toLowerCase();
  const avant = datesReleve(tourMin).filter((d) => d <= t.start_date).at(-1);
  if (!avant) continue; // avant le premier relevé TA archivé
  const idx = releves.get(`${tourMin}|${avant}`)!;
  const perdantId = m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
  const cg = chercherCorrespondance(idx, nomApp.get(m.winner_id)?.name ?? '');
  const cp = chercherCorrespondance(idx, nomApp.get(perdantId)?.name ?? '');
  if (cg.statut !== 'trouve' || cp.statut !== 'trouve') { sansTA++; continue; }
  const pTA = 1 / (1 + Math.pow(10, -(effTA(cg.ligne, t.surface) - effTA(cp.ligne, t.surface)) / 400));
  // Variante « TA mieux utilisé » : 0,5 surface / 0,5 général (ce que recommande Tennis Abstract)
  // et conversion 3 sets gagnants en Grand Chelem masculin.
  const eff5 = (x: TA) => 0.5 * surfTA(x, t.surface) + 0.5 * Number(x.elo_overall);
  const p3 = 1 / (1 + Math.pow(10, -(eff5(cg.ligne) - eff5(cp.ligne)) / 400));
  const pTA2 = t.best_of === 5 ? versBo5(p3) : p3;
  const kg = cleDe.get(m.winner_id) ?? `${t.tour}:app${m.winner_id}`;
  const kp = cleDe.get(perdantId) ?? `${t.tour}:app${perdantId}`;
  const debutJ = jourDe(t.start_date);
  const i = (parPaire.get([kg, kp].sort().join('|')) ?? []).find((j) => Math.abs(tous[j].jour - debutJ) <= 16 && tous[j].gagnant === kg);
  if (i === undefined || !cleDe.get(m.winner_id) || !cleDe.get(perdantId)) { sansMaison++; continue; }
  lignes.push({ tour: t.tour, gs: t.category === 'GS', ta: pTA, ta2: pTA2, maison: pMaison(r.p[i]), marche: coteDe(m, m.winner_id) });
}

const mes = (vals: number[]) => mesurer(Float64Array.from(vals), () => true);
const sortie: string[] = [`Matchs de l'app comparables : ${lignes.length} (écartés : ${sansTA} sans Elo TA, ${sansMaison} sans Elo maison)`];
const bloc = (titre: string, l: typeof lignes, avecMarche: boolean) => {
  if (!l.length) return;
  const a = mes(l.map((x) => x.ta)), b = mes(l.map((x) => x.maison));
  const a2 = mes(l.map((x) => x.ta2));
  let s = `${titre.padEnd(34)} n=${String(l.length).padStart(4)} | log-loss TA ${a.logLoss.toFixed(4)} · TA 50/50+bo5 ${a2.logLoss.toFixed(4)} · maison ${b.logLoss.toFixed(4)}`;
  let t = ` | Brier ${a.brier.toFixed(4)} / ${b.brier.toFixed(4)} | exact. ${(a.exactitude * 100).toFixed(1)} / ${(b.exactitude * 100).toFixed(1)} %`;
  if (avecMarche) {
    const c = mes(l.map((x) => x.marche!));
    s += ` · marché ${c.logLoss.toFixed(4)}`;
    t += ` / marché ${(c.exactitude * 100).toFixed(1)} %`;
  }
  // Écart apparié maison − TA (log-loss par match) : moyenne ± 1,96 erreur type.
  const d = l.map((x) => -Math.log(Math.max(1e-9, x.maison)) + Math.log(Math.max(1e-9, x.ta)));
  const moy = d.reduce((a2, b2) => a2 + b2, 0) / d.length;
  const et = Math.sqrt(d.reduce((a2, b2) => a2 + (b2 - moy) ** 2, 0) / (d.length - 1) / d.length);
  t += ` | écart maison−TA ${moy >= 0 ? '+' : ''}${moy.toFixed(4)} [${(moy - 1.96 * et).toFixed(4)} ; ${(moy + 1.96 * et).toFixed(4)}]`;
  sortie.push(s + t);
};
bloc('Tous', lignes, false);
bloc('ATP', lignes.filter((x) => x.tour === 'ATP'), false);
bloc('WTA', lignes.filter((x) => x.tour === 'WTA'), false);
bloc('Grand Chelem', lignes.filter((x) => x.gs), false);
const avecCotes = lignes.filter((x) => x.marche !== null);
bloc('Avec cotes (TA / maison / marché)', avecCotes, true);

// --- Poids du mélange Elo / marché : p = w·Elo + (1−w)·marché (`blendAvecCotes`, lib/elo.ts) ---
// Production : POIDS_ELO_MARCHE = 0,3. On cherche le w qui minimise la log-loss sur les matchs
// AVEC cotes, pour l'Elo maison et pour Tennis Abstract, puis un bootstrap (rééchantillonnage
// des matchs) dit si l'écart au poids de production est réel ou du bruit.
{
  const ll = (l: typeof lignes, w: number, cle: 'maison' | 'ta') =>
    l.reduce((s, x) => s - Math.log(Math.max(1e-9, w * x[cle] + (1 - w) * x.marche!)), 0) / l.length;
  const grille = Array.from({ length: 21 }, (_, i) => i / 20);
  const meilleur = (l: typeof lignes, cle: 'maison' | 'ta') =>
    grille.reduce((b, w) => (ll(l, w, cle) < ll(l, b, cle) ? w : b), 0);
  let graine = 12345;
  const alea = () => ((graine = (graine * 1664525 + 1013904223) % 4294967296) / 4294967296);
  sortie.push('', 'Poids du mélange Elo / marché (w = part de l’Elo ; production 0,30) — log-loss, plus bas = mieux');
  for (const [nom, l] of [['Tous', avecCotes], ['ATP', avecCotes.filter((x) => x.tour === 'ATP')], ['WTA', avecCotes.filter((x) => x.tour === 'WTA')]] as const) {
    if (l.length < 30) continue;
    for (const cle of ['maison', 'ta'] as const) {
      const w0 = meilleur(l, cle);
      const optima: number[] = [];
      const gains: number[] = [];
      for (let b = 0; b < 1000; b++) {
        const ech = Array.from({ length: l.length }, () => l[Math.floor(alea() * l.length)]);
        const wb = meilleur(ech, cle);
        optima.push(wb);
        gains.push(ll(ech, 0.3, cle) - ll(ech, wb, cle));
      }
      optima.sort((a, b) => a - b);
      gains.sort((a, b) => a - b);
      sortie.push(
        `${nom.padEnd(5)} ${cle.padEnd(6)} n=${String(l.length).padStart(3)} | marché seul ${ll(l, 0, cle).toFixed(4)} · w=0,3 ${ll(l, 0.3, cle).toFixed(4)} · w*=${w0.toFixed(2)} ${ll(l, w0, cle).toFixed(4)} · Elo seul ${ll(l, 1, cle).toFixed(4)}` +
          ` | w* bootstrap 5-95 % [${optima[50].toFixed(2)} ; ${optima[949].toFixed(2)}] · gain moyen de w* sur 0,3 : ${(gains.reduce((a, b) => a + b, 0) / gains.length).toFixed(4)}`,
      );
    }
  }
}console.log(sortie.join('\n'));
writeFileSync(join(DOSSIER, `comparaison-${new Date().toISOString().slice(0, 10)}.txt`), `${sortie.join('\n')}\nHistorique jusqu'au ${finHisto}, ${extra.length} matchs de l'app ajoutés après.\n`);
