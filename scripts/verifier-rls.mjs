/**
 * Vérifie, avec la CLÉ PUBLIQUE uniquement, que :
 *   - la lecture des 9 tables fonctionne  (policy `for select to anon`)
 *   - toute écriture est refusée          (aucune policy insert/update/delete)
 *   - les deux fonctions SQL ne sont pas appelables en RPC
 *
 * La liste des tables doit suivre les migrations : elle a longtemps couvert les
 * 5 tables d'origine, alors que 0002 (ta_elo, ta_name_exceptions), 0005
 * (tn_fantasy) et 0007 (tn_fantasy_historique) en avaient ajouté quatre autres
 * — le « tout est conforme » ne disait donc rien de la moitié du schéma.
 *
 * À lancer après avoir appliqué les migrations de supabase/migrations/.
 *
 *   node --env-file=.env.local scripts/verifier-rls.mjs
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquantes');
  process.exit(1);
}

const auth = { persistSession: false, autoRefreshToken: false };
const sb = createClient(url, key, { auth });

// Référence : la service role contourne la RLS. Sans elle on ne peut pas
// distinguer « table vide » de « RLS qui filtre tout » — une lecture refusée
// par la RLS renvoie 0 ligne SANS erreur.
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ref = secret ? createClient(url, secret, { auth }) : null;
if (!ref) console.log('\n(SUPABASE_SERVICE_ROLE_KEY absente : lecture vérifiée sans référence)');

const TABLES = [
  // 0001 — tables du jeu
  'tn_players',
  'tn_tournaments',
  'tn_matches',
  'tn_picks',
  'tn_projections',
  // 0002 — Elo Tennis Abstract
  'ta_elo',
  'ta_name_exceptions',
  // 0005 / 0007 — Fantasy
  'tn_fantasy',
  'tn_fantasy_historique',
];

/** Fonctions SQL révoquées pour anon (cf. migration 0001). */
const FONCTIONS = [
  ['tn_recompute_picks', { p_tournament_id: '00000000-0000-0000-0000-000000000000' }],
  ['tn_score_match', { p_sets: [], p_won: true, p_status: 'completed', p_best_of: 3 }],
];

let ko = 0;

const ok = (m) => console.log(`  \x1b[32mOK\x1b[0m   ${m}`);
const bad = (m) => { ko++; console.log(`  \x1b[31mKO\x1b[0m   ${m}`); };

const compte = async (client, t) =>
  client.from(t).select('*', { count: 'exact', head: true });

console.log('\nLECTURE (doit passer)');
for (const t of TABLES) {
  const { count, error } = await compte(sb, t);
  if (error) { bad(`${t} : ${error.message}`); continue; }

  if (!ref) { ok(`${t} : ${count} ligne(s) visibles`); continue; }
  const { count: attendu } = await compte(ref, t);
  if (attendu === 0) ok(`${t} : table vide des deux côtés (non concluant)`);
  else if (count === attendu) ok(`${t} : ${count}/${attendu} lignes visibles`);
  else bad(`${t} : ${count}/${attendu} lignes visibles — la RLS filtre la lecture publique`);
}

console.log('\nÉCRITURE (doit être refusée)');
for (const t of TABLES) {
  // Payload volontairement invalide : si la RLS fait son travail, on n'atteint
  // jamais la contrainte — l'erreur doit être un refus de permission (42501).
  const { error } = await sb.from(t).insert({});
  if (!error) bad(`${t} : INSERT ACCEPTÉ — écriture publique possible !`);
  else if (error.code === '42501' || /permission|policy|row-level/i.test(error.message))
    ok(`${t} : insert refusé (${error.code ?? '—'})`);
  else bad(`${t} : refusé mais pas par la RLS → ${error.code} ${error.message}`);
}

console.log('\nRPC (doivent être refusés)');
for (const [nom, args] of FONCTIONS) {
  const { error } = await sb.rpc(nom, args);
  if (!error) bad(`${nom} : appelable avec la clé publique !`);
  else ok(`${nom} : refusé (${error.code ?? '—'}) ${error.message.slice(0, 50)}`);
}

console.log(ko === 0 ? '\n\x1b[32mTout est conforme.\x1b[0m\n' : `\n\x1b[31m${ko} problème(s).\x1b[0m\n`);
process.exit(ko === 0 ? 0 : 1);
