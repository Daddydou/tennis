import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DonneesPossibilites } from '@/db/bracketPossibilites';
import PossibilitesBracket from '../PossibilitesBracket';

/** Tableau de 8 : quarts visibles, demies et finale cachées. 2 et 3 sont éliminés. */
const donnees: DonneesPossibilites = {
  thomasId: 't1',
  thomasNom: 'Test',
  drawSize: 8,
  noms: new Map([1, 2, 3, 4, 5, 6, 7, 8].map((p) => [p, `P${p}`])),
  matchs: [
    { tour: 1, index: 0, position1: 1, position2: 2, vainqueur: 1 },
    { tour: 1, index: 1, position1: 3, position2: 4, vainqueur: 4 },
    { tour: 1, index: 2, position1: 5, position2: 6, vainqueur: null },
    { tour: 1, index: 3, position1: 7, position2: 8, vainqueur: null },
  ],
  participants: [
    { userId: 'd', pseudo: 'Daddy', points: 1 },
    { userId: 'l', pseudo: 'Laki', points: 0 },
  ],
  pronostics: [
    ...[1, 3, 5, 7].map((position, index) => ({ userId: 'd', tour: 1, index, position })),
    ...[2, 4, 6, 8].map((position, index) => ({ userId: 'l', tour: 1, index, position })),
  ],
};
const stocks = [
  { id: 's-laki', name: 'Laki' },
  { id: 's-thomas', name: 'Thomas' },
];
const rounds = ['QF', 'SF', 'F'];

// Pas de globals vitest : le nettoyage automatique de Testing Library n'est pas branché.
afterEach(cleanup);

describe('PossibilitesBracket', () => {
  it('affiche chaque participant, ses possibilités par tour et le champion possible', () => {
    render(<PossibilitesBracket donnees={donnees} max={{}} rounds={rounds} participants={stocks} />);
    expect(screen.getByText('Possibilités des participants (bracket de Thomas)')).toBeTruthy();
    // « Daddy » = moi dans l'app ; Laki garde son nom. Le libellé apparaît aussi dans le formulaire.
    expect(screen.getAllByText('Moi (Daddy)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Laki').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Champion possible/)).toHaveLength(2);
    expect(screen.getAllByText('SF').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/8 tableaux possibles/).length).toBe(2);
  });

  it('un joueur éliminé est signalé (barré, titre « Éliminé »), un joueur en vie non', () => {
    render(<PossibilitesBracket donnees={donnees} max={{}} rounds={rounds} participants={stocks} />);
    expect(screen.getAllByTitle('Éliminé').length).toBeGreaterThan(0);
    const p3 = screen.getAllByText('P3')[0];
    expect(p3.className).toContain('line-through');
    expect(screen.getAllByText('P1')[0].className).not.toContain('line-through');
  });

  it('avec un max : réduit les tableaux, annonce le certain et affiche les parts', () => {
    // Daddy : 1 pt + 2 visibles + 6 cachés = 9 -> demie 0 morte (P3 certain), finale = gagnant de la demie 1.
    render(<PossibilitesBracket donnees={donnees} max={{ Daddy: 9 }} rounds={rounds} participants={stocks} />);
    expect(screen.getByText(/2 tableaux sur 8 collent à ce max/)).toBeTruthy();
    expect(screen.getAllByText(/certain/).length).toBeGreaterThan(0);
    const champ = screen.getAllByText(/Champion possible/)[0].parentElement!;
    expect(champ.textContent).toMatch(/P5/);
    expect(champ.textContent).toMatch(/P7/);
    expect(champ.textContent).toMatch(/50 %/);
  });

  it('max impossible : message d\'incohérence, aucune case', () => {
    render(<PossibilitesBracket donnees={donnees} max={{ Daddy: 4 }} rounds={rounds} participants={stocks} />);
    expect(screen.getByText(/Aucun tableau ne colle à ce max/)).toBeTruthy();
    expect(screen.getAllByText(/Champion possible/)).toHaveLength(1); // seulement Laki
  });

  it('le champ « max » reprend la valeur saisie et le formulaire garde section et vue', () => {
    const { container } = render(
      <PossibilitesBracket donnees={donnees} max={{ Laki: 12 }} rounds={rounds} participants={stocks} section="bracket" vue="tableau" />,
    );
    const champLaki = container.querySelector('input[name="max_Laki"]') as HTMLInputElement;
    expect(champLaki.defaultValue).toBe('12');
    expect((container.querySelector('input[name="max_Daddy"]') as HTMLInputElement).defaultValue).toBe('');
    expect((container.querySelector('input[name="section"]') as HTMLInputElement).value).toBe('bracket');
    expect((container.querySelector('input[name="vue"]') as HTMLInputElement).value).toBe('tableau');
    expect(container.querySelector('form')!.getAttribute('method')).toBe('get');
  });

  it('tableau non puissance de 2 : le panneau n\'apparaît pas', () => {
    const { container } = render(<PossibilitesBracket donnees={{ ...donnees, drawSize: 6 }} max={{}} rounds={rounds} participants={stocks} />);
    expect(container.textContent).toBe('');
  });
});
