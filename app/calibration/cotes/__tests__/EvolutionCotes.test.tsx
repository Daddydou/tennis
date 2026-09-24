/**
 * Tests de COMPOSANT — graphique d'évolution des cotes (EvolutionCotes).
 * Séries fictives, aucune lecture en base : on vérifie le tracé (une courbe
 * seulement à partir de deux captures, un point par capture) et les textes
 * de variation, pas le calcul des séries (cf. scripts/test-cotes-evolution.mts).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import EvolutionCotes from '../EvolutionCotes';
import type { SerieCote } from '@/lib/cotesEvolution';

afterEach(cleanup);

const serie = (eventId: string, probas: number[]): SerieCote => ({
  eventId,
  nomA: `A-${eventId}`,
  nomB: `B-${eventId}`,
  commenceTime: '2026-09-10T18:00:00Z',
  points: probas.map((p, i) => ({ captureLe: `2026-09-0${i + 1}T09:00:00Z`, probaA: p })),
  variation: probas[probas.length - 1] - probas[0],
});

describe('EvolutionCotes', () => {
  it('sans série : explique que les captures s’accumulent à chaque rafraîchissement', () => {
    render(<EvolutionCotes series={[]} />);
    expect(screen.getByText(/Aucune capture historisée/)).toBeInTheDocument();
  });

  it('trace une courbe par match à plusieurs captures, un simple point sinon', () => {
    const { container } = render(
      <EvolutionCotes series={[serie('e1', [0.62, 0.66, 0.7]), serie('e2', [0.55])]} />,
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(2);
    expect(svgs[0].querySelectorAll('circle')).toHaveLength(3);
    expect(svgs[0].querySelector('polyline')).not.toBeNull();
    expect(svgs[1].querySelectorAll('circle')).toHaveLength(1);
    expect(svgs[1].querySelector('polyline')).toBeNull();
  });

  it('affiche ouverture → dernière cote et la variation en points', () => {
    render(<EvolutionCotes series={[serie('e1', [0.62, 0.7]), serie('e2', [0.55])]} />);
    expect(screen.getByText(/62 % → 70 %/)).toBeInTheDocument();
    expect(screen.getByText(/\(\+8 pts\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 capture/)).toBeInTheDocument();
    expect(screen.getByText(/1 rencontre\(s\) sur 2/)).toBeInTheDocument();
  });

  it('une courbe plus haute = une probabilité plus forte (axe y inversé du SVG)', () => {
    const { container } = render(<EvolutionCotes series={[serie('e1', [0.2, 0.8])]} />);
    const [bas, haut] = [...container.querySelectorAll('circle')].map((c) => Number(c.getAttribute('cy')));
    expect(haut).toBeLessThan(bas);
  });
});
