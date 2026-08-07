/**
 * Rejoue le rapprochement des noms sur les cotes DÉJÀ EN CACHE d'un tournoi,
 * et n'écrit que `player_a_id` / `player_b_id`.
 *
 * POURQUOI. L'appariement n'est calculé qu'à la capture (`rafraichirCotes`) ;
 * l'affichage relit les colonnes sans jamais recalculer. Une cote écrite sous
 * le mauvais tournoi garde donc des `player_*_id` à NULL même une fois
 * ré-affectée au bon — et un simple rafraîchissement ne les remplirait pas :
 * le palier gratuit de The Odds API ne sert que les rencontres à venir ou en
 * cours, si bien qu'une cote de match déjà joué serait définitivement perdue.
 * D'où ce rattrapage hors ligne, sans appel à l'API et sans toucher aux
 * valeurs (probabilités, bookmakers, sport_key, event_id).
 *
 * La logique de rapprochement n'est pas réimplémentée : `indexerJoueursTableau`
 * et `apparierNom` (lib/cotes.ts) sont celles qu'utilise la capture.
 *
 *   node --env-file=.env.local scripts/reapparier-cotes.mts <tournament_id>
 *   node --env-file=.env.local scripts/reapparier-cotes.mts <tournament_id> --appliquer
 *
 * Sans `--appliquer`, rien n'est écrit : le script se contente d'afficher ce
 * qu'il ferait.
 */
import { createClient } from '@supabase/supabase-js';
import {
  apparierNom,
  indexerJoueursTableau,
  type EchecAppariement,
} from '../lib/matching.ts';

const args = process.argv.slice(2);
const appliquer = args.includes('--appliquer');
const tournamentId = args.find((a) => !a.startsWith('--'));

if (!tournamentId) {
  console.error(
    'Usage : node --env-file=.env.local scripts/reapparier-cotes.mts <tournament_id> [--appliquer]',
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes');
  process.exit(1);
}

// Écriture : service role obligatoire (la clé publique est en lecture seule).
const sb = createClient(url, key, { auth: { persistSession: false } });

const stop = (message: string): never => {
  console.error(message);
  process.exit(1);
};

/* -------------------------------------------------------------------------- */
/*  Le tournoi et les joueurs de son tableau                                   */
/* -------------------------------------------------------------------------- */

const { data: tournoi, error: eTournoi } = await sb
  .from('tn_tournaments')
  .select('id, name, tour, year')
  .eq('id', tournamentId)
  .maybeSingle();
if (eTournoi) stop(`tn_tournaments : ${eTournoi.message}`);
if (!tournoi) stop(`Tournoi ${tournamentId} introuvable.`);

// Les joueurs du TABLEAU, pas tous ceux de la base : une rencontre renvoyée
// par l'API qui n'y figure pas doit être signalée, pas devinée. Même
// périmètre que `loadEngineData` (supabase/queries.ts).
const { data: matchs, error: eMatchs } = await sb
  .from('tn_matches')
  .select('player1_id, player2_id')
  .eq('tournament_id', tournamentId);
if (eMatchs) stop(`tn_matches : ${eMatchs.message}`);

const ids = new Set<string>();
for (const m of matchs ?? []) {
  if (m.player1_id) ids.add(m.player1_id);
  if (m.player2_id) ids.add(m.player2_id);
}
if (ids.size === 0) {
  stop(
    `Aucun joueur au tableau de « ${tournoi.name} » : le tableau n'est pas ` +
      'importé, il n\'y a rien à quoi rattacher les cotes.',
  );
}

const { data: joueurs, error: eJoueurs } = await sb
  .from('tn_players')
  .select('id, name')
  .in('id', [...ids]);
if (eJoueurs) stop(`tn_players : ${eJoueurs.message}`);

const index = indexerJoueursTableau(joueurs ?? []);

/* -------------------------------------------------------------------------- */
/*  Les cotes à rattraper                                                      */
/* -------------------------------------------------------------------------- */

// Seules les lignes incomplètes : une cote déjà appariée n'est pas retouchée.
const { data: cotes, error: eCotes } = await sb
  .from('tn_odds')
  .select('id, event_id, sport_key, nom_a, nom_b, player_a_id, player_b_id, commence_time')
  .eq('tournament_id', tournamentId)
  .or('player_a_id.is.null,player_b_id.is.null')
  .order('commence_time', { ascending: true });
if (eCotes) stop(`tn_odds : ${eCotes.message}`);

console.log(
  `${tournoi.name} (${tournoi.tour} ${tournoi.year}) — ` +
    `${ids.size} joueurs au tableau, ${cotes?.length ?? 0} cotes incomplètes.`,
);
if (!appliquer) console.log('APERÇU — rien ne sera écrit (ajouter --appliquer).\n');

let completes = 0; // les deux joueurs rattachés à l'issue du passage
let partielles = 0; // un seul des deux
let inchangees = 0; // aucun des NULL n'a pu être comblé
const echecs: EchecAppariement[] = [];

for (const c of cotes ?? []) {
  // On ne recalcule que ce qui manque : un ID déjà en base fait foi.
  const resA = c.player_a_id ? { id: c.player_a_id } : apparierNom(index, c.nom_a);
  const resB = c.player_b_id ? { id: c.player_b_id } : apparierNom(index, c.nom_b);
  if ('echec' in resA && resA.echec) echecs.push(resA.echec);
  if ('echec' in resB && resB.echec) echecs.push(resB.echec);

  // Un échec laisse la colonne à NULL plutôt que de forcer un lien faux :
  // un mauvais rattachement fausserait la mesure sans se voir.
  const maj: { player_a_id?: string; player_b_id?: string } = {};
  if (!c.player_a_id && resA.id) maj.player_a_id = resA.id;
  if (!c.player_b_id && resB.id) maj.player_b_id = resB.id;

  if (resA.id && resB.id) completes += 1;
  else if (resA.id || resB.id) partielles += 1;
  else inchangees += 1;

  if (Object.keys(maj).length === 0) continue;

  console.log(
    `  ${c.nom_a} — ${c.nom_b}` +
      `${maj.player_a_id ? ` | A→${maj.player_a_id}` : ''}` +
      `${maj.player_b_id ? ` | B→${maj.player_b_id}` : ''}`,
  );

  if (appliquer) {
    // Ciblé sur la clé primaire, et limité aux deux colonnes d'appariement :
    // rien d'autre de la ligne n'est réécrit.
    const { error } = await sb.from('tn_odds').update(maj).eq('id', c.id);
    if (error) stop(`tn_odds (${c.event_id}) : ${error.message}`);
  }
}

/* -------------------------------------------------------------------------- */
/*  Bilan                                                                      */
/* -------------------------------------------------------------------------- */

console.log(
  `\n${completes} cotes désormais complètes, ${partielles} à moitié appariées, ` +
    `${inchangees} toujours sans aucun joueur.`,
);

if (echecs.length) {
  // Dédoublonné : un même joueur revient à chaque tour du tournoi.
  const parNom = new Map<string, EchecAppariement>();
  for (const e of echecs) if (!parNom.has(e.nom)) parNom.set(e.nom, e);
  console.log(`\nNoms non rattachés (${parNom.size}) :`);
  for (const e of [...parNom.values()].sort((a, b) => a.nom.localeCompare(b.nom))) {
    const detail = e.candidats?.length ? ` → ${e.candidats.join(' / ')}` : '';
    console.log(`  ${e.raison === 'ambigu' ? 'ambigu ' : 'absent '} ${e.nom}${detail}`);
  }
}

if (!appliquer) console.log('\nAPERÇU — relancer avec --appliquer pour écrire.');
