/**
 * BACKTEST DES INSIGHTS JOUEURS — les drapeaux (blessure, charge, forfait) disent-ils
 * quelque chose que le marché ne sait pas déjà ?
 *
 * Question posée : pour les joueurs marqués, après la date de la recherche (`as_of`),
 * le nombre de victoires réelles s'écarte-t-il du nombre de victoires que les COTES
 * attendaient ? Le marché connaît déjà les blessures publiques : un drapeau n'a de valeur
 * que s'il fait mieux. On compare donc au marché, pas à l'Elo.
 *
 * Pas de regard dans le futur : on ne garde que les matchs dont l'heure de début
 * (`tn_odds.commence_time`) est strictement APRÈS le jour de la recherche.
 *
 * Test placebo : le même écart est recalculé pour des tirages au hasard de joueurs du même
 * tournoi (même nombre que les joueurs marqués). La place de l'écart observé dans cette
 * distribution (p) dit si le résultat est du hasard. Tant que l'échantillon est petit,
 * le script le dit et ne conclut pas.
 *
 * LECTURE SEULE — clé anon uniquement.
 *
 *   npm run backtest:insights
 *   npm run backtest:insights -- --confiance=high      (drapeaux de confiance haute seulement)
 *   npm run backtest:insights -- --tirages=20000
 */
import { createClient } from '@supabase/supabase-js';

const arg = (nom: string) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.split('=')[1];
const confianceMin = arg('confiance'); // 'high' | 'medium' | undefined (toutes)
const tirages = Number(arg('tirages') ?? 5000);
/** En dessous, on affiche mais on ne conclut pas. ~30 matchs par groupe : l'écart-type vaut alors ~2,7 victoires. */
const SEUIL_MATCHS = 30;
/** Nombre de tournois visé avant de conclure (cf. documentation de l'agent de recherche). */
const SEUIL_TOURNOIS = 15;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquantes (--env-file=.env.local).');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function lire<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>, quoi: string): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(`${quoi} : ${error.message}`);
  return (data ?? []) as T;
}

interface Insight {
  tournament_id: string;
  player_id: string;
  injury_risk: boolean;
  withdrawn: boolean;
  heavy_load: boolean;
  confidence: string | null;
  as_of: string;
}
interface Match { tournament_id: string; player1_id: string | null; player2_id: string | null; winner_id: string | null; status: string | null }
interface Cote { tournament_id: string; player_a_id: string | null; player_b_id: string | null; proba_a: number | string | null; proba_b: number | string | null; commence_time: string | null }

const tousInsights = await lire<Insight[]>(
  sb.from('tn_player_insights').select('tournament_id, player_id, injury_risk, withdrawn, heavy_load, confidence, as_of'),
  'tn_player_insights',
);
const rang = { low: 0, medium: 1, high: 2 } as Record<string, number>;
const insights = tousInsights.filter((i) => !confianceMin || (rang[i.confidence ?? 'low'] ?? 0) >= (rang[confianceMin] ?? 0));
const tournois = [...new Set(tousInsights.map((i) => i.tournament_id))];
if (tournois.length === 0) {
  console.log('Aucun insight en base.');
  process.exit(0);
}
const matchs = await lire<Match[]>(
  sb.from('tn_matches').select('tournament_id, player1_id, player2_id, winner_id, status').in('tournament_id', tournois),
  'tn_matches',
);
const cotes = await lire<Cote[]>(
  sb.from('tn_odds').select('tournament_id, player_a_id, player_b_id, proba_a, proba_b, commence_time').in('tournament_id', tournois),
  'tn_odds',
);

/** Une observation = un joueur dans un match terminé, avec la probabilité du marché pour lui. */
interface Obs { tournoi: string; joueur: string; gagne: boolean; p: number; apres: Date }
const obs: Obs[] = [];
for (const c of cotes) {
  if (!c.player_a_id || !c.player_b_id || !c.commence_time) continue;
  const m = matchs.find(
    (x) =>
      x.tournament_id === c.tournament_id &&
      x.winner_id &&
      x.status !== 'bye' &&
      ((x.player1_id === c.player_a_id && x.player2_id === c.player_b_id) || (x.player1_id === c.player_b_id && x.player2_id === c.player_a_id)),
  );
  if (!m) continue;
  const quand = new Date(c.commence_time);
  for (const [joueur, p] of [
    [c.player_a_id, Number(c.proba_a)],
    [c.player_b_id, Number(c.proba_b)],
  ] as [string, number][]) {
    if (!Number.isFinite(p)) continue;
    obs.push({ tournoi: c.tournament_id, joueur, gagne: m.winner_id === joueur, p, apres: quand });
  }
}

