// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Ligne = Record<string, unknown>;
let tables: Record<string, Ligne[]> = {};

/** Faux client Supabase : select / eq / limit / maybeSingle (+ attente directe d'une liste). */
function fauxClient() {
  const from = (table: string) => {
    const filtres: ((l: Ligne) => boolean)[] = [];
    const cibles = () => (tables[table] ?? []).filter((l) => filtres.every((f) => f(l)));
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (k: string, v: unknown) => (filtres.push((l) => l[k] === v), b),
      limit: () => b,
      maybeSingle: async () => ({ data: cibles()[0] ?? null, error: null }),
      then: (ok: (r: { data: Ligne[]; error: null }) => unknown) => Promise.resolve({ data: cibles(), error: null }).then(ok),
    };
    return b;
  };
  return { from };
}

vi.mock('@/db/server', () => ({ supabaseAdmin: () => fauxClient() }));
vi.mock('@/db/importCoeur', () => ({ importerExtraitCoeur: async () => ({ ok: true, avertissements: [] }) }));
vi.mock('@/db/importAuto', () => ({ noterImportManuel: async () => null }));
vi.mock('@/externe/tennisApiClient', () => ({ calendrierAnnee: async () => ({ donnees: [] }), tableauTournoi: async () => ({ donnees: {} }) }));

import { PREFIXE_ID } from '@/lib/extract/matchstat';
import { mastersExistantPourSaison } from '../importApi';

const URL_ATP = 'https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/tournament/atp/Nitto%20ATP%20Finals%20-%20Turin/2026/draws?fullBracket=true';
const MASTERS = ['J1', 'J2', 'J3', 'SF', 'F'];
const edition = { type: 'atp' as const, nom: 'Nitto ATP Finals - Turin', annee: 2026 };

beforeEach(() => {
  tables = {
    tn_tournaments: [{ id: 'gt-masters', external_id: 'gt:abc', rounds: MASTERS }],
    tn_import_auto: [{ tournament_id: 'gt-masters', source_url: URL_ATP, mode: 'api' }],
  };
});

describe('mastersExistantPourSaison', () => {
  it('Masters importé par l\'API (<préfixe API><saison>) : retrouvé par son identifiant, comme avant', async () => {
    tables.tn_tournaments.push({ id: 'api-masters', external_id: `${PREFIXE_ID}21364`, rounds: MASTERS });
    expect(await mastersExistantPourSaison(21364)).toBe('api-masters');
  });

  it('<préfixe API><saison> existe mais n\'est pas un Masters : null (import générique)', async () => {
    tables.tn_tournaments.push({ id: 'tableau', external_id: `${PREFIXE_ID}21364`, rounds: ['R16', 'QF', 'SF', 'F'] });
    expect(await mastersExistantPourSaison(21364, edition)).toBeNull();
  });

  it('Masters créé depuis Game Tracker (gt:…) : retrouvé par sa surveillance (circuit, nom d\'API, année)', async () => {
    expect(await mastersExistantPourSaison(21364, edition)).toBe('gt-masters');
  });

  it('sans l\'édition, pas de recherche par surveillance', async () => {
    expect(await mastersExistantPourSaison(21364)).toBeNull();
  });

  it('autre nom, autre année ou autre circuit : null', async () => {
    expect(await mastersExistantPourSaison(1, { ...edition, nom: 'WTA Finals - Indian Wells' })).toBeNull();
    expect(await mastersExistantPourSaison(1, { ...edition, annee: 2025 })).toBeNull();
    expect(await mastersExistantPourSaison(1, { ...edition, type: 'wta' })).toBeNull();
  });

  it('la surveillance pointe un tournoi qui n\'est pas un Masters : null', async () => {
    tables.tn_tournaments = [{ id: 'gt-masters', external_id: 'gt:abc', rounds: ['R16', 'QF', 'SF', 'F'] }];
    expect(await mastersExistantPourSaison(21364, edition)).toBeNull();
  });
});
