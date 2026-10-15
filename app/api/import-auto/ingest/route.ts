import type { NextRequest } from 'next/server';
import { importerPourSurveillance, signalerEchecNavigateur } from '@/db/importAutoFlux';
import { erreurInterne, introuvable, jetonValide, SANS_CACHE } from '../porte';

export const dynamic = 'force-dynamic';
// Import + préchauffage Monte Carlo : plusieurs secondes, parfois davantage.
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/import-auto/ingest — envoyé par le userscript.
 *
 *   { json, tournament_id? }   extraction (objet ou texte JSON) à importer ;
 *   { tournament_id, echec }   échec d'extraction côté navigateur, journalisé.
 *
 * Refusé (400/409, rien d'écrit dans les tables du jeu) : JSON invalide ou
 * vide, tournoi inconnu / non surveillé / arrêté, extraction d'un autre
 * tournoi que celui annoncé.
 */
export async function POST(req: NextRequest) {
  if (!jetonValide(req)) return introuvable();

  let corps: { json?: unknown; tournament_id?: unknown; echec?: unknown };
  try {
    corps = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Corps JSON invalide.' }, { status: 400, headers: SANS_CACHE });
  }
  const tournamentId = typeof corps.tournament_id === 'string' ? corps.tournament_id : null;
  if (tournamentId !== null && !UUID.test(tournamentId)) {
    return Response.json({ ok: false, error: 'tournament_id invalide.' }, { status: 400, headers: SANS_CACHE });
  }

  try {
    if (corps.echec !== undefined) {
      if (!tournamentId) return Response.json({ ok: false, error: 'tournament_id requis.' }, { status: 400, headers: SANS_CACHE });
      const note = await signalerEchecNavigateur(tournamentId, String(corps.echec));
      return Response.json({ ok: note }, { status: note ? 200 : 409, headers: SANS_CACHE });
    }

    let brut = corps.json;
    if (typeof brut === 'string') {
      try {
        brut = JSON.parse(brut);
      } catch {
        return Response.json({ ok: false, error: 'json : texte JSON invalide.' }, { status: 400, headers: SANS_CACHE });
      }
    }
    const r = await importerPourSurveillance(brut, 'navigateur', tournamentId);
    const statut = r.statut === 'importe' || r.statut === 'inchange' ? 200 : r.statut === 'arrete' ? 409 : 400;
    return Response.json({ ok: statut === 200, ...r }, { status: statut, headers: SANS_CACHE });
  } catch (e) {
    return erreurInterne('ingest', e);
  }
}
