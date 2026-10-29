/**
 * ELO INTROUVABLE — quels joueurs des tournois récents n'ont pas d'Elo propre ?
 *
 * Rejoue, avec le VRAI code de l'app (`chargerIndexElo` + `resoudreElos`, la
 * source d'Elo configurée par SOURCE_ELO), la résolution de l'Elo de chaque
 * joueur des tournois commencés ces derniers jours, et liste ceux qui
 * retombent sur un repli :
 *
 *   - `defaut` : inconnu de la table d'Elo → valeur par défaut du circuit
 *                (ATP 2000 / WTA 2100 avec l'Elo maison) ;
 *   - `ambigu` : plusieurs homonymes que ni le pays ni le nombre de matchs
 *                ne départagent ;
 *   - `maison` : Elo repris des colonnes de tn_players (estimation bruitée).
 *
 * Pour chaque joueur concerné, il propose les lignes de la table d'Elo qui
 * portent le même nom de famille : c'est presque toujours un problème
 * d'identité (accent, particule, trait d'union, prénom différent), à corriger
 * dans `ta_name_exceptions` (Elo Tennis Abstract) ou `tn_player_source_ids`.
 *
 * LECTURE SEULE — clé anon uniquement. Ne modifie rien.
 *
 *   npm run verify:elo-inconnus                    (45 derniers jours, SOURCE_ELO=maison)
 *   npm run verify:elo-inconnus -- --jours=120
 *   npm run verify:elo-inconnus -- --source=ta
 *
 * Code de sortie : toujours 0 (c'est un diagnostic) ; `--strict` renvoie 1
 * s'il reste au moins un joueur en `defaut` ou `ambigu`.
 */
import { createClient } from '@supabase/supabase-js';
import { chargerIndexElo, resoudreElos, type JoueurAResoudre } from '../db/elo.ts';
import { normaliserNom } from '../lib/matching.ts';
import type { Tour } from '../lib/types.ts';

const arg = (nom: string) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.split('=')[1];
const jours = Number(arg('jours') ?? 45);
const strict = process.argv.includes('--strict');
process.env.SOURCE_ELO = arg('source') ?? process.env.SOURCE_ELO ?? 'maison';

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
  return data as T;
}

const depuis = new Date(Date.now() - jours * 86400000).toISOString().slice(0, 10);
const tournois = await lire<{ id: string; name: string; tour: Tour }[]>(
  sb.from('tn_tournaments').select('id, name, tour').gte('start_date', depuis),
  'tn_tournaments',
);
console.log(`Source d'Elo : ${process.env.SOURCE_ELO} — ${tournois.length} tournoi(s) commencé(s) depuis le ${depuis}.`);
if (tournois.length === 0) process.exit(0);

// Joueurs de ces tournois, avec les tournois où ils jouent.
const parJoueur = new Map<string, Set<string>>();
for (const t of tournois) {
  const matchs = await lire<{ player1_id: string | null; player2_id: string | null }[]>(
    sb.from('tn_matches').select('player1_id, player2_id').eq('tournament_id', t.id),
    'tn_matches',
  );
  for (const m of matchs) {
    for (const id of [m.player1_id, m.player2_id]) {
      if (!id) continue;
      if (!parJoueur.has(id)) parJoueur.set(id, new Set());
      parJoueur.get(id)!.add(t.name);
    }
  }
}

const ids = [...parJoueur.keys()];
const joueurs: (JoueurAResoudre & { tour: Tour })[] = [];
for (let i = 0; i < ids.length; i += 150) {
  const lot = await lire<(JoueurAResoudre & { tour: Tour })[]>(
    sb
      .from('tn_players')
      .select('id, tour, name, country, rank, elo_overall, elo_hard, elo_clay, elo_grass')
      .in('id', ids.slice(i, i + 150)),
    'tn_players',
  );
  joueurs.push(...lot);
}

const total = { ta: 0, maison: 0, defaut: 0, ambigu: 0 };
const aRevoir: string[] = [];
let nbProblemes = 0;

for (const tour of ['ATP', 'WTA'] as Tour[]) {
  const index = await chargerIndexElo(tour);
  const doTour = joueurs.filter((j) => j.tour === tour);
  const compte = { ta: 0, maison: 0, defaut: 0, ambigu: 0 };
  // Lignes de la table d'Elo par nom de famille, pour proposer des candidats.
  const parFamille = new Map<string, string[]>();
  for (const l of index.parSlug.values()) {
    // Nom de famille en dernier (« Yunchaokete Bu ») ou en premier (« Bu Yunchaokete », ordre chinois).
    const mots = normaliserNom(l.ta_name).split(' ');
    for (const fam of new Set([mots[mots.length - 1], mots[0]])) {
      if (!parFamille.has(fam)) parFamille.set(fam, []);
      parFamille.get(fam)!.push(`${l.ta_name} (${l.country ?? '?'}${l.n != null ? `, ${l.n} matchs` : ''})`);
    }
  }

  for (const j of doTour) {
    const r = resoudreElos(j, index);
    compte[r.source] += 1;
    total[r.source] += 1;
    if (r.source === 'ta') continue;
    nbProblemes += r.source === 'defaut' || r.source === 'ambigu' ? 1 : 0;
    const fam = normaliserNom(j.name).split(' ').pop() ?? '';
    // Homonymes : les vrais candidats vus par la résolution (slug à utiliser pour un alias).
    // Sinon : les lignes de la table qui portent le même nom de famille.
    const candidats =
      r.candidats.length > 0
        ? r.candidats
            .map((c) => {
              const l = index.parSlug.get(c.slug);
              return `${c.nom} [${c.slug}] (${l?.country ?? '?'}${l?.n != null ? `, ${l.n} matchs` : ''}, Elo ${c.elo != null ? Math.round(c.elo) : '?'})`;
            })
            .join(' | ')
        : ((parFamille.get(fam) ?? []).slice(0, 4).join(' | ') || 'aucun même nom de famille');
    const tournoisDuJoueur = [...(parJoueur.get(j.id) ?? [])].join(', ');
    aRevoir.push(
      `  [${r.source.padEnd(6)}] ${tour} ${j.name} (${j.country ?? '?'}) id ${j.id} — ${tournoisDuJoueur}\n` +
        `           Elo utilisé : ${Math.round(r.eloOverall)} — ${r.candidats.length > 0 ? 'candidats' : "table d'Elo"} : ${candidats}`,
    );
  }
  console.log(
    `${tour} : ${doTour.length} joueurs — trouvés ${compte.ta}, estimation maison ${compte.maison}, défaut ${compte.defaut}, ambigus ${compte.ambigu}`,
  );
}

console.log(
  `\nTotal : ${joueurs.length} joueurs — trouvés ${total.ta}, estimation maison ${total.maison}, défaut ${total.defaut}, ambigus ${total.ambigu}`,
);
if (aRevoir.length > 0) {
  console.log(`\nÀ revoir (${aRevoir.length}) :\n${aRevoir.join('\n')}`);
  console.log(
    '\nSi le joueur figure bien dans la table d\'Elo sous une autre graphie : ajouter l\'exception dans `ta_name_exceptions` ' +
      '(Elo Tennis Abstract) ou son identifiant dans `tn_player_source_ids` (Elo maison). Sinon c\'est un vrai nouveau joueur : ' +
      'le défaut du circuit s\'applique, sans danger pour les autres.',
  );
}
if (strict && nbProblemes > 0) process.exit(1);
