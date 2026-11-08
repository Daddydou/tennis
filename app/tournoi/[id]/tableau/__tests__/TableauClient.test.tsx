/**
 * Tests de l'écran Tableau compilé : pastilles des participants sur le joueur
 * pronostiqué, rappel rouge quand son vainqueur n'est plus dans le match,
 * « n/3 juste », choix du tour et tours précédents repliés, tie-break en
 * exposant (app/tournoi/[id]/tableau/TableauClient.tsx).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { TableauClient } from '../TableauClient';
import { construireTableau, type MatchEntree, type PickEntree } from '@/lib/tableauVue';

afterEach(() => cleanup());

const NOMS: Record<string, string> = { a: 'Alcaraz', b: 'Bublik', c: 'Cobolli', d: 'Draper', z: 'Zverev' };
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
  // Laki avait Zverev en finale : il n'y est pas.
  { participant_id: 'p-laki', round: 'F', position: 0, player_id: 'z' },
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
  it('ouvre sur le tour en cours (premier tour avec un match à jouer) et replie les précédents', () => {
    rendu();
    expect(screen.getByRole('tab', { name: 'Finale' }).getAttribute('aria-selected')).toBe('true');
    const precedents = screen.getByRole('region', { name: 'Tours précédents' });
    expect(within(precedents).getByText(/Demi-finales/)).toBeTruthy();
    expect(precedents.querySelector('details')?.hasAttribute('open')).toBe(false);
  });

  it('pose une pastille par participant sur le joueur qu’il a pronostiqué', () => {
    rendu();
    fireEvent.click(screen.getByRole('tab', { name: /Demi-finales/ }));
    const cartes = within(telephone()).getAllByTestId('carte-match');
    // Match 0 : Alcaraz (ligne 1) choisi par Moi, Bublik (ligne 2) choisi par Laki.
    expect(within(cartes[0]).getByTestId('pastilles-1').textContent).toContain('Moi a pronostiqué Alcaraz (juste)');
    expect(within(cartes[0]).getByTestId('pastilles-2').textContent).toContain('Laki a pronostiqué Bublik (raté)');
    // Match 1 : Moi avait Cobolli, battu.
    expect(within(cartes[1]).getByTestId('pastilles-1').textContent).toContain('Moi a pronostiqué Cobolli (raté)');
  });

  it('affiche « n/N juste » sur un match décidé, rien sur un match à jouer', () => {
    rendu();
    fireEvent.click(screen.getByRole('tab', { name: /Demi-finales/ }));
    const bilans = within(telephone()).getAllByTestId('bilan-match').map((e) => e.textContent);
    expect(bilans).toEqual(['1/2 juste', '0/2 juste']);
    fireEvent.click(screen.getByRole('tab', { name: 'Finale' }));
    expect(within(telephone()).queryByTestId('bilan-match')).toBeNull();
  });

  it('rappelle en rouge, sous le match, le vainqueur du bracket qui n’y est plus', () => {
    rendu();
    const liste = within(telephone()).getByRole('list', { name: 'Pronostics hors match' });
    expect(liste.textContent).toContain('Zverev');
    expect(liste.className).toContain('text-red-700');
    // Moi n'a rien posé en finale : pas de rappel pour lui.
    expect(within(liste).getAllByRole('listitem')).toHaveLength(1);
  });

  it('un même joueur absent choisi par plusieurs participants : une seule ligne, les pastilles à côté', () => {
    const tours = construireTableau({
      rounds: ['SF', 'F'],
      matchs,
      picks: [
        ...picks,
        { participant_id: null, round: 'F', position: 0, player_id: 'z' },
      ],
      stocks,
      nomJoueur: (id) => NOMS[id] ?? id,
    });
    render(<TableauClient tours={tours} stocks={stocks} />);
    const liste = within(telephone()).getByRole('list', { name: 'Pronostics hors match' });
    const lignes = within(liste).getAllByRole('listitem');
    expect(lignes).toHaveLength(1);
    expect(lignes[0].textContent).toContain('Zverev');
    // Deux pastilles (Moi et Laki) sur cette seule ligne.
    expect(lignes[0].querySelectorAll('[title*="Zverev"]')).toHaveLength(2);
  });

  it('réserve la même largeur de pastilles sur les deux lignes (scores alignés)', () => {
    rendu();
    fireEvent.click(screen.getByRole('tab', { name: /Demi-finales/ }));
    const carte0 = within(telephone()).getAllByTestId('carte-match')[0];
    const l1 = within(carte0).getByTestId('pastilles-1') as HTMLElement;
    const l2 = within(carte0).getByTestId('pastilles-2') as HTMLElement;
    expect(l1.style.width).toBe(l2.style.width);
    expect(l1.style.width).not.toBe('');
  });

  it('affiche le bilan justes/décidés de chacun en tête', () => {
    rendu();
    // Le bilan figure en tête ET dans le résumé du tour replié : on vérifie la tête (premier).
    expect(screen.getAllByText('Moi 1/2')[0]).toBeTruthy();
    expect(screen.getAllByText('Laki 0/1')[0]).toBeTruthy();
  });

  it('affiche le tie-break du perdant en exposant, sur son score', () => {
    rendu();
    fireEvent.click(screen.getByRole('tab', { name: /Demi-finales/ }));
    const exposants = Array.from(telephone().querySelectorAll('sup')).map((e) => e.textContent);
    expect(exposants).toEqual(['3']);
  });

  it('change de tour : les tours d’avant se replient, ceux d’après disparaissent de la liste mobile', () => {
    rendu();
    fireEvent.click(screen.getByRole('tab', { name: /Demi-finales/ }));
    expect(screen.queryByRole('region', { name: 'Tours précédents' })).toBeNull();
    expect(within(telephone()).getAllByTestId('carte-match')).toHaveLength(2);
    fireEvent.click(screen.getByRole('tab', { name: 'Finale' }));
    expect(within(telephone()).getAllByTestId('carte-match')).toHaveLength(1);
    expect(within(telephone()).getByText('À jouer')).toBeTruthy();
  });
});
