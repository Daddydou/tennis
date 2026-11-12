/**
 * IMPORT DE LA COUPE DAVIS (phase finale à 8 nations) depuis Game Tracker.
 *
 * Lit les huit nations et les quarts de finale dans l'API de picks de Game Tracker (lecture seule), construit un
 * vrai tournoi (tours QF, SF, F ; nations = « joueurs ») et l'écrit dans la base. Le tournoi est lié à celui de
 * Thomas par `external_id = gt:<id Game Tracker>` : le bouton « Lire Game Tracker » du tournoi fait ensuite le reste.
 *
 * APERÇU PAR DÉFAUT : sans `--ecrire`, rien n'est écrit. Idempotent : relancer ne duplique rien et ne touche
 * jamais un résultat déjà enregistré (voir db/importDavis.ts).
 *
 *   npm run import:davis -- --tournoi=<id Game Tracker>            (aperçu)
 *   npm run import:davis -- --tournoi=<id Game Tracker> --ecrire   (écrit)
 *
 * Dates : par défaut, le jour du verrouillage des quarts (Game Tracker) et cinq jours plus tard ;
 * `--debut=AAAA-MM-JJ` et `--fin=AAAA-MM-JJ` pour les imposer.
 */
import { createClient } from '@supabase/supabase-js';
import { ecrireDavis } from '../db/importDavis.ts';
import { construirePlanDavis, type PicksDavisGT } from '../lib/davisImport.ts';

const arg = (nom: string) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.split('=')[1];
const ecrire = process.argv.includes('--ecrire');
const gtId = arg('tournoi');
const debut = arg('debut') ?? null;
const fin = arg('fin') ?? null;
if (!gtId) {
  console.error('Usage : npm run import:davis -- --tournoi=<id Game Tracker> [--debut=AAAA-MM-JJ] [--fin=AAAA-MM-JJ] [--ecrire]');
  process.exit(1);
}
for (const [nom, v] of [['debut', debut], ['fin', fin]] as const) {
  if (v !== null && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    console.error(`--${nom} doit être une date AAAA-MM-JJ.`);
    process.exit(1);
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY;
const cleGT = process.env.GAMETRACKER_PICKS_KEY;
if (!url || !cleService || !cleGT) {
  console.error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et GAMETRACKER_PICKS_KEY sont nécessaires (--env-file=.env.local).');
  process.exit(1);
}

const res = await fetch(`https://bowling-tracker-phi.vercel.app/api/v1/tennis/picks?tournoi=${encodeURIComponent(gtId)}`, {
  headers: { Authorization: `Bearer ${cleGT}`, Accept: 'application/json' },
});
if (!res.ok) {
  console.error(`Game Tracker : HTTP ${res.status}.`);
  process.exit(1);
}
const picks = (await res.json()) as PicksDavisGT;

const resultat = construirePlanDavis(picks, { debut, fin });
if (!resultat.ok) {
  console.error('Import impossible :');
  for (const e of resultat.erreurs) console.error(`  - ${e}`);
  process.exit(1);
}
const { plan } = resultat;
const nom = (id: string | null) => (id ? (plan.nations.find((n) => n.id === id)?.name ?? id) : '—');
console.log(`${plan.tournoi.name} (${plan.tournoi.tour}, surface ${plan.tournoi.surface}) — ${plan.matchs.length} matchs, du ${plan.tournoi.debut ?? '?'} au ${plan.tournoi.fin ?? '?'}`);
for (const m of plan.matchs.filter((x) => x.round === 'QF')) console.log(`  QF ${m.position + 1} : ${nom(m.player1Id)} – ${nom(m.player2Id)}`);

const sb = createClient(url, cleService, { auth: { persistSession: false, autoRefreshToken: false } });
const t = picks.tournoi;
const resume = await ecrireDavis(sb, plan, ecrire, {
  id: t.id,
  nom: t.nom,
  tour: t.tour,
  annee: t.annee,
  drawSize: t.drawSize,
  statut: t.statut ?? 'UPCOMING',
  tourOuvert: picks.tourOuvert ? { numero: picks.tourOuvert.numero, nom: picks.tourOuvert.nom, lockAt: picks.tourOuvert.lockAt ?? null } : null,
});
console.log(
  `\n${ecrire ? 'Écrit' : 'APERÇU (rien écrit)'} : tournoi ${resume.tournoiCree ? 'à créer' : 'déjà présent'}${resume.tournamentId ? ` (${resume.tournamentId})` : ''}, ` +
    `${resume.nationsCreees} nation(s) à créer, ${resume.matchsCrees} match(s) à créer, ${resume.matchsMisAJour} à mettre à jour, ${resume.matchsInchanges} inchangé(s).`,
);
if (resume.lien === 'pose') console.log('Lien posé avec le tournoi de Thomas (Game Tracker) : « Lire Game Tracker » peut synchroniser.');
else if (resume.lien === 'dejaPose') console.log('Lien avec le tournoi de Thomas déjà posé.');
else if (resume.lien) console.error(`Lien avec Game Tracker NON posé : ${resume.lien}`);
