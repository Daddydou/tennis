// @vitest-environment node
/**
 * POINT DE CONTRÔLE DE PRODUCTION — app/api/verif/[controle]/route.ts
 *
 * 404 identique pour : VERIF_TOKEN absent, jeton absent, jeton faux, contrôle
 * inconnu. Seul GET est exporté. Supabase est remplacé par un faux client en
 * lecture : on teste la porte, pas le réseau.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Faux client anon : toute chaîne de requête se résout en « aucune ligne ».
function requete() {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'not', 'order', 'limit', 'in']) q[m] = () => q;
  q.maybeSingle = () => Promise.resolve({ data: null, error: null });
  q.then = (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(ok, ko);
  return q;
}
const ecritures = vi.fn();
vi.mock('@/db/anon', () => ({ supabaseAnon: () => ({ from: () => requete() }) }));
vi.mock('@/db/server', () => ({
  supabaseAdmin: () => {
    ecritures();
    throw new Error('supabaseAdmin interdit dans /api/verif');
  },
}));

const route = await import('../[controle]/route');

// Valeur de TEST, pas le vrai jeton (que seul l'utilisateur crée).
const JETON = 'jeton-de-test-uniquement-'.padEnd(48, 'x');

function appeler(controle: string, jeton?: string, query = '') {
  const req = new NextRequest(`http://localhost/api/verif/${controle}${query}`, {
    headers: jeton === undefined ? {} : { 'x-verif-token': jeton },
  });
  return route.GET(req, { params: Promise.resolve({ controle }) });
}

beforeEach(() => vi.stubEnv('VERIF_TOKEN', JETON));
afterEach(() => {
  vi.unstubAllEnvs();
  ecritures.mockClear();
});

describe('authentification', () => {
  it('VERIF_TOKEN absent : 404, même avec un en-tête', async () => {
    vi.stubEnv('VERIF_TOKEN', '');
    const r = await appeler('sante', '');
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ ok: false });
  });

  it('VERIF_TOKEN trop court : 404, même avec le bon jeton', async () => {
    vi.stubEnv('VERIF_TOKEN', 'court');
    expect((await appeler('sante', 'court')).status).toBe(404);
  });

  it('jeton absent : 404', async () => {
    const r = await appeler('sante');
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ ok: false });
  });

  it('jeton faux (même longueur, ou préfixe) : 404 et même corps', async () => {
    for (const faux of [JETON.slice(0, -1) + 'y', JETON.slice(0, 20), `${JETON}x`]) {
      const r = await appeler('sante', faux);
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ ok: false });
      expect(r.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('jeton valide : 200, JSON minimal, no-store', async () => {
    const r = await appeler('sante', JETON);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const corps = await r.json();
    expect(corps).toMatchObject({ ok: true, controle: 'sante', tournois: [] });
    expect(JSON.stringify(corps)).not.toContain(JETON);
  });
});

describe('liste fixe de contrôles', () => {
  it('contrôle inconnu : 404, même avec le bon jeton', async () => {
    for (const nom of ['inconnu', 'constructor', '__proto__', 'toString', 'SANTE']) {
      const r = await appeler(nom, JETON);
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ ok: false });
    }
  });

  it('contrôle inconnu sans jeton : même 404 que le jeton faux', async () => {
    const a = await appeler('inconnu');
    const b = await appeler('sante', 'faux');
    expect([a.status, await a.text()]).toEqual([b.status, await b.text()]);
  });

  it('fantasy-equipe sans uuid valide : 400, aucune lecture lancée', async () => {
    for (const q of ['', '?tournoi=abc', "?tournoi=1'%20or%201=1"]) {
      const r = await appeler('fantasy-equipe', JETON, q);
      expect(r.status).toBe(400);
    }
  });

  it("aucun contrôle n'appelle supabaseAdmin", async () => {
    await appeler('sante', JETON);
    await appeler(
      'fantasy-equipe',
      JETON,
      '?tournoi=00000000-0000-0000-0000-000000000000',
    );
    expect(ecritures).not.toHaveBeenCalled();
  });
});

describe('méthodes', () => {
  it('seul GET est exporté (Next répond 405 aux autres)', () => {
    const methodes = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
    expect(methodes.filter((m) => m in route)).toEqual(['GET']);
  });
});
