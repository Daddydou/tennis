import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PronosticStocke } from '@/db/mastersPronostic';
import type { PronosticMasters } from '@/lib/masters';
import { vueMasters, type LigneMatchMasters } from '@/lib/mastersVue';

const enregistrer = vi.fn(async () => ({ ok: true as const }));
vi.mock('../mastersPronosticActions', () => ({ enregistrerPronosticMasters: (...a: unknown[]) => enregistrer(...(a as [])) }));

import EditeurPronostic from '../EditeurPronostic';
import PronosticsMasters from '../PronosticsMasters';

afterEach(() => {
  cleanup();
  enregistrer.mockClear();
});

const poules = { A: ['a1', 'a2', 'a3', 'a4'], B: ['b1', 'b2', 'b3', 'b4'] };
const noms = Object.fromEntries([...poules.A, ...poules.B].map((id) => [id, `Joueuse ${id.toUpperCase()}`]));
const prono = (over: Partial<PronosticMasters> = {}): PronosticMasters => ({
  classementA: ['a1', 'a2', 'a3', 'a4'], classementB: ['b1', 'b2', 'b3', 'b4'], vainqueursDemis: ['a1', 'b1'], champion: 'a1', ...over,
});

const lignes = (): LigneMatchMasters[] => {
  const l = (round: string, position: number, half: 'top' | 'bottom', p1: string, p2: string): LigneMatchMasters => ({ round, position, half, player1Id: p1, player2Id: p2, winnerId: null, status: 'scheduled', sets: [] });
  return [l('J1', 0, 'top', 'a1', 'a4'), l('J1', 1, 'top', 'a2', 'a3'), l('J1', 2, 'bottom', 'b1', 'b4'), l('J1', 3, 'bottom', 'b2', 'b3')];
};
const stocke = (participantId: string | null, p: PronosticMasters): PronosticStocke => ({ participantId, pronostic: p, source: 'app', updatedAt: '2026-11-07T10:00:00Z' });
const participants = [{ id: null, nom: 'Moi' }, { id: 'laki', nom: 'Laki' }];

function rendu(over: Partial<React.ComponentProps<typeof PronosticsMasters>> = {}) {
  return render(
    <PronosticsMasters tournamentId="T" vue={vueMasters(lignes())} poules={poules} noms={noms} participants={participants} pronostics={[]} picksPar={{}} propose={null} ferme={false} {...over} />,
  );
}

describe('PronosticsMasters', () => {
  it('affiche le classement du tournoi (pronostic + picks) et un bloc par participant', () => {
    rendu({ pronostics: [stocke(null, prono())], picksPar: { moi: 12, laki: 30 } });
    expect(screen.getByText('Pronostics et classement')).toBeTruthy();
    expect(screen.getAllByText('Laki').length).toBeGreaterThan(0);
    // Laki : pas de pronostic, 30 picks : premier ; Moi : pronostic saisi (0 point, rien de joué) + 12 picks.
    const lignesTab = within(screen.getByTestId('pronostics-masters')).getAllByRole('row');
    expect(lignesTab[1].textContent).toContain('Laki');
    expect(lignesTab[1].textContent).toContain('30');
    expect(lignesTab[2].textContent).toContain('Moi');
    expect(screen.getByText('pronostic saisi')).toBeTruthy();
    expect(screen.getByText('pas de pronostic')).toBeTruthy();
  });

  it('pronostic fermé : la saisie à la main reste possible (éditeur + note), départ = classement actuel des poules', () => {
    rendu({ ferme: true, pronostics: [stocke(null, prono())] });
    expect(screen.getByText(/fermés/)).toBeTruthy();
    // Un éditeur par participant (Moi a un pronostic, Laki n'en a pas) : on peut tout compléter après coup.
    expect(screen.getAllByText('Enregistrer ce pronostic')).toHaveLength(2);
    expect(screen.getAllByText(/cette saisie à la main sert à recopier/)).toHaveLength(2);
    expect(screen.getByText('Saisir un pronostic')).toBeTruthy();
  });

  it('pronostic ouvert : éditeur pré-rempli avec la proposition pour moi', () => {
    rendu({ propose: prono({ champion: 'b1' }) });
    expect(screen.getByText(/Pré-rempli avec le pronostic proposé/)).toBeTruthy();
    const champions = screen.getAllByLabelText('Championne') as HTMLSelectElement[];
    expect(champions[0].value).toBe('b1'); // l'éditeur de « Moi » est le premier
  });

  it('poules incomplètes : rien n\'est affiché', () => {
    const { container } = rendu({ poules: { A: ['a1'], B: ['b1'] } });
    expect(container.textContent).toBe('');
  });
});

describe('EditeurPronostic', () => {
  const editeur = (initial = prono()) => render(<EditeurPronostic tournamentId="T" participantId={null} poules={poules} noms={noms} initial={initial} />);

  it('un pronostic valide s\'enregistre avec les bons arguments', async () => {
    editeur();
    fireEvent.click(screen.getByText('Enregistrer ce pronostic'));
    await waitFor(() => expect(enregistrer).toHaveBeenCalledTimes(1));
    expect(enregistrer).toHaveBeenCalledWith('T', null, prono());
    await waitFor(() => expect(screen.getByText('Pronostic enregistré.')).toBeTruthy());
  });

  it('un classement avec un doublon est refusé (bouton bloqué, erreur affichée)', () => {
    editeur();
    fireEvent.change(screen.getByLabelText('Poule A, place 2'), { target: { value: 'a1' } });
    expect((screen.getByText('Enregistrer ce pronostic') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/exactement ses 4 joueurs/)).toBeTruthy();
  });

  it('changer le classement remet d\'équerre le vainqueur de demie et la championne', () => {
    editeur();
    // Poule B : 2e devient b3 -> la demie 1 est « a1 – b3 », le vainqueur choisi (a1) reste valide.
    fireEvent.change(screen.getByLabelText('Poule A, place 1'), { target: { value: 'a3' } });
    // a1 n'est plus 1er de A : la demie 1 devient « a3 – b2 », le vainqueur passe sur a3 (premier candidat), la championne aussi.
    expect((screen.getByLabelText('Vainqueur de la demie 1') as HTMLSelectElement).value).toBe('a3');
    expect((screen.getByLabelText('Championne') as HTMLSelectElement).value).toBe('a3');
  });
});
