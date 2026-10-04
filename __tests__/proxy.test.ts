// @vitest-environment node
/**
 * PROXY — allowlist du point de contrôle de production.
 *
 * Seul `GET /api/verif/<contrôle>` avec un `x-verif-token` valide passe sans
 * session. Le jeton n'ouvre AUCUN autre chemin : les pages redirigent
 * toujours vers /login, les autres routes /api répondent toujours 401.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

// Valeur de TEST, pas le vrai jeton (que seul l'utilisateur crée).
const JETON = 'jeton-de-test-uniquement-'.padEnd(48, 'x');

function passer(chemin: string, { methode = 'GET', jeton }: { methode?: string; jeton?: string } = {}) {
  return proxy(
    new NextRequest(`http://localhost${chemin}`, {
      method: methode,
      headers: jeton === undefined ? {} : { 'x-verif-token': jeton },
    }),
  );
}

const laissePasser = (r: Response) => r.headers.get('x-middleware-next') === '1';
const versLogin = (r: Response) =>
  r.status >= 300 && r.status < 400 && (r.headers.get('location') ?? '').includes('/login');

beforeEach(() => vi.stubEnv('VERIF_TOKEN', JETON));
afterEach(() => vi.unstubAllEnvs());

describe('/api/verif/<contrôle>', () => {
  it('GET avec jeton valide : laissé passer', () => {
    expect(laissePasser(passer('/api/verif/sante', { jeton: JETON }))).toBe(true);
    expect(laissePasser(passer('/api/verif/fantasy-equipe?tournoi=x', { jeton: JETON }))).toBe(true);
  });

  it('sans jeton, jeton faux ou VERIF_TOKEN absent : 401 comme toute route /api', () => {
    expect(passer('/api/verif/sante').status).toBe(401);
    expect(passer('/api/verif/sante', { jeton: 'faux' }).status).toBe(401);
    vi.stubEnv('VERIF_TOKEN', '');
    expect(passer('/api/verif/sante', { jeton: '' }).status).toBe(401);
  });

  it('méthode non-GET refusée, même avec jeton valide', () => {
    for (const methode of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
      expect(passer('/api/verif/sante', { methode, jeton: JETON }).status).toBe(401);
    }
  });

  it('chemins voisins refusés, même avec jeton valide', () => {
    for (const chemin of [
      '/api/verif',
      '/api/verif/',
      '/api/verif/sante/plus',
      '/api/verification/sante',
      '/api/verif/../recompute',
    ]) {
      const r = passer(chemin, { jeton: JETON });
      expect(laissePasser(r), chemin).toBe(false);
    }
  });
});

describe('le jeton de vérification n’ouvre rien d’autre', () => {
  it('les pages redirigent toujours vers /login', () => {
    for (const chemin of ['/', '/import', '/tournoi/x/picks', '/tournoi/x/fantasy', '/calibration']) {
      expect(versLogin(passer(chemin)), chemin).toBe(true);
      expect(versLogin(passer(chemin, { jeton: JETON })), `${chemin} + jeton`).toBe(true);
    }
  });

  it('les autres routes /api répondent toujours 401', () => {
    for (const chemin of ['/api/recompute', '/api/agent/tour-courant', '/api/fantasy/backfill']) {
      for (const methode of ['GET', 'POST']) {
        expect(passer(chemin, { methode, jeton: JETON }).status, `${methode} ${chemin}`).toBe(401);
      }
    }
  });

  it('Server Action avec jeton : 401', () => {
    const r = proxy(
      new NextRequest('http://localhost/import', {
        method: 'POST',
        headers: { 'next-action': 'x', 'x-verif-token': JETON },
      }),
    );
    expect(r.status).toBe(401);
  });

  it('/login reste public', () => {
    expect(laissePasser(passer('/login'))).toBe(true);
  });
});
