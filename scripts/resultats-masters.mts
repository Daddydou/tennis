/**
 * RÉSULTATS D'UN MASTERS depuis l'API tennis (1 requête sur les 50 par jour).
 *
 * Lit le tableau des singles du tournoi dans l'API, le rattache à nos matchs par la paire de joueuses
 * (journées 2 et 3 créées dès la journée 1 jouée, demies et finale placées) et met la base à jour : résultats,
 * statuts, sets, horaires, points des picks. APERÇU PAR DÉFAUT : sans `--ecrire`, rien n'est écrit.
 *
 *   npm run resultats:masters -- --tournoi=<id interne> --nom="WTA Finals - Indian Wells" --annee=2026            (aperçu)
 *   npm run resultats:masters -- --tournoi=<id interne> --nom="WTA Finals - Indian Wells" --annee=2026 --ecrire   (écrit)
 *
 * `--circuit=wta|atp` (défaut wta). Idempotent : relancer sans nouveau résultat n'écrit rien.
 */
import { createClient } from '@supabase/supabase-js';
import { appliquerResultatsMasters } from '../db/mastersResultats.ts';
import { HOTE_API, type TableauApi } from '../lib/extract/matchstat.ts';

const arg = (nom: string) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);
const ecrire = process.argv.includes('--ecrire');
const tournoi = arg('tournoi');
const nom = arg('nom');
const annee = Number(arg('annee') ?? new Date().getFullYear());
const circuit = (arg('circuit') ?? 'wta') as 'wta' | 'atp';
if (!tournoi || !nom) {
  console.error('Usage : npm run resultats:masters -- --tournoi=<id interne> --nom="WTA Finals - Indian Wells" [--annee=2026] [--circuit=wta] [--ecrire]');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY;
const cleApi = process.env.RAPIDAPI_KEY;
if (!url || !cleService || !cleApi) {
  console.error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et RAPIDAPI_KEY sont nécessaires (--env-file=.env.local).');
  process.exit(1);
}

const res = await fetch(`https://${HOTE_API}/tennis/v2/tournament/${circuit}/${encodeURIComponent(nom)}/${annee}/draws?fullBracket=true`, {
  headers: { 'X-RapidAPI-Key': cleApi, 'X-RapidAPI-Host': HOTE_API },
});
console.log(`API tennis : HTTP ${res.status}, quota restant ${res.headers.get('x-ratelimit-requests-remaining') ?? '?'}.`);
if (!res.ok) process.exit(1);
const tableau = (await res.json()) as TableauApi;

const sb = createClient(url, cleService, { auth: { persistSession: false, autoRefreshToken: false } });
const r = await appliquerResultatsMasters(sb, tournoi, tableau, ecrire);
if (r.erreurs.length) {
  console.error('Impossible :');
  for (const e of r.erreurs) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${ecrire ? 'Écrit' : 'APERÇU (rien écrit)'} : ${r.maj} match(s) mis à jour, ${r.creees} créé(s), ${r.placees} placé(s) ; statut du tournoi : ${r.tournoiStatut}.`,
);
for (const a of r.avertissements) console.log(`ATTENTION : ${a}`);
