// Comble le trou entre la fin de l'archive Sackmann (début juin 2026) et aujourd'hui avec
// l'API tennis : résultats ATP et WTA, Challengers / WTA 125 compris (filtre TourRank 1 à 4,
// sans les Futures / ITF 15-25 K), une page de 500 matchs par semaine et par circuit.
//
//   node --env-file=.env.local recherche/elo-maison/combler-api.mjs [budget] [début AAAA-MM-JJ]
//
// QUOTA : 50 requêtes/jour sur le plan gratuit, partagées avec l'import des tableaux.
// `budget` (défaut 10) plafonne les requêtes de CE lancement ; les pages déjà téléchargées
// (dossier _donnees/api) ne sont jamais redemandées : relancer le lendemain reprend où on
// s'est arrêté. La clé (RAPIDAPI_KEY) n'est jamais affichée.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DOSSIER = 'C:\\Users\\lolor\\Projets\\_donnees\\api';
const BUDGET = Number(process.argv[2] ?? 10);
const DEBUT = process.argv[3] ?? '2026-06-01';
const HOST = 'tennis-api-atp-wta-itf.p.rapidapi.com';
const KEY = process.env.RAPIDAPI_KEY;
if (!KEY) throw new Error('RAPIDAPI_KEY absente de .env.local');
mkdirSync(DOSSIER, { recursive: true });

const jour = (d) => d.toISOString().slice(0, 10);
const plus = (d, n) => new Date(d.getTime() + n * 86400000);
// Fenêtres hebdomadaires closes : jusqu'à hier (les matchs du jour ne sont pas finis).
const hier = plus(new Date(`${jour(new Date())}T00:00:00Z`), -1);
const fenetres = [];
for (let d = new Date(`${DEBUT}T00:00:00Z`); d <= hier; d = plus(d, 7)) {
  const fin = plus(d, 6) < hier ? plus(d, 6) : hier;
  for (const tour of ['atp', 'wta']) fenetres.push({ tour, debut: jour(d), fin: jour(fin) });
}

let utilisees = 0;
let reste = null;
for (const f of fenetres) {
  for (let page = 1; ; page++) {
    const fichier = join(DOSSIER, `${f.tour}-${f.debut}-${f.fin}-p${page}.json`);
    // Une fenêtre qui finit hier sera redemandée tant qu'elle n'est pas « vieille » : on la
    // marque par sa date de fin, une nouvelle fenêtre plus longue aura un autre nom.
    if (existsSync(fichier)) {
      const suivante = join(DOSSIER, `${f.tour}-${f.debut}-${f.fin}-p${page + 1}.json`);
      if (existsSync(suivante)) continue;
      const deja = JSON.parse((await import('node:fs')).readFileSync(fichier, 'utf8'));
      if (!deja.hasNextPage) break;
      continue;
    }
    if (utilisees >= BUDGET) {
      console.log(`Budget de ${BUDGET} requête(s) atteint. Relancer plus tard pour continuer (reste API : ${reste ?? '?'}).`);
      process.exit(0);
    }
    const url = `https://${HOST}/tennis/v2/${f.tour}/results/${f.debut}/${f.fin}?pageSize=500&pageNo=${page}&filter=TourRank:1,2,3,4`;
    const res = await fetch(url, { headers: { 'X-RapidAPI-Key': KEY, 'X-RapidAPI-Host': HOST } });
    utilisees++;
    reste = res.headers.get('x-ratelimit-requests-remaining');
    if (!res.ok) {
      console.log(`${f.tour} ${f.debut}→${f.fin} p${page} : HTTP ${res.status} — arrêt (reste API : ${reste}).`);
      process.exit(1);
    }
    const j = await res.json();
    writeFileSync(fichier, JSON.stringify(j));
    console.log(`${f.tour} ${f.debut}→${f.fin} p${page} : ${j.data?.length ?? 0} matchs${j.hasNextPage ? ' (page suivante)' : ''} · reste API ${reste}`);
    if (!j.hasNextPage) break;
  }
}
const n = readdirSync(DOSSIER).length;
console.log(`Trou comblé : ${n} page(s) en cache, ${utilisees} requête(s) utilisée(s).`);
