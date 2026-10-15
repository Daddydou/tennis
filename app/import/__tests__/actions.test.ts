// @vitest-environment node
/**
 * Server Action `importerExtrait` : la garde de session reste DANS l'action
 * (le cœur db/importCoeur.ts n'en a pas), puis le suivi de l'import
 * automatique s'ajoute en avertissement sans jamais faire échouer l'import.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportResult } from '@/db/importCoeur';

let session = false;
const coeur = vi.fn<(t: string) => Promise<ImportResult>>(async () => ({ ok: true, avertissements: ['a'], tournamentId: 'T1' }));
const suivi = vi.fn<(...a: unknown[]) => Promise<string | null>>(async () => null);

vi.mock('@/auth/garde', () => ({ sessionValide: async () => session }));
vi.mock('@/db/importCoeur', () => ({ importerExtraitCoeur: (t: string) => coeur(t) }));
vi.mock('@/db/importAuto', () => ({ noterImportManuel: (...a: unknown[]) => suivi(...a) }));

const { importerExtrait } = await import('../actions');

beforeEach(() => {
  session = false;
  vi.clearAllMocks();
});

describe('importerExtrait', () => {
  it('sans session : refus, rien importé ni journalisé', async () => {
    expect(await importerExtrait('{}')).toEqual({ ok: false, error: 'Non authentifié.', avertissements: [] });
    expect(coeur).not.toHaveBeenCalled();
    expect(suivi).not.toHaveBeenCalled();
  });

  it('avec session : résultat du cœur, tel quel', async () => {
    session = true;
    expect(await importerExtrait('{"x":1}')).toEqual({ ok: true, avertissements: ['a'], tournamentId: 'T1' });
    expect(coeur).toHaveBeenCalledWith('{"x":1}');
    expect(suivi).toHaveBeenCalledTimes(1);
  });

  it('le message de suivi s’ajoute aux avertissements', async () => {
    session = true;
    suivi.mockResolvedValueOnce('Import automatique : tournoi inscrit');
    const r = await importerExtrait('{}');
    expect(r.avertissements).toEqual(['a', 'Import automatique : tournoi inscrit']);
  });
});
