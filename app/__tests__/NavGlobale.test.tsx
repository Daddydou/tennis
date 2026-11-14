/**
 * Tests de la navigation globale à 3 entrées (app/NavGlobale.tsx + app/navigation.ts).
 * usePathname est simulé : on choisit la page « en cours » à chaque test.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import NavGlobale from '../NavGlobale';
import { groupeActif, GROUPES } from '../navigation';

let chemin = '/';
vi.mock('next/navigation', () => ({ usePathname: () => chemin }));

afterEach(() => cleanup());

function sur(pathname: string, deconnexion?: React.ReactNode) {
  chemin = pathname;
  render(<NavGlobale deconnexion={deconnexion} />);
}

describe('groupeActif (quelle page appartient à quel groupe)', () => {
  const cas: [string, string | null][] = [
    ['/', 'accueil'],
    ['/tournois', 'tournois'],
    ['/tournoi/abc', 'tournois'],
    ['/tournoi/abc/picks', 'tournois'],
    ['/tournoi/abc/fantasy', 'tournois'], // le Fantasy d'un tournoi reste dans Tournois
    // Les pages de l'ancien onglet Saison existent toujours (même URL) mais n'ont plus d'entrée de menu.
    ['/bilan', null],
    ['/statistiques', null],
    ['/fantasy', null],
    ['/face-a-face', null],
    ['/import', 'outils'],
    ['/import/thomas', 'outils'],
    ['/calibration', 'outils'],
    ['/participants', 'outils'],
    ['/procedures', 'outils'],
    ['/login', null],
  ];
  it.each(cas)('%s -> %s', (chemin, attendu) => {
    expect(groupeActif(chemin)?.cle ?? null).toBe(attendu);
  });

  it('chaque page est dans un seul groupe', () => {
    for (const [p] of cas) {
      expect(GROUPES.filter((g) => g.actifSi(p)).length).toBeLessThanOrEqual(1);
    }
  });
});

describe('NavGlobale', () => {
  it('affiche exactement 3 entrées principales (plus d\'onglet Saison)', () => {
    sur('/');
    const principale = screen.getByRole('navigation', { name: 'Navigation principale' });
    const liens = within(principale).getAllByRole('link');
    expect(liens.map((l) => l.textContent)).toEqual(['Accueil', 'Tournois', 'Outils']);
  });

  it("marque l'entrée en cours avec aria-current", () => {
    sur('/tournoi/abc/picks');
    const principale = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(principale).getByRole('link', { name: 'Tournois' }).getAttribute('aria-current')).toBe('page');
    expect(within(principale).getByRole('link', { name: 'Accueil' }).getAttribute('aria-current')).toBeNull();
  });

  it("pas de sous-barre sur l'accueil ni dans Tournois", () => {
    sur('/');
    expect(screen.queryByRole('navigation', { name: 'Saison' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Outils' })).toBeNull();
    cleanup();
    sur('/tournoi/abc');
    expect(screen.queryByRole('navigation', { name: 'Saison' })).toBeNull();
  });

  it('sur une ancienne page Saison (/statistiques), aucune sous-barre ni entrée marquée en cours', () => {
    sur('/statistiques');
    expect(screen.queryByRole('navigation', { name: 'Saison' })).toBeNull();
    const principale = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(principale).queryByRole('link', { name: 'Saison' })).toBeNull();
    for (const l of within(principale).getAllByRole('link')) expect(l.getAttribute('aria-current')).toBeNull();
  });

  it('Outils : sous-barre avec Importer, Participants, Calibration, Procédures et les URLs inchangées', () => {
    sur('/import/thomas');
    const sous = screen.getByRole('navigation', { name: 'Outils' });
    const liens = within(sous).getAllByRole('link');
    expect(liens.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Importer', '/import'],
      ['Participants', '/participants'],
      ['Calibration', '/calibration'],
      ['Procédures', '/procedures'],
    ]);
    expect(within(sous).getByRole('link', { name: 'Importer' }).getAttribute('aria-current')).toBe('page');
  });

  it('la Déconnexion apparaît dans la sous-barre Outils seulement, et seulement si on la fournit', () => {
    sur('/procedures', <button type="submit">Déconnexion</button>);
    const sous = screen.getByRole('navigation', { name: 'Outils' });
    // Le bouton est à côté de la zone qui défile (toujours visible), dans le même bandeau.
    expect(within(sous).queryByRole('button', { name: 'Déconnexion' })).toBeNull();
    expect(within(sous.parentElement as HTMLElement).getByRole('button', { name: 'Déconnexion' })).toBeTruthy();
    cleanup();

    sur('/procedures');
    expect(screen.queryByRole('button', { name: 'Déconnexion' })).toBeNull();
    cleanup();

    sur('/bilan', <button type="submit">Déconnexion</button>);
    expect(screen.queryByRole('button', { name: 'Déconnexion' })).toBeNull();
  });
});
