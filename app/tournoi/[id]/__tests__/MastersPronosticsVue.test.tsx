/**
 * Tests de COMPOSANT — pronostics de chacun sur le Tableau d'un Masters (pastilles de poule, phase
 * finale, légende) et picks d'un autre participant en lecture seule. Pas de base : données à la main.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { pastillesPoule, lignesPhaseFinale } from '@/lib/mastersPronosticVue';
import { vueMasters, type LigneMatchMasters } from '@/lib/mastersVue';
import { CartePoule, LegendePronostics, PhaseFinale } from '../MastersPieces';
import PicksParticipantMasters from '../PicksParticipantMasters';

afterEach(() => cleanup());

function ligne(round: string, position: number, half: 'top' | 'bottom' | null, p1: string | null, p2: string | null, winner: string | null = null): LigneMatchMasters {
  return {
    round,
    position,
    half,
    player1Id: p1,
    player2Id: p2,
    winnerId: winner,
    status: winner ? 'completed' : 'scheduled',
    sets: winner ? (winner === p1 ? [{ g1: 6, g2: 4 }, { g1: 6, g2: 4 }] : [{ g1: 4, g2: 6 }, { g1: 4, g2: 6 }]) : [],
  };
}

function lignes(): LigneMatchMasters[] {
  const jour = (prefix: 'a' | 'b', half: 'top' | 'bottom', offset: number) => [
    ligne('J1', offset, half, `${prefix}1`, `${prefix}4`),
    ligne('J1', offset + 1, half, `${prefix}2`, `${prefix}3`),
    ligne('J2', offset, half, `${prefix}1`, `${prefix}3`),
    ligne('J2', offset + 1, half, `${prefix}4`, `${prefix}2`),
    ligne('J3', offset, half, `${prefix}1`, `${prefix}2`),
    ligne('J3', offset + 1, half, `${prefix}3`, `${prefix}4`),
  ];
  return [...jour('a', 'top', 0), ...jour('b', 'bottom', 2), ligne('SF', 0, 'top', null, null), ligne('SF', 1, 'bottom', null, null), ligne('F', 0, 'top', null, null)];
}

const noms = new Map(['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4'].map((id) => [id, `Joueuse ${id.toUpperCase()}`]));

describe('pastilles sur la carte de poule', () => {
  it('affiche chaque participant avec sa place prévue sur la joueuse', () => {
    const v = vueMasters(lignes());
    const pastilles = pastillesPoule(v.poules.A, [
      { cle: 'moi', nom: 'Moi', classementPrevu: ['a1', 'a2', 'a3', 'a4'] },
      { cle: 'laki', nom: 'Laki', classementPrevu: ['a2', 'a1', 'a3', 'a4'] },
    ]);
    render(<CartePoule p={v.poules.A} noms={noms} pastilles={pastilles} />);
    const groupes = screen.getAllByTestId('pastilles-poule');
    expect(groupes.length).toBeGreaterThan(0);
    // Joueuse A1 : prévue 1re par Moi (M1) et 2e par Laki (L2) ; poule pas finie -> en attente.
    const texte = groupes.map((g) => g.textContent).join(' ');
    expect(texte).toContain('M1');
    expect(texte).toContain('L2');
  });

  it('sans pastilles : aucune pastille affichée', () => {
    const v = vueMasters(lignes());
    render(<CartePoule p={v.poules.A} noms={noms} />);
    expect(screen.queryByTestId('pastilles-poule')).toBeNull();
  });
});

describe('phase finale et légende', () => {
  it('montre finalistes et championne pronostiqués de chacun', () => {
    const v = vueMasters(lignes());
    const l = lignesPhaseFinale(v, [
      { cle: 'moi', nom: 'Moi', pronostic: { classementA: ['a1', 'a2', 'a3', 'a4'], classementB: ['b1', 'b2', 'b3', 'b4'], vainqueursDemis: ['a1', 'b1'], champion: 'a1' } },
    ]);
    render(<PhaseFinale vue={v} noms={noms} pronostics={l} />);
    const bloc = screen.getByTestId('pronostics-phase-finale');
    expect(bloc.textContent).toContain('Moi');
    expect(bloc.textContent).toContain('Joueuse A1');
    expect(bloc.textContent).toMatch(/Championne/i);
  });

  it('sans pronostic : pas de bloc', () => {
    render(<PhaseFinale vue={vueMasters(lignes())} noms={noms} />);
    expect(screen.queryByTestId('pronostics-phase-finale')).toBeNull();
  });

  it('la légende explique les quatre couleurs', () => {
    render(<LegendePronostics />);
    const l = screen.getByTestId('legende-pronostics');
    expect(l.textContent).toMatch(/juste/i);
    expect(l.textContent).toMatch(/rat/i);
    expect(l.textContent).toMatch(/pas finie/i);
  });
});

describe('picks d\'un autre participant (lecture seule)', () => {
  it('liste les emplacements, les joueuses et le total des points', () => {
    render(
      <PicksParticipantMasters
        nom="Laki"
        noms={Object.fromEntries(noms)}
        picks={[
          { round: 'J1', half: 'top', playerId: 'a1', points: 10 },
          { round: 'J1', half: 'bottom', playerId: 'b2', points: 0 },
          { round: 'J2', half: 'top', playerId: 'a2', points: null },
          { round: 'SF', half: 'top', playerId: 'a1', points: null },
        ]}
      />,
    );
    const bloc = screen.getByTestId('picks-participant-masters');
    expect(bloc.textContent).toContain('Picks de Laki');
    expect(bloc.textContent).toContain('10 pts');
    expect(bloc.textContent).toContain('Joueuse A1');
    expect(bloc.textContent).toContain('à jouer');
    // Demie : pick retrouvé même si stocké en « top » ; finale non posée.
    expect(screen.getAllByText('pas posé').length).toBeGreaterThanOrEqual(1);
  });

  it('sans aucun pick : message explicatif', () => {
    render(<PicksParticipantMasters nom="Thomas" noms={{}} picks={[]} />);
    expect(screen.getByText(/Aucun pick de Thomas/)).toBeTruthy();
  });
});
