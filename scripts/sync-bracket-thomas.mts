/**
 * Synchronisation MANUELLE de l'app bracket de Thomas → tables
 * tn_bracket_externe_* (migration 0022). Aucun cron : à lancer à la main.
 *
 *   npm run sync:bracket-thomas -- --liste
 *       Tournois nouveaux/modifiés chez Thomas depuis la dernière synchro,
 *       + réconciliation (/ids) : ids connus chez nous mais disparus chez
 *       Thomas. LECTURE SEULE (clé publique Supabase) ; rien n'est supprimé.
 *
 *   npm run sync:bracket-thomas -- --tournoi=<id> [--apercu]
 *       Synchronise un tournoi : upsert dans les 5 tables, points recalculés,
 *       résumé (tours, joueurAbsent, écarts de points Thomas / recalcul).
 *       --apercu : tout sauf l'écriture.
 *
 *   npm run sync:bracket-thomas -- --fichier=exemple-api-tennis-brackets.json --apercu
 *       Même résumé depuis un fichier local (aucun appel réseau, aucune
 *       écriture) : pour vérifier le mapping sans clé.
 *
 * THOMAS_API_KEY n'est jamais affichée : les erreurs de l'API sont réduites à
 * la route et au code HTTP (externe/thomasClient.ts).
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { lireBracket, type BracketThomas } from '../lib/thomasApi.ts';
import { bracketThomas, idsThomas, listerTournoisThomas } from '../externe/thomasClient.ts';
import {
  BracketIncoherent,
  ecrireBracketExterne,
  preparerSynchro,
  tournoisSynchronises,
  type ResumeSynchro,
} from '../db/bracketExterneEcriture.ts';

const args = process.argv.slice(2);
const option = (nom: string) => args.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);
const apercu = args.includes('--apercu');
const liste = args.includes('--liste');
const tournoiId = option('tournoi');
const fichier = option('fichier');

/** Marge sur `updatedSince` : les horloges des deux serveurs ne sont pas les mêmes. */
const MARGE_MS = 5 * 60 * 1000;

function client(ecriture: boolean) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = ecriture ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error(
      ecriture
        ? 'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes'
        : 'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquantes',
    );
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function afficherResume(r: ResumeSynchro) {
  console.log(`\n${r.nom} (${r.tournoiId})`);
  if (!r.verrouille) {
    console.log(`  Pas encore verrouillé${r.lockAt ? ` (verrouillage prévu ${r.lockAt})` : ''} : rien d'autre ne sort avant le tour 1.`);
    return;
  }
  console.log(`  ${r.tours} tour(s) reçu(s), ${r.matchs} match(s), ${r.pronostics} pronostic(s)`);
  console.log(`  ${r.joueurAbsent} pronostic(s) joueurAbsent (pick antérieur à l'élimination)`);
  console.log('  Points (Thomas → recalcul) :');
  for (const p of r.participants) {
    const ok = p.thomas === p.calcule;
    console.log(`    ${ok ? '✓' : '✗'} ${p.pseudo.padEnd(12)} ${String(p.thomas ?? '—').padStart(4)} → ${String(p.calcule).padStart(4)}`);
  }
  if (r.ecartsPoints.length) {
    console.log(`  ⚠ ${r.ecartsPoints.length} écart(s) de points : erreur de mapping probable, à examiner.`);
  }
  if (r.desaccordsResultat) {
    console.log(`  ⚠ ${r.desaccordsResultat} pronostic(s) dont le « resultat » de Thomas contredit notre jugement.`);
  }
}

async function synchroniser() {
  let bracket: BracketThomas;
  if (fichier) {
    if (!apercu) {
      console.error('--fichier ne s’utilise qu’avec --apercu : on n’écrit en base que ce qui vient de l’API.');
      process.exit(1);
    }
    bracket = lireBracket(JSON.parse(readFileSync(fichier, 'utf8')));
  } else {
    bracket = await bracketThomas(tournoiId!);
  }

  if (apercu) {
    afficherResume(preparerSynchro(bracket).resume);
    console.log('\nAperçu : rien n’a été écrit.');
    return;
  }
  afficherResume(await ecrireBracketExterne(client(true), bracket));
  console.log('\nÉcrit (upsert) dans les 5 tables tn_bracket_externe_*.');
}

async function lister() {
  const sb = client(false);
  const connus = await tournoisSynchronises(sb);
  const derniere = connus[0]?.updated_at ?? null;
  const depuis = derniere ? new Date(new Date(derniere).getTime() - MARGE_MS).toISOString() : null;

  const tournois = await listerTournoisThomas(depuis);
  const ids = new Set(connus.map((c) => c.id));
  console.log(
    depuis
      ? `\nTournois modifiés chez Thomas depuis ${depuis} (dernière synchro − 5 min) :`
      : '\nAucune synchro encore : tous les tournois de Thomas :',
  );
  if (!tournois.length) console.log('  (aucun)');
  for (const t of tournois) {
    console.log(`  ${ids.has(t.id) ? 'modifié ' : 'nouveau '} ${t.id}  ${t.nom ?? ''}${t.updatedAt ? `  (maj ${t.updatedAt})` : ''}`);
  }

  // Réconciliation : on liste, on ne supprime jamais.
  const chezThomas = new Set(await idsThomas());
  const disparus = connus.filter((c) => !chezThomas.has(c.id));
  console.log(`\nRéconciliation (/ids) : ${chezThomas.size} id(s) chez Thomas, ${connus.length} synchronisé(s) chez nous.`);
  if (disparus.length) {
    console.log(`  ⚠ ${disparus.length} id(s) disparu(s) chez Thomas (rien n'a été supprimé chez nous) :`);
    for (const d of disparus) console.log(`    ${d.id}  ${d.nom}  (dernière synchro ${d.updated_at})`);
  } else {
    console.log('  Aucun id disparu.');
  }
}

try {
  if (liste) await lister();
  else if (tournoiId || fichier) await synchroniser();
  else {
    console.error('Usage : --liste | --tournoi=<id> [--apercu] | --fichier=<json> --apercu');
    process.exit(1);
  }
} catch (e) {
  if (e instanceof BracketIncoherent) {
    console.error(`\n${e.message}`);
    for (const m of e.erreurs.slice(0, 30)) console.error(`  - ${m}`);
    if (e.erreurs.length > 30) console.error(`  … et ${e.erreurs.length - 30} autre(s).`);
  } else {
    // Messages déjà sûrs (jamais de clé) : ErreurApiThomas, ErreurFormatThomas, erreurs Supabase.
    console.error(`\n${(e as Error).message}`);
  }
  process.exit(1);
}
