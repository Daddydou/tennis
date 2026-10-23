/**
 * ELO MAISON - verification de bout en bout de la RESOLUTION, telle que l'app la fait
 * (db/elo.ts avec SOURCE_ELO=maison), sur tous les joueurs de tn_players. Lecture seule.
 *
 * Affiche la repartition des sources, les joueurs encore ambigus / par defaut, et quelques
 * joueurs de reference. A lancer apres un re-amorçage ou un changement de db/elo.ts.
 *
 *   node --env-file=.env.local --experimental-loader ./scripts/test-loader.mjs recherche/elo-maison/verifier-resolution.mts
 */
process.env.SOURCE_ELO = 'maison';
const { createClient } = await import('@supabase/supabase-js');
const { chargerIndexElo, resoudreElos, eloEffectifResolu } = await import('../../db/elo.ts');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

for (const tour of ['ATP', 'WTA'] as const) {
  const index = await chargerIndexElo(tour);
  const { data } = await sb.from('tn_players').select('id, name, country').eq('tour', tour).range(0, 999);
  const joueurs = (data ?? []).filter((j: { name: string }) => !/QUALIFIER|^Q\. |LUCKY|BYE/i.test(j.name));
  const parSource: Record<string, number> = {};
  const aVoir: string[] = [];
  for (const j of joueurs) {
    const e = resoudreElos(j, index);
    parSource[e.source] = (parSource[e.source] ?? 0) + 1;
    if (e.source !== 'ta') aVoir.push(`${e.source.padEnd(7)} ${j.name} (${j.country ?? '?'}) -> ${Math.round(e.eloOverall)}${e.candidats.length ? ` [${e.candidats.map((c) => c.slug).join(', ')}]` : ''}`);
  }
  console.log(`\n=== ${tour} : base ${index.base}, defaut ${index.eloDefaut}, ${joueurs.length} joueurs ===`);
  console.log(JSON.stringify(parSource));
  for (const l of aVoir) console.log('  ' + l);
  const repere = tour === 'ATP' ? ['J. Sinner', 'A. Popyrin', 'B. Nakashima', 'A. Martin'] : ['C. Gauff', 'M. Uchijima', 'L. Fernandez', 'A. Li'];
  for (const nom of repere) {
    const j = joueurs.find((x: { name: string }) => x.name === nom) ?? { id: nom, name: nom, country: null };
    const e = resoudreElos(j, index);
    console.log(`  repere ${nom.padEnd(14)} ${e.source.padEnd(7)} general ${Math.round(e.eloOverall)} dur ${Math.round(eloEffectifResolu(e, 'hard'))} via ${e.via} (${e.taName ?? '-'})`);
  }
}
