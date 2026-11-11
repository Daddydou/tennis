import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChipStatutPick, EtiquetteResultat, PastillePick } from '../pastillesPicks';

describe('PastillePick', () => {
  it('juste : ✓ et le mot « juste » pour les lecteurs d’écran', () => {
    render(<PastillePick p={{ participant: 'Moi', resultat: 'juste' }} />);
    expect(screen.getByText(/Moi/).textContent).toContain('✓');
    expect(screen.getByText(/pick juste/)).toBeTruthy();
  });

  it('raté : ✗ ; en attente : ni ✓ ni ✗', () => {
    const { container, rerender } = render(<PastillePick p={{ participant: 'Laki', resultat: 'rate' }} />);
    expect(container.textContent).toContain('✗');
    rerender(<PastillePick p={{ participant: 'Laki', resultat: 'attente' }} />);
    expect(container.textContent).not.toContain('✗');
    expect(container.textContent).not.toContain('✓');
    expect(screen.getByText(/en attente/)).toBeTruthy();
  });
});

describe('ChipStatutPick', () => {
  it('donne le mot du statut, ou un libellé précis', () => {
    const { rerender } = render(<ChipStatutPick statut="verrouille" />);
    expect(screen.getByText('Verrouillé')).toBeTruthy();
    rerender(<ChipStatutPick statut="reserve" libelle="2 picks réservés" />);
    expect(screen.getByText('2 picks réservés')).toBeTruthy();
  });
});

describe('EtiquetteResultat', () => {
  it('gagné et perdu portent un mot et un signe ; à jouer reste sobre', () => {
    const { container, rerender } = render(<EtiquetteResultat r="gagne" />);
    expect(container.textContent).toBe('✓Gagné');
    rerender(<EtiquetteResultat r="perdu" />);
    expect(container.textContent).toBe('✗Perdu');
    rerender(<EtiquetteResultat r="a_jouer" />);
    expect(container.textContent).toBe('À jouer');
  });
});