/** Observations d'un insight : seulement les matchs APRÈS le jour de la recherche. */
const apresRecherche = (i: Insight) => {
  const limite = new Date(`${i.as_of}T00:00:00Z`).getTime() + 86400000;
  return obs.filter((o) => o.tournoi === i.tournament_id && o.joueur === i.player_id && o.apres.getTime() >= limite);
};

const groupes: Record<string, (i: Insight) => boolean> = {
  'blessure ou forfait': (i) => i.injury_risk || i.withdrawn,
  charge: (i) => i.heavy_load && !i.injury_risk && !i.withdrawn,
  'tous les drapeaux': (i) => i.injury_risk || i.withdrawn || i.heavy_load,
  'contexte seul (aucun drapeau)': (i) => !(i.injury_risk || i.withdrawn || i.heavy_load),
};

// Générateur pseudo-aléatoire reproductible.
function alea(graine: number) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

console.log(`Insights : ${insights.length} lignes (${tousInsights.length - insights.length} écartées par le filtre de confiance), ${tournois.length} tournoi(s).`);
console.log(`Observations avec cote : ${obs.length} (joueur x match). Baseline : le marché (cotes dé-marginées).\n`);

let nbTournoisUtiles = 0;
const tournoisAvecObs = new Set<string>();
for (const [nom, test] of Object.entries(groupes)) {
  const lignes = insights.filter(test);
  const observations = lignes.flatMap(apresRecherche);
  for (const o of observations) tournoisAvecObs.add(o.tournoi);
  const n = observations.length;
  if (n === 0) {
    console.log(`${nom.padEnd(32)} : ${lignes.length} joueur(s), aucun match après la recherche.`);
    continue;
  }
  const victoires = observations.filter((o) => o.gagne).length;
  const attendu = observations.reduce((s, o) => s + o.p, 0);
  const sigma = Math.sqrt(observations.reduce((s, o) => s + o.p * (1 - o.p), 0));
  const ecart = victoires - attendu;

  // Placebo : même nombre de joueurs, tirés au hasard parmi ceux du même tournoi, sur les mêmes jours.
  const rnd = alea(2026);
  const joueursDuGroupe = lignes.filter((i) => apresRecherche(i).length > 0);
  let moinsBons = 0;
  for (let t = 0; t < tirages; t++) {
    let s = 0;
    for (const i of joueursDuGroupe) {
      const limite = new Date(`${i.as_of}T00:00:00Z`).getTime() + 86400000;
      const pool = [...new Set(obs.filter((o) => o.tournoi === i.tournament_id && o.apres.getTime() >= limite).map((o) => o.joueur))];
      const hasard = pool[Math.floor(rnd() * pool.length)];
      for (const o of obs.filter((o) => o.tournoi === i.tournament_id && o.joueur === hasard && o.apres.getTime() >= limite)) s += (o.gagne ? 1 : 0) - o.p;
    }
    if (s <= ecart) moinsBons++;
  }
  const p = moinsBons / tirages;
  console.log(
    `${nom.padEnd(32)} : ${joueursDuGroupe.length} joueur(s), ${n} matchs — ${victoires} victoires pour ${attendu.toFixed(2)} attendues par le marché ` +
      `(écart ${ecart >= 0 ? '+' : ''}${ecart.toFixed(2)}, ${(ecart / sigma).toFixed(1)} écart-type) — placebo : ${(p * 100).toFixed(0)} % des tirages au hasard font moins bien`,
  );
  if (nom === 'tous les drapeaux') nbTournoisUtiles = new Set(observations.map((o) => o.tournoi)).size;
}

console.log(`\nTournois avec des matchs exploitables : ${tournoisAvecObs.size} sur ${SEUIL_TOURNOIS} visés.`);
const nTous = insights.filter(groupes['tous les drapeaux']).flatMap(apresRecherche).length;
if (nTous < SEUIL_MATCHS || nbTournoisUtiles < SEUIL_TOURNOIS) {
  console.log(
    `VERDICT : échantillon insuffisant (${nTous} matchs de joueurs marqués, il en faut ~${SEUIL_MATCHS} par groupe et ~${SEUIL_TOURNOIS} tournois). ` +
      'On ne conclut pas : les drapeaux ne modifient ni les probabilités ni les picks, ils restent affichés comme information.',
  );
} else {
  console.log(
    'VERDICT : échantillon suffisant. Un effet n\'est crédible que si l\'écart dépasse ~2 écarts-types ET que le placebo le confirme (≥ 95 % ou ≤ 5 %).',
  );
}
