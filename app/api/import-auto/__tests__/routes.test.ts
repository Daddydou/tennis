// @vitest-environment node
/**
 * ROUTES /api/import-auto/* — la porte (jeton), la validation des corps et
 * l'aiguillage vers db/importAutoFlux.ts (moqué : pas de base, pas de réseau).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const etatSurveillances = vi.fn(async () => [{ tournament_id: 'x', du: true }]);
const importerPourSurveillance = vi.fn<(...a: unknown[]) => Promise<{ tournament_id: string; statut: string }>>(async () => ({ tournament_id: 'x', statut: 'importe' }));
const signalerEchecNavigateur = vi.fn<(...a: unknown[]) => Promise<boolean>>(async () => true);
const passage = vi.fn(async (o: { dry: boolean }) => ({ ok: true, dry: o.dry, erreurs: 0, resultats: [] }));

vi.mock('@/db/importAuto', () => ({ etatSurveillances: () => etatSurveillances() }));
vi.mock('@/db/importAutoFlux', () => ({
  importerPourSurveillance: (...a: unknown[]) => importerPourSurveillance(...a),
  signalerEchecNavigateur: (...a: unknown[]) => signalerEchecNavigateur(...a),
  passage: (o: { dry: boolean }) => passage(o),
}));

const etat = await import('../etat/route');
const ingest = await import('../ingest/route');
const run = await import('../run/route');

// Valeur de TEST, pas le vrai jeton.
const JETON = 'jeton-import-de-test-'.padEnd(48, 'z');
const UUID = '3f67c168-7bf6-41cd-8f71-4acbda4f62db';

function req(chemin: string, { methode = 'GET', jeton, corps }: { methode?: string; jeton?: string; corps?: string } = {}) {
  return new NextRequest(`http://localhost${chemin}`, {
    method: methode,
    headers: jeton === undefined ? {} : { 'x-import-token': jeton },
    body: corps,
  });
}

beforeEach(() => vi.stubEnv('IMPORT_AUTO_TOKEN', JETON));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('porte : 404 identique sans jeton valide', () => {
  it('jeton absent, faux, variable absente ou trop courte', async () => {
    for (const r of [
      await etat.GET(req('/api/import-auto/etat')),
      await etat.GET(req('/api/import-auto/etat', { jeton: 'faux' })),
      await run.POST(req('/api/import-auto/run', { methode: 'POST', jeton: 'faux' })),
      await ingest.POST(req('/api/import-auto/ingest', { methode: 'POST', corps: '{}' })),
    ]) {
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ ok: false });
    }
    vi.stubEnv('IMPORT_AUTO_TOKEN', '');
    expect((await etat.GET(req('/api/import-auto/etat', { jeton: '' }))).status).toBe(404);
    vi.stubEnv('IMPORT_AUTO_TOKEN', 'court');
    expect((await etat.GET(req('/api/import-auto/etat', { jeton: 'court' }))).status).toBe(404);
    expect(passage).not.toHaveBeenCalled();
    expect(importerPourSurveillance).not.toHaveBeenCalled();
  });

  it('seules les méthodes prévues sont exportées', () => {
    expect(Object.keys(etat).filter((k) => /^[A-Z]+$/.test(k))).toEqual(['GET']);
    expect(Object.keys(ingest).filter((k) => /^[A-Z]+$/.test(k))).toEqual(['POST']);
    expect(Object.keys(run).filter((k) => /^[A-Z]+$/.test(k))).toEqual(['POST']);
  });
});

describe('etat', () => {
  it('renvoie la liste, sans cache', async () => {
    const r = await etat.GET(req('/api/import-auto/etat', { jeton: JETON }));
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ ok: true, tournois: [{ tournament_id: 'x', du: true }] });
  });
});

describe('ingest', () => {
  const poster = (corps: string) => ingest.POST(req('/api/import-auto/ingest', { methode: 'POST', jeton: JETON, corps }));

  it('corps invalide, json texte invalide, tournament_id invalide : 400 sans import', async () => {
    expect((await poster('pas du json')).status).toBe(400);
    expect((await poster(JSON.stringify({ json: '{oups' }))).status).toBe(400);
    expect((await poster(JSON.stringify({ json: {}, tournament_id: 'x' }))).status).toBe(400);
    expect(importerPourSurveillance).not.toHaveBeenCalled();
  });

  it('extraction (objet ou texte) transmise avec la source navigateur', async () => {
    expect((await poster(JSON.stringify({ json: { a: 1 }, tournament_id: UUID }))).status).toBe(200);
    expect(importerPourSurveillance).toHaveBeenLastCalledWith({ a: 1 }, 'navigateur', UUID);
    await poster(JSON.stringify({ json: '{"b":2}' }));
    expect(importerPourSurveillance).toHaveBeenLastCalledWith({ b: 2 }, 'navigateur', null);
  });

  it('statuts : arrêté -> 409, erreur -> 400', async () => {
    importerPourSurveillance.mockResolvedValueOnce({ tournament_id: UUID, statut: 'arrete' });
    expect((await poster(JSON.stringify({ json: {} }))).status).toBe(409);
    importerPourSurveillance.mockResolvedValueOnce({ tournament_id: UUID, statut: 'erreur' });
    expect((await poster(JSON.stringify({ json: {} }))).status).toBe(400);
  });

  it('échec navigateur : journalisé, tournament_id requis', async () => {
    expect((await poster(JSON.stringify({ echec: '0 match' }))).status).toBe(400);
    expect((await poster(JSON.stringify({ echec: '0 match', tournament_id: UUID }))).status).toBe(200);
    expect(signalerEchecNavigateur).toHaveBeenCalledWith(UUID, '0 match');
    expect(importerPourSurveillance).not.toHaveBeenCalled();
  });
});

describe('run', () => {
  it('dry=1 transmis ; source_url refusé hors dry', async () => {
    const r = await run.POST(req('/api/import-auto/run?dry=1', { methode: 'POST', jeton: JETON }));
    expect(await r.json()).toMatchObject({ ok: true, dry: true });
    expect(passage).toHaveBeenLastCalledWith({ dry: true, urlTest: null });

    const r2 = await run.POST(req('/api/import-auto/run?source_url=https://www.wtatennis.com/x', { methode: 'POST', jeton: JETON }));
    expect(r2.status).toBe(400);
    expect(passage).toHaveBeenCalledTimes(1);
  });

  it('erreur interne : 500 générique, sans détail', async () => {
    passage.mockRejectedValueOnce(new Error('secret interne'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await run.POST(req('/api/import-auto/run', { methode: 'POST', jeton: JETON }));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, error: 'Erreur interne.' });
    spy.mockRestore();
  });
});
