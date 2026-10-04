// @vitest-environment node
/**
 * Client HTTP de l'API de Thomas : GET + Bearer, et la clé n'apparaît dans
 * AUCUN message d'erreur. `fetch` est simulé : aucun appel réseau.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_THOMAS, ErreurApiThomas, bracketThomas, idsThomas, listerTournoisThomas } from '../thomasClient';

// Valeur de TEST, pas la vraie clé (que seul l'utilisateur crée).
const CLE = 'cle-de-test-uniquement-0123456789';

beforeEach(() => vi.stubEnv('THOMAS_API_KEY', CLE));
afterEach(() => vi.unstubAllEnvs());

const repondre = (corps: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(corps), { status })) as unknown as typeof fetch;

async function messageDErreur(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ErreurApiThomas);
    return `${(e as Error).message} ${(e as Error).stack ?? ''} ${JSON.stringify(e)}`;
  }
  throw new Error('aucune erreur levée');
}

describe('requête', () => {
  it('GET avec Authorization: Bearer, sur la bonne route', async () => {
    const f = repondre(['a']);
    await idsThomas(f);
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`${BASE_THOMAS}/ids`);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe(`Bearer ${CLE}`);
    expect(init.cache).toBe('no-store');
  });

  it('updatedSince et id de tournoi encodés', async () => {
    const f = repondre([]);
    await listerTournoisThomas('2026-10-01T00:00:00.000Z', f);
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      `${BASE_THOMAS}/tournaments?updatedSince=2026-10-01T00%3A00%3A00.000Z`,
    );
    const g = repondre({});
    await bracketThomas('a&b=c', g).catch(() => {});
    expect((g as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(`${BASE_THOMAS}/brackets?tournoi=a%26b%3Dc`);
  });

  it('clé lue au moment de l’appel', async () => {
    vi.stubEnv('THOMAS_API_KEY', 'autre-cle-de-test');
    const f = repondre([]);
    await idsThomas(f);
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].headers.Authorization).toBe('Bearer autre-cle-de-test');
  });
});

describe('la clé ne fuit jamais', () => {
  it('clé absente : erreur claire, aucun appel', async () => {
    vi.stubEnv('THOMAS_API_KEY', '');
    const f = repondre([]);
    expect(await messageDErreur(idsThomas(f))).toMatch(/THOMAS_API_KEY absente/);
    expect(f).not.toHaveBeenCalled();
  });

  it('HTTP 401 dont le corps renvoie la clé : message sans la clé', async () => {
    const f = repondre({ error: `clé refusée : ${CLE}` }, 401);
    const m = await messageDErreur(idsThomas(f));
    expect(m).toMatch(/\/ids : HTTP 401/);
    expect(m).not.toContain(CLE);
  });

  it('échec réseau dont l’erreur cite la requête : message sans la clé', async () => {
    const f = vi.fn(async () => {
      throw new TypeError(`fetch failed (Authorization: Bearer ${CLE})`);
    }) as unknown as typeof fetch;
    const m = await messageDErreur(bracketThomas('x', f));
    expect(m).toMatch(/échec réseau/);
    expect(m).not.toContain(CLE);
  });

  it('réponse non JSON : message sans la clé', async () => {
    const f = vi.fn(async () => new Response(`<html>${CLE}</html>`, { status: 200 })) as unknown as typeof fetch;
    const m = await messageDErreur(idsThomas(f));
    expect(m).toMatch(/non JSON/);
    expect(m).not.toContain(CLE);
  });
});
