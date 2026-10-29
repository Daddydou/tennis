/**
 * QUOTA DE L'API TENNIS (RapidAPI, plan gratuit : 50 requêtes par fenêtre glissante de 24 h).
 *
 * Fait UNE requête légère (le calendrier actif — elle compte pour 1 sur les 50) et affiche ce
 * qui reste, d'après l'en-tête `x-ratelimit-requests-remaining`, et quand il se renouvelle
 * (`x-ratelimit-requests-reset`). Ne modifie rien, n'écrit rien, n'affiche jamais la clé.
 *
 *   npm run verify:quota-api
 */
import { HOTE_API } from '../lib/extract/matchstat.ts';

const cle = process.env.RAPIDAPI_KEY;
if (!cle) {
  console.error('RAPIDAPI_KEY manquante (--env-file=.env.local).');
  process.exit(1);
}

const res = await fetch(`https://${HOTE_API}/tennis/v2/calendar/active`, {
  headers: { 'X-RapidAPI-Key': cle, 'X-RapidAPI-Host': HOTE_API },
});
const restant = res.headers.get('x-ratelimit-requests-remaining');
const limite = res.headers.get('x-ratelimit-requests-limit');
const reset = Number(res.headers.get('x-ratelimit-requests-reset') ?? NaN);

console.log(`Réponse HTTP ${res.status}${res.status === 429 ? ' (quota épuisé)' : ''}.`);
console.log(
  restant === null
    ? 'Quota restant : inconnu (la réponse ne portait pas l\'en-tête).'
    : `Quota restant : ${restant}${limite ? ` sur ${limite}` : ''} (cette vérification a consommé 1 requête).`,
);
if (Number.isFinite(reset)) {
  const heure = new Date(Date.now() + reset * 1000).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
  console.log(`Renouvellement dans ${Math.round(reset / 60)} min (vers ${heure}, heure de Paris).`);
}
