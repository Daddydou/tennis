import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Client Supabase public (clé anon / publishable).
 *
 * Utilisable partout — Server Components, Route Handlers ET navigateur : il ne
 * porte aucun secret. Les tables `tn_*` exposent une policy RLS
 * `for select to anon using (true)` ; ce client ne peut donc que LIRE. Toute
 * écriture passe par `supabaseAdmin()` (server-only), jamais par ici.
 *
 * Volontairement pas de `import 'server-only'`.
 */
let client: SupabaseClient | null = null;

export function supabaseAnon(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Variables Supabase manquantes : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY',
    );
  }

  // App mono-utilisateur sans authentification : aucune session à persister ni
  // à rafraîchir (sur le serveur, une session partagée entre requêtes serait
  // de toute façon une erreur).
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
