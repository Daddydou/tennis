/**
 * Applique un fichier SQL au projet Supabase via l'API Management.
 *
 * Le mot de passe Postgres n'est pas disponible sur cette machine : ni
 * `supabase db push` ni `psql` ne sont utilisables. L'API Management, elle,
 * accepte le token personnel du CLI (`sbp_…`) et exécute du DDL arbitraire.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_… node scripts/appliquer-migration.mjs <fichier.sql>
 *
 * Le corps JSON est construit ici et non en PowerShell : `ConvertTo-Json` de
 * PowerShell 5.1 sérialise mal une chaîne issue de `Get-Content -Raw`.
 */

import { readFileSync } from 'node:fs';

const PROJET = process.env.SUPABASE_PROJECT_REF ?? 'ubnkuwyqclrjckogldlc';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const fichier = process.argv[2];

if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN manquant.');
  process.exit(1);
}
if (!fichier) {
  console.error('Usage : node scripts/appliquer-migration.mjs <fichier.sql>');
  process.exit(1);
}

const sql = readFileSync(fichier, 'utf8');

const reponse = await fetch(
  `https://api.supabase.com/v1/projects/${PROJET}/database/query`,
  {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  },
);

const texte = await reponse.text();
if (!reponse.ok) {
  console.error(`HTTP ${reponse.status} — ${texte}`);
  process.exit(1);
}
console.log(`OK (${fichier})`);
console.log(texte);
