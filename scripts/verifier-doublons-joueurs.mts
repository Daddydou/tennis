/**
 * VÉRIFICATION POST-IMPORT — identités dupliquées dans tn_players
 *
 * Signale tout nom déjà présent en base sous un ID différent : la classe de
 * bug rencontrée sur R. Jodar (migration 0011, ID ATP vs Sportradar) puis sur
 * neuf joueuses WTA à l'US Open 2026 (migration 0019, second espace
 * d'identifiants pour les joueuses non classées/qualifiées). Le correctif
 * en amont (`lib/parser.ts` `reconcilierIdsJoueurs`, appelé par
 * `app/import/actions.ts`) empêche déjà la récurrence à l'IMPORT — ce script
 * est le filet de sécurité indépendant : à lancer quand on veut s'assurer
 * qu'aucun doublon ne s'est glissé (juste après un import, ou périodiquement),
 * sans dépendre du bon fonctionnement du code qui les évite.
 *
 * LECTURE SEULE — clé anon uniquement (policies RLS `select` publiques),
 * jamais la clé service role : ce script ne peut rien écrire.
 *
 *   node --env-file=.env.local scripts/verifier-doublons-joueurs.mts
 *
 * Sort en erreur (exit 1) si un doublon est trouvé, pour un usage en CI/hook
 * ; la liste des homonymes déjà documentés (VRAIS joueurs distincts, jamais à
 * fusionner) est explicitement exclue plutôt que de polluer la sortie à
 * chaque lancement.
 */
import { createClient } from '@supabase/supabase-js';
import { normaliserNom } from '../lib/matching.ts';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquantes');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/**
 * Homonymies réelles déjà vérifiées (cf. migration 0011) : deux personnes
 * distinctes qui partagent la même clé de rapprochement. Une paire d'IDs
 * listée ici n'est jamais un doublon d'identité, quel que soit le nombre de
 * fois où ce script tourne.
 */
const HOMONYMES_CONNUS: readonly (readonly [string, string])[] = [
  ['326160', '326376'], // X. Wang (WTA) — deux joueuses distinctes
];
const paireConnue = (a: string, b: string) =>
  HOMONYMES_CONNUS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

interface PlayerRow {
  id: string;
  tour: string;
  name: string;
}

async function lireTout<T>(table: string, colonnes: string): Promise<T[]> {
  const taille = 1000;
  const out: T[] = [];
  for (let debut = 0; ; debut += taille) {
    const { data, error } = await sb.from(table).select(colonnes).range(debut, debut + taille - 1);
    if (error) throw new Error(`${table} : ${error.message}`);
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < taille) return out;
  }
}

const joueurs = await lireTout<PlayerRow>('tn_players', 'id, tour, name');
console.log(`tn_players : ${joueurs.length} lignes lues.`);

const parCle = new Map<string, PlayerRow[]>();
for (const j of joueurs) {
  const cle = `${j.tour}|${normaliserNom(j.name)}`;
  const l = parCle.get(cle) ?? [];
  l.push(j);
  parCle.set(cle, l);
}

let suspects = 0;
let connus = 0;
for (const [cle, lignes] of parCle) {
  if (lignes.length < 2) continue;
  const ids = lignes.map((l) => l.id);
  if (ids.length === 2 && paireConnue(ids[0], ids[1])) {
    connus++;
    continue;
  }
  suspects++;
  console.error(
    `SUSPECT : ${cle} — ${lignes.length} lignes : ${lignes.map((l) => `${l.id} (${l.name})`).join(' / ')}`,
  );
}

console.log(`\n${connus} homonymie(s) connue(s) et ignorée(s), ${suspects} groupe(s) suspect(s).`);
if (suspects > 0) {
  console.error(
    '\nUn nom identique sous plusieurs IDs, sur le même circuit, signale soit une identité ' +
      'scindée par l’import (cf. migrations 0011/0019 — corriger par une fusion similaire), soit ' +
      'une vraie homonymie à documenter dans HOMONYMES_CONNUS ci-dessus une fois vérifiée.',
  );
  process.exit(1);
}
console.log('Aucun doublon suspect.');
