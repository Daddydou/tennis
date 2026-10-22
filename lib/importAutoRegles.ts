/**
 * IMPORT AUTOMATIQUE — règles pures (sans base, sans réseau).
 *
 * Quand un tournoi surveillé est-il « dû » ? Quand faut-il arrêter de le
 * surveiller ? Une extraction correspond-elle bien au tournoi visé ? Toutes
 * les décisions sont ici, testées seules (lib/__tests__/importAutoRegles.test.ts) ;
 * db/importAuto.ts ne fait que lire/écrire et appliquer.
 */

import type { DrawExtract, Tour } from './types';
import { lireUrlTableauApi } from './extract/matchstat';

/**
 * 'serveur'    : page WTA lue par le cron ;
 * 'navigateur' : page lue par le userscript (ATP) ;
 * 'api'        : tableau lu par le cron dans l'API tennis (ATP et WTA), sans page web.
 */
export type ModeImportAuto = 'serveur' | 'navigateur' | 'api';
export type SourceImport = 'serveur' | 'navigateur' | 'manuel';
export type MotifArret = 'finale_importee' | 'plafond_21j' | 'fin_tournoi' | 'manuel';

const HEURE = 60 * 60 * 1000;
const JOUR = 24 * HEURE;

/** Délai minimal entre deux imports réussis (passages à 12 h, avec marge). */
export const INTERVALLE_DU_MS = 11.5 * HEURE;
/**
 * Mode 'api' : passages toutes les 6 h (avec marge). Une requête par tournoi
 * et par passage : 4 par jour et par tournoi, sous le plafond de 50
 * requêtes/jour du plan gratuit même avec 6 ou 7 tournois en même temps.
 */
export const INTERVALLE_DU_API_MS = 5.5 * HEURE;

/** Délai entre deux imports réussis pour un mode donné. */
export function intervalleDu(mode?: ModeImportAuto | null): number {
  return mode === 'api' ? INTERVALLE_DU_API_MS : INTERVALLE_DU_MS;
}
/** Pas de relance automatique moins d'une heure après un échec automatique. */
export const PAUSE_APRES_ECHEC_MS = HEURE;
/** Surveillance coupée au plus tard 21 jours après le premier import. */
export const PLAFOND_MS = 21 * JOUR;
/** Marge après la date de fin du tournoi. */
export const MARGE_FIN_MS = 2 * JOUR;

/**
 * Mode par défaut à l'inscription : la page WTA est rendue côté serveur
 * (récupérable par le cron) ; atptour.com répond 403 Cloudflare hors
 * navigateur, l'ATP passe donc toujours par le userscript.
 */
export function modeParDefaut(tour: Tour, sourceUrl?: string | null): ModeImportAuto {
  if (sourceUrl && estUrlApi(sourceUrl, tour)) return 'api';
  return tour === 'WTA' ? 'serveur' : 'navigateur';
}

/**
 * URL de tableau de l'API tennis, pour ce circuit (même garde-fou SSRF que
 * `urlSourceAutorisee` : https, hôte RapidAPI exact, chemin de tableau).
 */
export function estUrlApi(url: string, tour: Tour): boolean {
  const u = lireUrlTableauApi(url);
  return !!u && (u.type === 'wta' ? 'WTA' : 'ATP') === tour;
}

/** URL source acceptable pour la surveillance : site officiel du circuit ou API tennis. */
export function urlSourceValide(url: string, tour: Tour): boolean {
  return urlSourceAutorisee(url, tour) || estUrlApi(url, tour);
}

/** Domaines d'où une page de tableau peut être lue, par circuit. */
const HOTES: Record<Tour, string[]> = {
  ATP: ['www.atptour.com', 'atptour.com'],
  WTA: ['www.wtatennis.com', 'wtatennis.com'],
};

/**
 * L'URL est-elle une page https du site officiel de CE circuit ? Garde-fou
 * contre toute requête serveur vers une adresse arbitraire (SSRF) : une
 * source_url qui ne passe pas ce test n'est ni enregistrée ni récupérée.
 */
