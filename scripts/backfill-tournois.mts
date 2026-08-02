/**
 * Recalcule surface / catégorie / date de début des tournois déjà en base,
 * depuis le référentiel `lib/calendrier.ts`.
 *
 * Nécessaire car l'ancien import déduisait la surface via
 * `devinerSurface(slug, mois)` en lui passant le mois de l'EXTRACTION : tout
 * ce qui a été importé en juin ou juillet a été classé sur gazon.
 *
 *   node --env-file=.env.local scripts/backfill-tournois.mts            # aperçu
 *   node --env-file=.env.local scripts/backfill-tournois.mts --appliquer
 */
import { createClient } from '@supabase/supabase-js';
import { metaTournoi } from '../lib/calendrier.ts';

const appliquer = process.argv.includes('--appliquer');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes');
  process.exit(1);
}

// Écriture : service role obligatoire (la clé publique est en lecture seule).
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await sb
  .from('tn_tournaments')
  .select('id, slug, name, tour, year, draw_size, surface, category, start_date');
if (error) {
  console.error(error.message);
  process.exit(1);
}

let modifies = 0;
const inconnus: string[] = [];
for (const t of data ?? []) {
  const meta = metaTournoi(t.slug, t.tour, t.year, t.draw_size);

  // Un slug absent du référentiel donne surface, catégorie et date par défaut :
  // le corriger ici serait figer un défaut. On le liste pour qu'il rejoigne
  // `lib/calendrier.ts`.
  if (!meta.reconnu) {
    inconnus.push(`${t.tour} ${t.year} · ${t.slug ?? '(sans slug)'} · ${t.name}`);
    continue;
  }

  const patch: Record<string, unknown> = {};
  if (t.surface !== meta.surface) patch.surface = meta.surface;
  if (t.category !== meta.categorie) patch.category = meta.categorie;
  // On ne remplace jamais une date déjà présente : elle peut venir de l'export.
  if (!t.start_date && meta.startDate) patch.start_date = meta.startDate;
  // Nom d'affichage du référentiel : « Canadian Open » → « Open du Canada ».
  const nomAttendu = meta.nom ? `${meta.nom} ${t.year}` : null;
  if (nomAttendu && t.name !== nomAttendu) patch.name = nomAttendu;

  if (Object.keys(patch).length === 0) continue;
  modifies++;

  const detail = Object.entries(patch)
    .map(([k, v]) => `${k}: ${JSON.stringify((t as Record<string, unknown>)[k])} → ${JSON.stringify(v)}`)
    .join(', ');
  console.log(`${t.name.padEnd(24)} ${detail}`);

  if (appliquer) {
    const { error: e } = await sb.from('tn_tournaments').update(patch).eq('id', t.id);
    if (e) console.error(`  échec : ${e.message}`);
  }
}

if (inconnus.length) {
  console.log(`\n${inconnus.length} slug(s) inconnu(s) du calendrier, laissés tels quels :`);
  for (const i of inconnus) console.log(`  ${i}`);
}

console.log(
  `\n${modifies} tournoi(s) à corriger sur ${data?.length ?? 0}.` +
    (appliquer ? ' Appliqué.' : ' Aperçu — relancer avec --appliquer.'),
);
