/**
 * CALCUL DES ELO DEPUIS LES TOURNOIS IMPORTES
 * ============================================
 *
 * Lit tous les JSON du dossier ./tournois/ dans l'ordre alphabetique
 * (d'ou l'importance de les prefixer 01-, 02-, ...) et calcule les Elo
 * par surface, match par match.
 *
 * Usage :
 *   npx tsx compute-elo.ts
 *
 * Sortie :
 *   elos.json           les Elo calcules
 *   elos-supabase.sql   requetes UPDATE pretes a coller
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseExtract, devinerSurface, extraireJoueurs } from '../lib/parser';
import { calculerElos, eloDepuisRang, ELO_DEFAUT } from '../lib/elo';
import type { Match, Surface } from '../lib/types';

const DOSSIER = join(__dirname, 'tournois');

if (!existsSync(DOSSIER)) {
  console.error(`Dossier ${DOSSIER} introuvable.`);
  console.error('Cree-le et places-y tes extractions JSON, prefixees par leur ordre :');
  console.error('  01-marrakech.json, 02-houston.json, 03-munich.json, ...');
  process.exit(1);
}

const fichiers = readdirSync(DOSSIER)
  .filter((f) => f.endsWith('.json'))
  .sort(); // ordre alphabetique = ordre chronologique si bien prefixes

if (!fichiers.length) {
  console.error(`Aucun .json dans ${DOSSIER}`);
  process.exit(1);
}

console.log('='.repeat(74));
console.log('CALCUL DES ELO');
console.log('='.repeat(74));
console.log(`\n${fichiers.length} tournois, traites dans cet ordre :\n`);

const tournois: { matches: Match[]; surface: Surface }[] = [];
const nomsJoueurs: Record<string, string> = {};
const seedsMax: Record<string, number> = {};

for (const f of fichiers) {
  const raw = JSON.parse(readFileSync(join(DOSSIER, f), 'utf-8'));
  const extract = parseExtract(raw);
  const surface = devinerSurface(extract.tournament.slug);

  // Compter les matchs exploitables (hors byes / non joues)
  const utiles = extract.matches.filter(
    (m) => m.status === 'completed' || m.status === 'retired'
  ).length;

  console.log(
    `  ${f.padEnd(26)} ${String(extract.matchCount).padStart(3)} matchs ` +
      `(${String(utiles).padStart(3)} exploitables)  ${surface}`
  );

  if (utiles === 0) {
    console.log(`     ignore : aucun match termine`);
    continue;
  }

  tournois.push({ matches: extract.matches, surface });

  // Memoriser noms et meilleure tete de serie vue
  const players = extraireJoueurs(extract);
  for (const [id, p] of Object.entries(players)) {
    nomsJoueurs[id] = p.name;
    if (p.seed !== null) {
      seedsMax[id] = seedsMax[id] === undefined ? p.seed : Math.min(seedsMax[id], p.seed);
    }
  }
}

// Elo initiaux derives de la meilleure tete de serie observee.
// Approximation grossiere mais preferable a 1500 partout : une TdS 1
// dans un M1000 vaut nettement plus qu'un joueur jamais tete de serie.
const initiaux: Record<string, number> = {};
for (const id of Object.keys(nomsJoueurs)) {
  const seed = seedsMax[id];
  initiaux[id] = seed !== undefined ? eloDepuisRang(seed * 2) : ELO_DEFAUT;
}

console.log(`\nCalcul sur ${tournois.length} tournois...`);
const records = calculerElos(tournois, initiaux);

// ---------------------------------------------------------------- resultats

const lignes = Object.values(records)
  .map((r) => ({
    id: r.playerId,
    nom: nomsJoueurs[r.playerId] ?? r.playerId,
    overall: Math.round(r.overall),
    clay: Math.round(r.bySurface.clay),
    hard: Math.round(r.bySurface.hard),
    matchs: r.matchesPlayed,
    matchsClay: r.matchesBySurface.clay,
  }))
  .sort((a, b) => b.clay - a.clay);

console.log('\n' + '='.repeat(74));
console.log('CLASSEMENT ELO TERRE BATTUE');
console.log('='.repeat(74));
console.log(
  `\n${'#'.padStart(3)}  ${'Joueur'.padEnd(26)}${'Elo terre'.padStart(10)}` +
    `${'Elo gen.'.padStart(10)}${'Matchs'.padStart(8)}`
);
console.log('-'.repeat(60));

lignes.slice(0, 30).forEach((l, i) => {
  console.log(
    `${String(i + 1).padStart(3)}  ${l.nom.padEnd(26)}` +
      `${String(l.clay).padStart(10)}${String(l.overall).padStart(10)}` +
      `${String(l.matchsClay).padStart(8)}`
  );
});

const peuDeMatchs = lignes.filter((l) => l.matchs < 2).length;
console.log(
  `\n${lignes.length} joueurs au total. ` +
    `${peuDeMatchs} avec moins de 2 matchs (Elo peu fiable).`
);

// ---------------------------------------------------------------- fichiers

const sortie: Record<string, { overall: number; clay: number; hard: number; grass: number; matchs: number }> = {};
for (const l of lignes) {
  sortie[l.id] = {
    overall: l.overall,
    clay: l.clay,
    hard: l.hard,
    grass: l.overall,
    matchs: l.matchs,
  };
}
writeFileSync(join(__dirname, 'elos.json'), JSON.stringify(sortie, null, 2), 'utf-8');
console.log(`\nelos.json ecrit (${Object.keys(sortie).length} joueurs)`);

// SQL pour Supabase
const sql = [
  '-- Elo calcules depuis les tournois importes',
  '-- Genere par compute-elo.ts',
  '',
  ...lignes.map(
    (l) =>
      `update tn_players set elo_overall = ${l.overall}, ` +
      `elo_clay = ${l.clay}, elo_hard = ${l.hard}, ` +
      `elo_updated_at = current_date where id = '${l.id}';`
  ),
].join('\n');
writeFileSync(join(__dirname, 'elos-supabase.sql'), sql, 'utf-8');
console.log('elos-supabase.sql ecrit (a coller dans le SQL Editor)');

console.log('\n' + '='.repeat(74));
console.log('SUITE');
console.log('='.repeat(74));
console.log(`
  1. Verifier le classement ci-dessus : il doit correspondre
     grossierement a la hierarchie reelle sur terre.

  2. Coller elos-supabase.sql dans Supabase SQL Editor.

  3. Relancer le backtest avec ces Elo :
       npx tsx backtest-elo.ts

  Plus tu importes de tournois, plus les Elo se stabilisent.
  Monte-Carlo et Barcelone sont les plus utiles pour Madrid.
`);
