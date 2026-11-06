/**
 * IMPORT D'UN TOURNOI MASTERS (ATP Finals, WTA Finals) depuis Game Tracker.
 *
 * Lit les poules et le calendrier dans l'API de picks de Game Tracker (lecture), construit le tournoi (tours
 * J1, J2, J3, SF, F ; jusqu'à 12 matchs de poule + 2 demies + 1 finale) et l'écrit dans la base.
 * La journée 1 est connue d'avance ; les journées 2 et 3 dépendent de ses résultats : Game Tracker ne donne leurs
 * duels qu'ensuite, il faut alors RELANCER l'import (sans doublon). Demies et finale : sans joueur avant la fin des poules.
 *
 * APERÇU PAR DÉFAUT : sans `--ecrire`, rien n'est écrit. Idempotent : relancer ne duplique rien et ne touche
 * jamais un résultat déjà enregistré (voir db/importMasters.ts).
 *
 *   npm run import:masters -- --tournoi=<id Game Tracker> --debut=2026-11-08            (aperçu)
 *   npm run import:masters -- --tournoi=<id Game Tracker> --debut=2026-11-08 --ecrire   (écrit)
 *
 * `--debut` (date du premier match) n'est nécessaire qu'à la création du tournoi.
 */
import { createClient } from '@supabase/supabase-js';
import { ecrireMasters } from '../db/importMasters.ts';
import { construirePlanMasters, type PicksGT } from '../lib/mastersImport.ts';

const arg = (nom: string) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.split('=')[1];
const ecrire = process.argv.includes('--ecrire');
const gtId = arg('tournoi');
const debut = arg('debut') ?? null;
if (!gtId) {
  console.error('Usage : npm run import:masters -- --tournoi=<id Game Tracker> --debut=AAAA-MM-JJ [--ecrire]');
  process.exit(1);
}
if (debut !== null && !/^\d{4}-\d{2}-\d{2}$/.test(debut)) {
  console.error('--debut doit être une date AAAA-MM-JJ.');
  process.exit(1);
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
const picks = (await res.json()) as PicksGT;

const sb = createClient(url, cleService, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: joueurs, error } = await sb.from('tn_players').select('id, name').eq('tour', picks.tournoi.tour);
if (error) {
  console.error(`tn_players : ${error.message}`);
  process.exit(1);
}

const plan = construirePlanMasters(picks, joueurs ?? []);
if (!plan.ok) {
  console.error('Import impossible :');
  for (const e of plan.erreurs) console.error(`  - ${e}`);
  process.exit(1);
}
const nom = (id: string | null) => (id ? (joueurs?.find((j) => j.id === id)?.name ?? id) : '—');
console.log(`${plan.plan.tournoi.name} (${plan.plan.tournoi.tour}, surface ${plan.plan.tournoi.surface ?? '?'}) — ${plan.plan.matchs.length} matchs`);
console.log(`  Poule A : ${plan.plan.poules.A.map(nom).join(', ')}`);
console.log(`  Poule B : ${plan.plan.poules.B.map(nom).join(', ')}`);
if (plan.plan.joursManquants.length) {
  console.log(`  Duels pas encore connus (dépendent de la journée 1) : ${plan.plan.joursManquants.join(', ')} — relancer l'import après la journée 1.`);
}
for (const m of plan.plan.matchs.filter((x) => x.round.startsWith('J'))) {
  console.log(`  ${m.round} ${m.half === 'top' ? 'A' : 'B'} : ${nom(m.player1Id)} – ${nom(m.player2Id)}`);
}

const resume = await ecrireMasters(sb, plan.plan, debut, ecrire);
console.log(
  `\n${ecrire ? 'Écrit' : 'APERÇU (rien écrit)'} : tournoi ${resume.tournoiCree ? 'à créer' : 'déjà présent'}${resume.tournamentId ? ` (${resume.tournamentId})` : ''}, ` +
    `${resume.matchsCrees} match(s) à créer, ${resume.matchsMisAJour} à mettre à jour, ${resume.matchsInchanges} inchangé(s).`,
);
if (resume.tournoiCree && !debut) console.log('Attention : --debut=AAAA-MM-JJ est nécessaire pour créer le tournoi.');