export function urlSourceAutorisee(url: string, tour: Tour): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.protocol === 'https:' && !u.username && !u.password && !u.port && HOTES[tour].includes(u.hostname.toLowerCase());
}

export interface EtatSurveillance {
  actif: boolean;
  dernier_succes_at: string | null;
  mode?: ModeImportAuto | null;
}

/**
 * Un tournoi actif est dû s'il n'a jamais été importé avec succès ou si son
 * dernier succès date de plus de 11 h 30 (5 h 30 en mode 'api').
 */
export function estDu(s: EtatSurveillance, maintenant: Date): boolean {
  if (!s.actif) return false;
  if (!s.dernier_succes_at) return true;
  return maintenant.getTime() - new Date(s.dernier_succes_at).getTime() > intervalleDu(s.mode);
}

/** Un échec automatique récent (< 1 h) bloque la relance. */
export function enPauseApresEchec(dernierEchecAutoAt: string | null, maintenant: Date): boolean {
  if (!dernierEchecAutoAt) return false;
  return maintenant.getTime() - new Date(dernierEchecAutoAt).getTime() < PAUSE_APRES_ECHEC_MS;
}

/** Prochain passage prévu (affichage) : dernier succès + 11 h 30, ou « dès que possible ». */
export function prochainPassage(s: EtatSurveillance): Date | null {
  if (!s.actif || !s.dernier_succes_at) return null;
  return new Date(new Date(s.dernier_succes_at).getTime() + intervalleDu(s.mode));
}

export interface FaitsArret {
  /** Le match de round 'F' a un vainqueur en base (tn_matches.winner_id). */
  finaleGagnee: boolean;
  /** tn_tournaments.status */
  statutTournoi: string | null;
  /** tn_tournaments.end_date (AAAA-MM-JJ) */
  dateFin: string | null;
  premierImportAt: string;
}

/**
 * Faut-il arrêter la surveillance ? Évalué après chaque import et au début
 * de chaque passage du cron. Ordre : finale, fin du tournoi, plafond.
 */
export function motifArret(f: FaitsArret, maintenant: Date): MotifArret | null {
  if (f.finaleGagnee) return 'finale_importee';
  if (f.statutTournoi === 'completed') return 'fin_tournoi';
  if (f.dateFin) {
    const fin = new Date(`${f.dateFin.slice(0, 10)}T23:59:59Z`).getTime();
    if (!Number.isNaN(fin) && maintenant.getTime() > fin + MARGE_FIN_MS) return 'fin_tournoi';
  }
  if (maintenant.getTime() - new Date(f.premierImportAt).getTime() > PLAFOND_MS) return 'plafond_21j';
  return null;
}

export interface TournoiIdentite {
  external_id: string | null;
  slug: string | null;
  tour: string;
  year: number;
}

/**
 * L'extraction désigne-t-elle bien ce tournoi ? Même clé que l'import
 * (`external_id, tour, year`, ou `slug, tour, year` sans identifiant) : un
 * ingest ne doit jamais écrire dans un AUTRE tournoi que celui annoncé.
 */
export function identiteCorrespond(e: DrawExtract, t: TournoiIdentite): boolean {
  if (e.tour !== t.tour || e.tournament.year !== t.year) return false;
  if (e.tournament.externalId) return e.tournament.externalId === t.external_id;
  return !!e.tournament.slug && e.tournament.slug === t.slug;
}

/**
 * Texte dont on prend l'empreinte pour détecter un tableau inchangé : le
 * contenu seul, sans l'horodatage ni l'URL de l'extraction.
 */
export function contenuAEmpreinter(brut: unknown): string {
  const o = (brut ?? {}) as Record<string, unknown>;
  return JSON.stringify({ tournament: o.tournament ?? null, tour: o.tour ?? null, matches: o.matches ?? null });
}
