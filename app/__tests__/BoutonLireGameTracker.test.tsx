/**
 * Bouton « Lire Game Tracker » de l'accueil : un clic = une lecture globale
 * (app/BoutonLireGameTracker.tsx), jamais d'envoi, rien au chargement.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const lireTous = vi.fn();
const rafraichir = vi.fn();
vi.mock('../lireGameTrackerGlobal', () => ({ lireTousGameTracker: (...a: unknown[]) => lireTous(...a) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: rafraichir }) }));

import BoutonLireGameTracker from '../BoutonLireGameTracker';

afterEach(() => {
  cleanup();
  lireTous.mockReset();
  rafraichir.mockReset();
});

describe('BoutonLireGameTracker', () => {
  it('ne lit rien tant qu\'on n\'appuie pas', () => {
    render(<BoutonLireGameTracker />);
    expect(lireTous).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Lire Game Tracker' })).toBeTruthy();
  });

  it('lit au clic et affiche une ligne par tournoi', async () => {
    lireTous.mockResolvedValue({
      ok: true,
      lignes: [
        { tournoiId: 'a', nom: 'Paris 2026', statut: 'lu', detail: '2 picks alignés sur Game Tracker', attention: false },
        { tournoiId: 'b', nom: 'Lyon 2026', statut: 'non-relie', detail: 'Pas encore relié à Game Tracker : à faire depuis l’écran Picks du tournoi.', attention: false },
      ],
    });
    render(<BoutonLireGameTracker />);
    fireEvent.click(screen.getByRole('button', { name: 'Lire Game Tracker' }));
    await waitFor(() => expect(screen.getByText('1 tournoi lu sur 2')).toBeTruthy());
    expect(lireTous).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Paris 2026')).toBeTruthy();
    expect(screen.getByText(/Pas encore relié/)).toBeTruthy();
    expect(rafraichir).toHaveBeenCalled();
  });

  it('affiche l\'erreur sans rafraîchir', async () => {
    lireTous.mockResolvedValue({ ok: false, erreur: 'Non authentifié.' });
    render(<BoutonLireGameTracker />);
    fireEvent.click(screen.getByRole('button', { name: 'Lire Game Tracker' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Non authentifié.'));
    expect(rafraichir).not.toHaveBeenCalled();
  });
});
