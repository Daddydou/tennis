/**
 * EXTRACTEURS PARTAGÉS — point d'entrée.
 *
 * Utilisés à la fois par :
 *  - le serveur (POST /api/import-auto/run : page WTA récupérée puis lue avec jsdom) ;
 *  - le userscript Tampermonkey (tools/userscript/, empaqueté avec esbuild
 *    depuis CE module : pas de copie divergente).
 *
 * Fonctions pures, sans Node, Next ni Supabase.
 */

import { parseExtract, verifierExtraction } from '../parser';
import { extractAtp } from './atp';
import { extractWta } from './wta';
import type { ExtraitBrut } from './types';

export { extractAtp } from './atp';
export { extractWta } from './wta';
export type { ExtraitBrut, JoueurBrut, MatchBrut, SetBrut } from './types';

/** Circuit d'une URL de tableau, d'après son domaine ; null si inconnu. */
export function circuitDeUrl(url: string): 'ATP' | 'WTA' | null {
  let hote: string;
  try {
    hote = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (hote === 'www.atptour.com' || hote === 'atptour.com') return 'ATP';
  if (hote === 'www.wtatennis.com' || hote === 'wtatennis.com') return 'WTA';
  return null;
}

/** Extrait le tableau d'un document selon le domaine de son URL. */
export function extraireDepuisDocument(doc: Document, url: string, maintenant = new Date()): ExtraitBrut | null {
  const circuit = circuitDeUrl(url);
  if (circuit === 'ATP') return extractAtp(doc, url, maintenant);
  if (circuit === 'WTA') return extractWta(doc, url, maintenant);
  return null;
}

export type ControleExtrait =
  | { ok: true; avertissements: string[]; matchs: number }
  | { ok: false; erreur: string };

/**
 * Contrôle AVANT envoi : le JSON doit passer par les mêmes `parseExtract` et
 * `verifierExtraction` que l'import manuel. Une extraction sans match est un
 * échec (on n'importe jamais du vide) ; les incohérences restent de simples
 * avertissements, comme à l'import manuel.
 */
export function controlerExtrait(brut: unknown): ControleExtrait {
  if (!brut || typeof brut !== 'object') return { ok: false, erreur: 'Extraction absente.' };
  let extract;
  try {
    extract = parseExtract(brut);
  } catch (e) {
    return { ok: false, erreur: `Extraction illisible : ${(e as Error).message}` };
  }
  if (extract.matches.length === 0) return { ok: false, erreur: 'Aucun match dans cette extraction.' };
  return { ok: true, avertissements: verifierExtraction(extract).avertissements, matchs: extract.matches.length };
}
