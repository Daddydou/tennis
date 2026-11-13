import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PronosticMasters, ReelMasters } from '@/lib/masters';
import { grilleComparaison, type FigeScenario } from '@/lib/mastersScenario';
import { vueMasters, type LigneMatchMasters } from '@/lib/mastersVue';
import ComparaisonPronostics from '../ComparaisonPronostics';

afterEach(cleanup);

const poules = { A: ['a1', 'a2', 'a3', 'a4'], B: ['b1', 'b2', 'b3', 'b4'] };
const noms = Object.fromEntries([...poules.A, ...poules.B].map((id) => [id, `Joueuse ${id.toUpperCase()}`]));
const prono: PronosticMasters = { classementA: ['a1', 'a2', 'a3', 'a4'], classementB: ['b1', 'b2', 'b3', 'b4'], vainqueursDemis: ['a1', 'b1'], champion: 'a1' };

// Poule A jouée (a1 > a2 > a3 > a4), poule B pas jouée.
const m = (round: string, position: number, half: 'top' | 'bottom', p1: string, p2: string, gagnant: string | null): LigneMatchMasters => ({
  round,
  position,
  half,
  player1Id: p1,
  player2Id: p2,
  winnerId: gagnant,
  status: gagnant ? 'completed' : 'scheduled',
  sets: gagnant ? [{ g1: gagnant === p1 ? 6 : 3, g2: gagnant === p1 ? 3 : 6 }] : [],
});
const vue = vueMasters([
  m('J1', 0, 'top', 'a1', 'a4', 'a1'),
  m('J1', 1, 'top', 'a2', 'a3', 'a2'),
  m('J2', 0, 'top', 'a1', 'a2', 'a1'),
  m('J2', 1, 'top', 'a3', 'a4', 'a3'),
  m('J3', 0, 'top', 'a1', 'a3', 'a1'),
  m('J3', 1, 'top', 'a2', 'a4', 'a2'),
  m('J1', 2, 'bottom', 'b1', 'b4', null),
  m('J1', 3, 'bottom', 'b2', 'b3', null),
]);
const reel: ReelMasters = { classementA: ['a1', 'a2', 'a3', 'a4'], classementB: null, finalistes: null, champion: null };
const fige: FigeScenario = { A: true, B: false, demis: [false, false], champion: false };

const parts = [
  { cle: 'moi', nom: 'Moi', pronostic: prono },
  { cle: 'laki', nom: 'Laki', pronostic: null },
];

function rendu() {
  return render(
    <ComparaisonPronostics
      poules={poules}
      noms={noms}
      participants={parts.map((p) => ({ ...p, picks: p.cle === 'moi' ? 10 : 30 }))}
      grille={grilleComparaison(vue, parts)}
      reel={reel}
      initial={prono}
      fige={fige}
    />,
  );
}

describe('ComparaisonPronostics', () => {
  it('une colonne par participant plus la colonne Simulé, onze lignes', () => {
    rendu();
    const t = screen.getByTestId('comparaison-pronostics');
    expect(within(t).getByText('Moi')).toBeTruthy();
    expect(within(t).getByText('Laki')).toBeTruthy();
    expect(within(t).getByText('Simulé')).toBeTruthy();
    expect(within(t).getByText('Poule A · 1er')).toBeTruthy();
    expect(within(t).getByText('Championne')).toBeTruthy();
  });

  it('les cases jouées prennent la couleur de leur verdict ; un participant sans pronostic a des tirets', () => {
    rendu();
    const t = screen.getByTestId('comparaison-pronostics');
    expect(t.querySelectorAll('[data-verdict="juste"]').length).toBe(4); // poule A entièrement juste
    expect(t.querySelectorAll('[data-verdict="attente"]').length).toBeGreaterThan(0);
    expect(within(t).getAllByText('—').length).toBeGreaterThanOrEqual(11);
  });

  it('une poule déjà jouée est figée dans le scénario', () => {
    rendu();
    expect((screen.getByLabelText('Scénario, poule A, place 1') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText('Scénario, poule B, place 1') as HTMLSelectElement).disabled).toBe(false);
  });

  it('au départ, le scénario donne le maximum au pronostic qui le décrit ; picks inclus dans le total', () => {
    rendu();
    expect(screen.getByTestId('points-simules-moi').textContent).toContain('64');
    expect(screen.getByTestId('total-simule-moi').textContent).toContain('74');
    expect(screen.getByTestId('total-simule-laki').textContent).toContain('30');
  });

  it('modifier la poule B recalcule les points tout de suite (échange de places, demie et finalistes remis d\'équerre)', () => {
    rendu();
    fireEvent.change(screen.getByLabelText('Scénario, poule B, place 1'), { target: { value: 'b2' } });
    // b2 passe 1er, b1 2e : 16 (poule A) + 12 (poule B) + 8 (un seul finaliste trouvé) + 16 (championne a1) = 52.
    expect((screen.getByLabelText('Scénario, poule B, place 2') as HTMLSelectElement).value).toBe('b1');
    expect(screen.getByTestId('points-simules-moi').textContent).toContain('52');
    expect(screen.getByTestId('points-simules-moi').textContent).toContain('+36'); // écart avec les 16 points d'aujourd'hui
    expect(screen.getByTestId('total-simule-moi').textContent).toContain('62');
  });

  it('changer la championne met à jour les points ; « Revenir à l\'état réel » remet le scénario de départ', () => {
    rendu();
    fireEvent.change(screen.getByLabelText('Scénario, championne'), { target: { value: 'b1' } });
    expect(screen.getByTestId('points-simules-moi').textContent).toContain('48');
    fireEvent.click(screen.getByText('Revenir à l\'état réel'));
    expect(screen.getByTestId('points-simules-moi').textContent).toContain('64');
  });
});
