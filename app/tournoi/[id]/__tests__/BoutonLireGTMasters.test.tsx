/**
 * Bouton « Lire Game Tracker » du Dashboard d'un Masters : un clic = une lecture (lireGameTrackerMasters),
 * jamais d'envoi, rien au chargement ; montre ce qui est posé chez Game Tracker.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const lire = vi.fn();
const rafraichir = vi.fn();
vi.mock('../mastersGTActions', () => ({ lireGameTrackerMasters: (...a: unknown[]) => lire(...a) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: rafraichir }) }));

import BoutonLireGTMasters from '../BoutonLireGTMasters';

afterEach(() => {
  cleanup();
  lire.mockReset();
  rafraichir.mockReset();
});

const lectureOk = (over: Record<string, unknown> = {}) => ({
  ok: true,
  tours: [{ numero: 1, nom: 'Journée 1', round: 'J1', lockAt: '2026-11-08T20:00:00Z', picksAttendus: 2, haut: 'Iga Swiatek', bas: null }],
  classement: [],
  alignement: { inconnus: [], ecrits: 1, supprimes: 0 },
  remplacements: [],
  ...over,
});

describe('BoutonLireGTMasters', () => {
  it('ne lit rien tant qu\'on n\'appuie pas', () => {
    render(<BoutonLireGTMasters tournamentId="t1" />);
    expect(lire).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Lire Game Tracker' })).toBeTruthy();
  });

  it('lit au clic, montre mes picks posés (et ceux qui manquent) et rafraîchit', async () => {
    lire.mockResolvedValue(lectureOk());
    render(<BoutonLireGTMasters tournamentId="t1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Lire Game Tracker' }));
    await waitFor(() => expect(screen.getByText(/Iga Swiatek/)).toBeTruthy());
    expect(lire).toHaveBeenCalledWith('t1');
    expect(screen.getByText(/pas posé/)).toBeTruthy();
    expect(screen.getByText(/1 ajouté/)).toBeTruthy();
    expect(rafraichir).toHaveBeenCalled();
  });

  it('dit quand tout est déjà identique', async () => {
    lire.mockResolvedValue(lectureOk({ alignement: { inconnus: [], ecrits: 0, supprimes: 0 } }));
    render(<BoutonLireGTMasters tournamentId="t1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Lire Game Tracker' }));
    await waitFor(() => expect(screen.getByText(/déjà identiques/)).toBeTruthy());
  });

  it('affiche l\'erreur sans rafraîchir', async () => {
    lire.mockResolvedValue({ ok: false, erreur: 'Ce tournoi n\'est pas relié à Game Tracker.' });
    render(<BoutonLireGTMasters tournamentId="t1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Lire Game Tracker' }));
    await waitFor(() => expect(screen.getByText(/pas relié/)).toBeTruthy());
    expect(rafraichir).not.toHaveBeenCalled();
  });
});
