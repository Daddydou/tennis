/**
 * Tests de l'écran Tableau : sélecteur de participant, verdict des pronostics,
 * tie-break en exposant (app/tournoi/[id]/tableau/TableauClient.tsx).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { TableauClient } from '../TableauClient';
import { construireTableau, type MatchEntree, type PickEntree } from '@/lib/tableauVue';

afterEach(() => cleanup());

const NOMS: Record<string, string> = { a: 'Alcaraz', b: 'Bublik', c: 'Cobolli', d: 'Draper' };
const stocks = [
  { id: null, nom: 'Moi' },
  { id: 'p-laki', nom: 'Laki' },
];

const matchs: MatchEntree[] = [
  {
    id: 'm0', round: 'SF', position: 0, player1_id: 'a', player2_id: 'b', winner_id: 'a', status: 'completed',
    sets: [{ g1: 7, g2: 6, tb2: 3 }, { g1: 6, g2: 4 }],
  },
  { id: 'm1', round: 'SF', position: 1, player1_id: 'c', player2_id: 'd', winner_id: 'd', status: 'completed', sets: null },
  { id: 'm2', round: 'F', position: 0, player1_id: 'a', player2_id: 'd', winner_id: null, status: 'scheduled', sets: null },
];
const picks: PickEntree[] = [
  { participant_id: null, round: 'SF', position: 0, player_id: 'a' },
  { participant_id: null, round: 'SF', position: 1, player_id: 'c' },
  { participant_id: 'p-laki', round: 'SF', position: 0, player_id: 'b' },
];

function rendu() {
  const tours = construireTableau({
    rounds: ['SF', 'F'],
    matchs,
    picks,
    stocks,
    nomJoueur: (id) => NOMS[id] ?? id,
  });
  render(<TableauClient tours={tours} stocks={stocks} />);
}

// L'écran rend une version téléphone ET une version ordinateur (masquée en CSS) :
// on lit celle du téléphone, qui contient les mêmes cartes.
const telephone = () => document.querySelector('.md\\:hidden') as HTMLElement;

describe('TableauClient', () => {
  it('montre Moi par défaut, avec le verdict de chaque pronostic', () => {
    rendu();
    const t = within(telephone());
    expect(t.getByText(/✓ Ton choix : Alcaraz/)).toBeTruthy();
    expect(t.getByText(/✗ Ton choix : Cobolli/)).toBeTruthy();
    expect(t.getByText('Vainqueur : Draper')).toBeTruthy();
  });

  it('affiche le bilan justes/décidés sur la pastille du participant', () => {
    rendu();
    const pastilleMoi = screen.getByRole('button', { name: /Moi/ });
    expect(pastilleMoi.textContent).toContain('1/2');
    expect(pastilleMoi.getAttribute('aria-pressed')).toBe('true');
  });

  it('change de participant au clic', () => {
    rendu();
    fireEvent.click(screen.getByRole('button', { name: /Laki/ }));
    const t = within(telephone());
    expect(t.getByText(/✗ Choix de Laki : Bublik/)).toBeTruthy();
    expect(t.getByText('Pas de pronostic posé')).toBeTruthy();
  });

  it('affiche le tie-break du perdant en exposant, sur son score', () => {
    rendu();
    const exposants = Array.from(telephone().querySelectorAll('sup')).map((e) => e.textContent);
    expect(exposants).toEqual(['3']);
  });

  it('change de tour sur téléphone et signale « Pas de pronostic posé » quand rien n\'est posé', () => {
    rendu();
    fireEvent.click(screen.getByRole('tab', { name: /Finale/ }));
    const t = within(telephone());
    expect(t.getByText('Pas de pronostic posé')).toBeTruthy();
    expect(t.getByText('À jouer')).toBeTruthy();
  });
});
