/**
 * VÉRIFICATION POST-IMPORT — identités dupliquées dans tn_players
 *
 * Signale tout nom déjà présent en base sous un ID différent : la classe de
 * bug rencontrée sur R. Jodar (migration 0011, ID ATP vs Sportradar) puis sur
 * neuf joueuses WTA à l'US Open 2026 (migration 0019, second espace
 * d'identifiants pour les joueuses non classées/qualifiées). Deux correctifs
 * en amont l'empêchent déjà : `lib/parser.ts` `reconcilierIdsJoueurs`
 * (rapprochement par nom avant écriture) et le garde-fou bloquant juste après
 * l'upsert dans `app/import/actions.ts` (même détection qu'ici, mais qui
 * REFUSE l'import au lieu de se contenter de le signaler). Ce script reste le
 * filet de sécurité INDÉPENDANT du code d'import — à lancer quand on veut
 * s'assurer qu'aucun doublon ne s'est glissé par un autre chemin (import
 * direct en base, script ponctuel, etc.), sans dépendre du bon fonctionnement
 * du code applicatif qui les évite.
 *
 * Détection partagée avec l'import — `lib/matching.ts` `detecterDoublons` —
 * pour ne jamais avoir deux définitions du même défaut qui divergent.
 *
 * LECTURE SEULE — clé anon uniquement (policies RLS `select` publiques),
 * jamais la clé service role : ce script ne peut rien écrire.
 *
 *   node --env-file=.env.local scripts/verifier-doublons-joueurs.mts
 *
 * Sort en erreur (exit 1) si un doublon est trouvé, pour un usage en CI/hook.
 */
import { createClient } from '@supabase/supabase-js';
import { detecterDoublons } from '../lib/matching.ts';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquantes');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

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

const doublons = detecterDoublons(joueurs);
for (const d of doublons) {
  console.error(
    `SUSPECT : ${d.cle} — ${d.lignes.length} lignes : ${d.lignes.map((l) => `${l.id} (${l.name})`).join(' / ')}`,
  );
}

const suspects = doublons.length;
console.log(`\n${suspects} groupe(s) suspect(s).`);
if (suspects > 0) {
  console.error(
    '\nUn nom identique sous plusieurs IDs, sur le même circuit, signale soit une identité ' +
      'scindée par l’import (cf. migrations 0011/0019 — corriger par une fusion similaire), soit ' +
      'une vraie homonymie à documenter dans HOMONYMES_CONNUS (lib/matching.ts) une fois vérifiée.',
  );
  process.exit(1);
}
console.log('Aucun doublon suspect.');
