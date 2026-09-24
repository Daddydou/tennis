/**
 * Tests de COMPOSANT — simulateur « et si » du Fantasy. L'action serveur est
 * moquée (aucune simulation, aucune lecture en base) : on vérifie ce que
 * l'écran ENVOIE (seulement les réglages modifiés, en fraction, clé du duel)
 * et qu'il affiche l'écart renvoyé.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ResultatScenario } from '../actions';
import ScenarioFantasy, { type DuelReglable } from '../ScenarioFantasy';

type Simuler = (id: string, round: string, surcharges: [string, number][]) => Promise<ResultatScenario>;
const simulerMock = vi.fn<Simuler>();
vi.mock('../actions', () => ({
  simulerScenario: (...args: Parameters<Simuler>) => simulerMock(...args),
}));

const duels: DuelReglable[] = [
  { cle: 'a|b', nomPremier: 'Alpha', nomSecond: 'Beta', pBase: 0.64, vainqueurReel: 'second', equipe: true },
  { cle: 'c|d', nomPremier: 'Gamma', nomSecond: 'Delta', pBase: 0.5, vainqueurReel: null, equipe: false },
];

const reponse: ResultatScenario = {
  ok: true,
  simulations: 3000,
  membres: [
    {
      palier: 1,
      libellePalier: '1 à 10',
      nom: 'Alpha',
      base: { acquis: 10, espere: 20, total: 30 },
      scenario: { acquis: 10, espere: 12, total: 22 },
    },
  ],
};

beforeEach(() => simulerMock.mockResolvedValue(reponse));
afterEach(() => {
  cleanup();
  simulerMock.mockReset();
});

describe('ScenarioFantasy', () => {
  it('sans réglage : simule sans aucune surcharge', async () => {
    render(<ScenarioFantasy tournamentId="t1" round="QF" duels={duels} />);
    await userEvent.click(screen.getByRole('button', { name: /Simuler/ }));
    expect(simulerMock).toHaveBeenCalledWith('t1', 'QF', []);
  });

  it('n’envoie que les duels modifiés, en fraction', async () => {
    render(<ScenarioFantasy tournamentId="t1" round="QF" duels={duels} />);
    fireEvent.change(screen.getByLabelText('Probabilité que Gamma batte Delta'), { target: { value: '80' } });
    await userEvent.click(screen.getByRole('button', { name: /Simuler \(1 réglage\)/ }));
    expect(simulerMock).toHaveBeenCalledWith('t1', 'QF', [['c|d', 0.8]]);
  });

  it('« Fixer les résultats réels » impose 0/100 aux seuls matchs décidés', async () => {
    render(<ScenarioFantasy tournamentId="t1" round="QF" duels={duels} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fixer les résultats réels' }));
    expect(screen.getByText('0 % – 100 %')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Simuler/ }));
    expect(simulerMock).toHaveBeenCalledWith('t1', 'QF', [['a|b', 0]]);
  });

  it('affiche le score projeté modèle → scénario et l’écart', async () => {
    render(<ScenarioFantasy tournamentId="t1" round="QF" duels={duels} />);
    await userEvent.click(screen.getByRole('button', { name: /Simuler/ }));
    expect(await screen.findByText('(-8.0)')).toBeInTheDocument();
    // Un seul joueur : total de l'équipe et ligne du joueur portent les mêmes valeurs.
    expect(screen.getAllByText('30.0')).toHaveLength(2);
    expect(screen.getAllByText('22.0')).toHaveLength(2);
  });

  it('affiche l’erreur renvoyée par le serveur', async () => {
    simulerMock.mockResolvedValue({ ok: false, error: 'Non authentifié.' });
    render(<ScenarioFantasy tournamentId="t1" round="QF" duels={duels} />);
    await userEvent.click(screen.getByRole('button', { name: /Simuler/ }));
    expect(await screen.findByText('Non authentifié.')).toBeInTheDocument();
  });
});
