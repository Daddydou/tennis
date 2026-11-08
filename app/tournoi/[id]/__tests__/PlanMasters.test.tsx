/**
 * Plan de picks d'un Masters : quatre stratégies, bascule de l'une à l'autre, bilan du plan choisi,
 * stratégie « contre les rivaux » masquée sans rival (app/tournoi/[id]/PlanMasters.tsx).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PickConseille } from '@/lib/mastersConseils';
import type { PlanMasters as Plan, StrategiesMasters } from '@/lib/mastersStrategies';
import PlanMasters from '../PlanMasters';

// Le panneau Game Tracker appelle des Server Actions : hors sujet ici, on vérifie seulement ce qu'il reçoit.
vi.mock('../PanneauGTMasters', () => ({
  default: ({ picks }: { picks: PickConseille[] }) => <div data-testid="gt-mock">{picks.find((p) => p.round === 'J1' && p.half === 'top')?.playerId}</div>,
}));

afterEach(() => cleanup());

const NOMS: Record<string, string> = { a1: 'Noskova', a2: 'Pegula', a3: 'Gauff', a4: 'Muchova', b1: 'Svitolina', b2: 'Sabalenka', b3: 'Rybakina', b4: 'Swiatek' };

function pick(round: PickConseille['round'], half: 'top' | 'bottom' | null, playerId: string, ep = 9): PickConseille {
  return { round, half, playerId, ep, fixe: false, alternatives: [] };
}

function plan(strategie: Plan['strategie'], j1A: string, moyenne: number, devant: number | null = null): Plan {
  return {
    strategie,
    picks: [pick('J1', 'top', j1A), pick('J1', 'bottom', 'b1'), pick('J2', 'top', 'a2'), pick('J2', 'bottom', 'b2'), pick('J3', 'top', 'a3'), pick('J3', 'bottom', 'b3'), pick('SF', null, 'a1'), pick('F', null, 'b4')],
    stats: { moyenne, mauvais: moyenne - 12, bon: moyenne + 12, devant },
  };
}

const STRATEGIES: StrategiesMasters = {
  prudent: plan('prudent', 'a1', 60.1, 0.31),
  equilibre: plan('equilibre', 'a1', 61.2, 0.34),
  audacieux: plan('audacieux', 'a4', 59.4, 0.38),
  rivaux: plan('rivaux', 'a2', 58.0, 0.45),
  rivauxNoms: ['Laki', 'Thomas'],
};

const rendre = (strategies: StrategiesMasters = STRATEGIES, afficherGT = true) =>
  render(<PlanMasters tournamentId="t1" strategies={strategies} noms={NOMS} avancement={{ joues: 4, total: 15 }} afficherGT={afficherGT} />);

describe('PlanMasters', () => {
  it('propose les quatre stratégies, Équilibré choisi au départ, et dit sur quoi le plan est calculé', () => {
    rendre();
    expect(screen.getAllByRole('radio').map((r) => r.textContent?.split('pts')[0].replace(/[\d,\s]+$/, '').trim())).toEqual(['Prudent', 'Équilibré', 'Audacieux', 'Contre Laki et Thomas']);
    expect(screen.getByRole('radio', { name: /Équilibré/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('avancement-masters')).toHaveTextContent('4 matchs joués sur 15');
  });

  it('changer de stratégie change les picks affichés et ceux que reçoit le panneau Game Tracker', () => {
    rendre();
    expect(screen.getByTestId('grille-picks')).toHaveTextContent('Noskova');
    expect(screen.getByTestId('gt-mock')).toHaveTextContent('a1');
    fireEvent.click(screen.getByRole('radio', { name: /Audacieux/ }));
    expect(screen.getByRole('radio', { name: /Audacieux/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('grille-picks')).toHaveTextContent('Muchova');
    expect(screen.getByTestId('gt-mock')).toHaveTextContent('a4');
  });

  it('le bilan suit la stratégie choisie, avec la chance de finir devant les rivaux', () => {
    rendre();
    expect(screen.getByTestId('bilan-plan-masters')).toHaveTextContent('61,2 pts en moyenne');
    expect(screen.getByTestId('bilan-plan-masters')).toHaveTextContent('34 % de chances de finir devant Laki et Thomas');
    fireEvent.click(screen.getByRole('radio', { name: /Contre Laki et Thomas/ }));
    expect(screen.getByTestId('bilan-plan-masters')).toHaveTextContent('58,0 pts en moyenne');
    expect(screen.getByTestId('bilan-plan-masters')).toHaveTextContent('45 % de chances de finir devant');
  });

  it('dit quand Prudent ou Audacieux a exactement les mêmes picks qu\'Équilibré', () => {
    rendre();
    fireEvent.click(screen.getByRole('radio', { name: /Prudent/ }));
    expect(screen.getByText(/Mêmes picks qu’Équilibré/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Audacieux/ }));
    expect(screen.queryByText(/Mêmes picks qu’Équilibré/)).toBeNull();
  });

  it('sans rival : pas de stratégie « contre » ni de chance de finir devant', () => {
    // Sans rival, la bibliothèque ne calcule aucune chance de finir devant (devant = null).
    const sansDevant = (p: Plan): Plan => ({ ...p, stats: { ...p.stats, devant: null } });
    rendre({ prudent: sansDevant(STRATEGIES.prudent), equilibre: sansDevant(STRATEGIES.equilibre), audacieux: sansDevant(STRATEGIES.audacieux), rivaux: null, rivauxNoms: [] });
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByTestId('bilan-plan-masters')).not.toHaveTextContent('finir devant');
  });

  it('tournoi terminé : pas de panneau Game Tracker', () => {
    rendre(STRATEGIES, false);
    expect(screen.queryByTestId('gt-mock')).toBeNull();
  });
});
