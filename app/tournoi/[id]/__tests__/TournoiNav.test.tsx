/**
 * Tests des onglets d'un tournoi : 5 onglets, Résultats = vue de Tableau,
 * Prédictions = vue de Bracket (app/tournoi/[id]/TournoiNav.tsx + onglets.ts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import TournoiNav from '../TournoiNav';
import { ongletDe } from '../onglets';

let chemin = '/tournoi/t1';
vi.mock('next/navigation', () => ({ usePathname: () => chemin }));

afterEach(() => cleanup());

function sur(pathname: string, masters = false) {
  chemin = pathname;
  render(<TournoiNav id="t1" nom="Paris 2026" masters={masters} />);
}

const onglets = () => screen.getByRole('navigation', { name: 'Onglets du tournoi' });

describe('ongletDe (quel écran appartient à quel onglet)', () => {
  it.each([
    ['', 'dashboard'],
    ['tableau', 'tableau'],
    ['resultats', 'tableau'],
    ['picks', 'picks'],
    ['simulateur', 'bracket'],
    ['predictions', 'bracket'],
    ['fantasy', 'fantasy'],
    ['inconnu', 'dashboard'],
  ])('%s -> %s', (segment, attendu) => {
    expect(ongletDe(segment)).toBe(attendu);
  });
});

describe('TournoiNav', () => {
  it('affiche 5 onglets, dans cet ordre', () => {
    sur('/tournoi/t1');
    expect(within(onglets()).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Dashboard',
      'Tableau',
      'Picks',
      'Bracket',
      'Fantasy',
    ]);
  });

  it('garde les URLs existantes (Bracket = /simulateur)', () => {
    sur('/tournoi/t1');
    const href = (nom: string) => within(onglets()).getByRole('link', { name: nom }).getAttribute('href');
    expect(href('Dashboard')).toBe('/tournoi/t1');
    expect(href('Tableau')).toBe('/tournoi/t1/tableau');
    expect(href('Picks')).toBe('/tournoi/t1/picks');
    expect(href('Bracket')).toBe('/tournoi/t1/simulateur');
    expect(href('Fantasy')).toBe('/tournoi/t1/fantasy');
  });

  it('Résultats : onglet Tableau actif, vue Résultats active', () => {
    sur('/tournoi/t1/resultats');
    expect(within(onglets()).getByRole('link', { name: 'Tableau' }).getAttribute('aria-current')).toBe('page');
    const vues = screen.getByRole('navigation', { name: 'Vues' });
    expect(within(vues).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Tableau', '/tournoi/t1/tableau'],
      ['Résultats', '/tournoi/t1/resultats'],
    ]);
    expect(within(vues).getByRole('link', { name: 'Résultats' }).getAttribute('aria-current')).toBe('page');
    expect(within(vues).getByRole('link', { name: 'Tableau' }).getAttribute('aria-current')).toBeNull();
  });

  it('Prédictions : onglet Bracket actif, vue Prédictions active', () => {
    sur('/tournoi/t1/predictions');
    expect(within(onglets()).getByRole('link', { name: 'Bracket' }).getAttribute('aria-current')).toBe('page');
    const vues = screen.getByRole('navigation', { name: 'Vues' });
    expect(within(vues).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Le jeu', '/tournoi/t1/simulateur'],
      ['Prédictions', '/tournoi/t1/predictions'],
    ]);
    expect(within(vues).getByRole('link', { name: 'Prédictions' }).getAttribute('aria-current')).toBe('page');
  });

  it('pas de barre de vues pour Picks, Fantasy et le Dashboard', () => {
    for (const p of ['/tournoi/t1', '/tournoi/t1/picks', '/tournoi/t1/fantasy', '/tournoi/t1/fantasy/scenario']) {
      sur(p);
      expect(screen.queryByRole('navigation', { name: 'Vues' }), p).toBeNull();
      cleanup();
    }
  });

  it("un Masters n'a que l'onglet Dashboard, sans barre de vues", () => {
    sur('/tournoi/t1', true);
    expect(within(onglets()).getAllByRole('link').map((l) => l.textContent)).toEqual(['Dashboard']);
    expect(screen.queryByRole('navigation', { name: 'Vues' })).toBeNull();
  });
});
