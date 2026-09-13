/**
 * Tests de COMPOSANT (Vitest + React Testing Library, jsdom) — vérifie que
 * l'écran /import affiche bien les avertissements renvoyés par la Server
 * Action `importerExtrait` (moquée ici, pas d'écriture DB), qu'il s'agisse
 * d'un import réussi ou en échec. Couvre en particulier les avertissements
 * de réconciliation d'identité (`lib/parser.ts` `reconcilierIdsJoueurs`,
 * appelée par `app/import/actions.ts`) : un joueur rapproché d'un ID déjà en
 * base, ou un nom ambigu volontairement non fusionné (cf. scripts/
 * test-reconciliation-joueurs.mts pour le contenu de ces messages, testé
 * côté fonction pure — ce fichier-ci teste seulement qu'ils atteignent
 * l'écran, pas leur contenu).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ImportResult } from '../actions';

type ImporterExtrait = (jsonText: string) => Promise<ImportResult>;
const importerExtraitMock = vi.fn<ImporterExtrait>(async () => ({ ok: true, avertissements: [] }));
vi.mock('../actions', () => ({
  importerExtrait: (...args: Parameters<ImporterExtrait>) => importerExtraitMock(...args),
}));

// ImportForm appelle router.refresh() sur un import réussi (pour relire la
// liste des tournois du menu import/elo) — hors app router monté par Next,
// jsdom seul n'a pas de contexte à fournir à useRouter().
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

// Importé APRÈS le mock (le module doit être intercepté avant son import).
const { default: ImportForm } = await import('../ImportForm');

beforeEach(() => {
  importerExtraitMock.mockClear();
});
afterEach(() => {
  cleanup();
});

async function soumettre() {
  const user = userEvent.setup();
  render(<ImportForm />);
  await user.click(screen.getByPlaceholderText(/tournament/));
  // `user.paste`, pas `.type` : le JSON est plein de `{`/`}`.
  await user.paste('{"tournament":{},"matches":[]}');
  await user.click(screen.getByRole('button', { name: 'Importer' }));
}

describe('ImportForm', () => {
  it('un import réussi affiche les avertissements de réconciliation', async () => {
    importerExtraitMock.mockResolvedValueOnce({
      ok: true,
      avertissements: [
        '« E. Kalieva » rapproché(e) du joueur déjà en base 327834 (nouvel ID d\'extraction 380396 ignoré, pas écrit).',
        '« X. Wang » : nom ambigu (X. Wang, X. Wang en base) — ID 999999 de l\'extraction conservé tel quel, PAS fusionné automatiquement.',
      ],
      tournamentId: 't1',
      resume: { tournoi: 'US Open 2026', joueurs: 128, matchs: 127, rounds: ['R128', 'R64'] },
    });

    await soumettre();

    expect(screen.getByText(/Import réussi/)).toBeInTheDocument();
    expect(screen.getByText('Avertissements :')).toBeInTheDocument();
    expect(screen.getByText(/rapproché\(e\) du joueur déjà en base 327834/)).toBeInTheDocument();
    expect(screen.getByText(/nom ambigu.*PAS fusionné automatiquement/)).toBeInTheDocument();
  });

  it('un import réussi SANS avertissement ne montre pas le bloc « Avertissements »', async () => {
    importerExtraitMock.mockResolvedValueOnce({
      ok: true,
      avertissements: [],
      tournamentId: 't1',
      resume: { tournoi: 'Miami 2026', joueurs: 128, matchs: 127, rounds: ['R128'] },
    });

    await soumettre();

    expect(screen.getByText(/Import réussi/)).toBeInTheDocument();
    expect(screen.queryByText('Avertissements :')).not.toBeInTheDocument();
  });

  it('un import en échec affiche aussi les avertissements accumulés avant l’erreur', async () => {
    importerExtraitMock.mockResolvedValueOnce({
      ok: false,
      error: 'Joueurs : duplicate key value violates unique constraint',
      avertissements: [
        '« E. Kalieva » rapproché(e) du joueur déjà en base 327834 (nouvel ID d\'extraction 380396 ignoré, pas écrit).',
      ],
    });

    await soumettre();

    expect(screen.getByText(/Échec de l'import/)).toBeInTheDocument();
    expect(screen.getByText(/duplicate key value/)).toBeInTheDocument();
    expect(screen.getByText(/rapproché\(e\) du joueur déjà en base 327834/)).toBeInTheDocument();
  });
});
