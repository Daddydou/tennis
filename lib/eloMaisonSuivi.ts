/**
 * ELO MAISON — suivi quotidien : règles PURES (sans base, sans réseau).
 *
 * db/eloMaison.ts lit, chaque jour, les résultats de la veille dans l'API tennis. Ce module
 * décide QUAND un jour est complet, QUAND le suivi est en retard (et ce qu'il faut en faire) et
 * COMBIEN de requêtes on accepte d'y consacrer. Le quota de l'API (50 requêtes par fenêtre
 * glissante de 24 h) est partagé avec les tableaux de tournois : l'Elo ne doit ni l'affamer
 * ni mourir de faim.
 */

const JOUR_MS = 86_400_000;
const HEURE_MS = 3_600_000;

export const jourIso = (d: Date): string => d.toISOString().slice(0, 10);
export const jourNum = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / JOUR_MS);

/**
 * Délai après lequel les résultats d'un jour (UTC) sont tous connus : les derniers matchs du
 * continent américain se terminent vers 08-09 h UTC le lendemain. Marqué « traité » trop tôt,
 * un jour perdrait ses derniers matchs pour de bon (le suivi ne revient pas en arrière).
 */
export const DELAI_JOUR_COMPLET_H = 10;

/** Dernier jour (AAAA-MM-JJ) dont TOUS les résultats sont connus à cet instant. */
export function dernierJourComplet(maintenant: Date): string {
  const hier = new Date(maintenant.getTime() - DELAI_JOUR_COMPLET_H * HEURE_MS - JOUR_MS);
  return jourIso(hier);
}

/** Jours de retard du suivi sur le dernier jour complet (0 = à jour). */
export function retardJours(dernierJourTraite: string, maintenant: Date): number {
  return Math.max(0, jourNum(dernierJourComplet(maintenant)) - jourNum(dernierJourTraite));
}

/** Au-delà, on ne rattrape plus jour par jour (≈ 1 requête par jour et circuit) : ré-amorcer. */
export const RETARD_MAX_JOURS = 10;
/** À partir de là, le retard devient une ERREUR du passage (donc un e-mail d'échec GitHub). */
export const RETARD_ALERTE_JOURS = 3;
/** À partir de là, l'Elo passe AVANT les tableaux dans le passage (il risque d'être affamé). */
export const RETARD_URGENT_JOURS = 2;

export type GraviteRetard = 'aucune' | 'normale' | 'alerte' | 'en_retard';

export function graviteRetard(retard: number): GraviteRetard {
  if (retard > RETARD_MAX_JOURS) return 'en_retard';
  if (retard >= RETARD_ALERTE_JOURS) return 'alerte';
  return retard > 0 ? 'normale' : 'aucune';
}

/** L'Elo doit-il passer avant les tableaux ? */
export const eloEnPremier = (retard: number): boolean => retard >= RETARD_URGENT_JOURS;

/** Requêtes laissées aux tableaux quand l'Elo n'est pas en retard / quand il l'est. */
export const RESERVE_QUOTA_NORMALE = 8;
export const RESERVE_QUOTA_URGENTE = 1;

/**
 * Peut-on faire une requête de plus pour l'Elo ? `quotaRestant` vient de l'en-tête
 * x-ratelimit-requests-remaining de la dernière réponse (null = inconnu : on essaie).
 * Sans retard, on garde une réserve pour les prochains passages de tableaux ; en retard, on
 * ne s'arrête qu'au dernier cran.
 */
export function peutLireJour(quotaRestant: number | null, retard: number): boolean {
  if (quotaRestant === null) return true;
  const reserve = retard >= RETARD_URGENT_JOURS ? RESERVE_QUOTA_URGENTE : RESERVE_QUOTA_NORMALE;
  return quotaRestant > reserve;
}
