import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Client Supabase serveur avec la SERVICE ROLE KEY.
 *
 * Réservé aux ÉCRITURES (import, picks, cache de projections) et aux appels RPC
 * de recalcul. Les lectures passent par `supabaseAnon()` : les tables `tn_*`
 * ont une policy RLS `for select to anon`, ce qui garantit qu'un accès public
 * ne peut rien modifier.
 *
 * La service role contourne RLS : elle ne doit vivre que côté serveur (Server
 * Actions, Route Handlers). `import 'server-only'` fait échouer le build si ce
 * module est atteint depuis un Client Component.
 */
export function supabaseAdmin() {
  // Un secret préfixé NEXT_PUBLIC_ serait inliné dans le bundle navigateur.
  if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY est défini : une clé service-role ' +
        'préfixée NEXT_PUBLIC_ est exposée au navigateur. Renommer en ' +
        'SUPABASE_SERVICE_ROLE_KEY et révoquer la clé.',
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Variables Supabase manquantes : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
