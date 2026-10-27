// @vitest-environment node
/**
 * Client HTTP de l'API picks de Game Tracker : GET + POST avec Bearer, refus de
 * règle rendus (pas levés), et la clé n'apparaît dans AUCUN message d'erreur.
 * `fetch` est simulé : aucun appel réseau.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_GT_PICKS, ErreurApiGT, etatPicksGT, listerTournoisPicks, poserPicksGT } from '../gameTrackerPicksClient';

// Valeur de TEST, pas la vraie clé (que seul l'utilisateur crée).
const CLE = 'bk_live_cle-de-test-uniquement-0123456789';

beforeEach(() => vi.stubEnv('GAMETRACKER_PICKS_KEY', CLE));
afterEach(() => vi.unstubAllEnvs());

const repondre = (corps: unknown, status = 200, headers: Record<string, string> = {}) =>
  vi.fn(async () => new Response(JSON.stringify(corps), { status, headers })) as unknown as typeof fetch;
const appel = (f: typeof fetch) => (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];

const ETAT_MINIMAL = { maintenant: 'x', tournoi: { id: 'a', nom: 'b', drawSize: 32, statut: 'ONGOING' }, tourOuvert: null };

async function messageDErreur(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ErreurApiGT);
    return `${(e as Error).message} ${(e as Error).stack ?? ''} ${JSON.stringify(e)}`;
  }
  throw new Error('aucune erreur levée');
}

describe('requêtes', () => {
  it('GET /tournois : Bearer, route, no-store', async () => {
    const f = repondre({ tournois: [] });
    await listerTournoisPicks(f);
    const [url, init] = appel(f);
    expect(url).toBe(`${BASE_GT_PICKS}/tournois`);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe(`Bearer ${CLE}`);
    expect(init.cache).toBe('no-store');
    expect(init.body).toBeUndefined();
  });

  it('GET ?tournoi= : identifiant encodé', async () => {
    const f = repondre(ETAT_MINIMAL);
    await etatPicksGT('a&b=c', f);
    expect(appel(f)[0]).toBe(`${BASE_GT_PICKS}?tournoi=a%26b%3Dc`);
  });

  it('POST : corps JSON { tournoi, tour, haut, bas }, null conservé', async () => {
    const f = repondre({ enregistre: true, tour: 3, monPick: { haut: { position: 9, prenom: 'V', nom: 'W' }, bas: null } });
    const r = await poserPicksGT('t1', 3, 9, null, f);
    const [url, init] = appel(f);
    expect(url).toBe(BASE_GT_PICKS);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ tournoi: 't1', tour: 3, haut: 9, bas: null });
    expect(r).toMatchObject({ enregistre: true, statut: 200 });
  });

  it('clé lue au moment de l’appel', async () => {
    vi.stubEnv('GAMETRACKER_PICKS_KEY', 'autre-cle-de-test');
    const f = repondre({ tournois: [] });
    await listerTournoisPicks(f);
    expect(appel(f)[1].headers.Authorization).toBe('Bearer autre-cle-de-test');
  });
});

describe('refus de règle (POST) : rendus, pas levés', () => {
  it('422 { enregistre: false, erreur } : la raison est rendue', async () => {
    const f = repondre({ jeu: 'tennis-picks', enregistre: false, erreur: 'Ce joueur a déjà été pické lors d’un tour précédent' }, 422);
    const r = await poserPicksGT('t1', 3, 9, 27, f);
    expect(r).toMatchObject({ enregistre: false, statut: 422, erreur: 'Ce joueur a déjà été pické lors d’un tour précédent' });
  });

  it('une raison qui citerait la clé est nettoyée', async () => {
    const f = repondre({ enregistre: false, erreur: `refus pour ${CLE}` }, 403);
    const r = await poserPicksGT('t1', 3, 9, 27, f);
    expect(r.erreur).not.toContain(CLE);
    expect(r.erreur).toContain('***');
  });
});

describe('pannes : exception, et la clé ne fuit jamais', () => {
  it('clé absente : erreur claire, aucun appel', async () => {
    vi.stubEnv('GAMETRACKER_PICKS_KEY', '');
    const f = repondre({});
    expect(await messageDErreur(listerTournoisPicks(f))).toMatch(/GAMETRACKER_PICKS_KEY absente/);
    expect(f).not.toHaveBeenCalled();
  });

  it('401 dont le corps renvoie la clé : message sans la clé', async () => {
    const f = repondre({ error: `clé refusée : ${CLE}` }, 401);
    const m = await messageDErreur(listerTournoisPicks(f));
    expect(m).toMatch(/clé absente, invalide, révoquée ou expirée/);
    expect(m).not.toContain(CLE);
  });

  it('403 sur un GET : exception avec le sens du code', async () => {
    const m = await messageDErreur(etatPicksGT('t', repondre({}, 403)));
    expect(m).toMatch(/ne permet pas de poser des picks tennis/);
  });

  it('403 « pas inscrit » : la raison donnée par Game Tracker est reprise', async () => {
    const m = await messageDErreur(etatPicksGT('t', repondre({ erreur: 'Tu n’es pas inscrit à ce tournoi' }, 403)));
    expect(m).toMatch(/pas inscrit à ce tournoi/);
  });

  it('429 : délai Retry-After conservé', async () => {
    try {
      await etatPicksGT('t', repondre({}, 429, { 'Retry-After': '12' }));
      throw new Error('aucune erreur levée');
    } catch (e) {
      expect(e).toBeInstanceOf(ErreurApiGT);
      expect((e as ErreurApiGT).statut).toBe(429);
      expect((e as ErreurApiGT).retryApres).toBe(12);
    }
  });

  it('500 sur un POST sans enregistre:false : exception (pas un refus de règle)', async () => {
    const m = await messageDErreur(poserPicksGT('t', 1, 1, 2, repondre({ error: 'boom' }, 500)));
    expect(m).toMatch(/erreur côté Game Tracker/);
  });

  it('échec réseau dont l’erreur cite la requête : message sans la clé', async () => {
    const f = vi.fn(async () => {
      throw new TypeError(`fetch failed (Authorization: Bearer ${CLE})`);
    }) as unknown as typeof fetch;
    const m = await messageDErreur(etatPicksGT('x', f));
    expect(m).toMatch(/échec réseau/);
    expect(m).not.toContain(CLE);
  });

  it('réponse non JSON : message sans la clé', async () => {
    const f = vi.fn(async () => new Response(`<html>${CLE}</html>`, { status: 200 })) as unknown as typeof fetch;
    const m = await messageDErreur(etatPicksGT('x', f));
    expect(m).toMatch(/non JSON/);
    expect(m).not.toContain(CLE);
  });
});
