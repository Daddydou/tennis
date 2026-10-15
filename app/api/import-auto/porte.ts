import type { NextRequest } from 'next/server';
import { ENTETE_IMPORT_AUTO, verifierJetonImportAuto } from '@/auth/session';

/**
 * Porte commune des routes /api/import-auto/* : en-tête `x-import-token`
 * égal à `IMPORT_AUTO_TOKEN` (comparaison à temps constant). La session de
 * l'app n'est PAS acceptée : un seul mode d'accès, facile à révoquer.
 * Variable absente, jeton absent ou faux : 404, même corps partout.
 */
export const SANS_CACHE = { 'Cache-Control': 'no-store' };

export function jetonValide(req: NextRequest): boolean {
  return verifierJetonImportAuto(req.headers.get(ENTETE_IMPORT_AUTO));
}

export function introuvable() {
  return Response.json({ ok: false }, { status: 404, headers: SANS_CACHE });
}

export function erreurInterne(contexte: string, e: unknown) {
  console.error(`[import-auto] ${contexte} :`, (e as Error).message);
  return Response.json({ ok: false, error: 'Erreur interne.' }, { status: 500, headers: SANS_CACHE });
}
