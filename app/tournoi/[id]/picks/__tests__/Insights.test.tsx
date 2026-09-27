/**
 * Tests de COMPOSANTS des insights joueurs (Vitest + RTL, jsdom).
 *
 * Invariants couverts : un seul badge par priorité (Forfait > Blessure >
 * Charge), un joueur flaggé reste sélectionnable (affichage seul), ouvrir le
 * détail ne change pas le choix, seules les sources http(s) deviennent des
 * liens, et sans insight l'écran n'a ni badge ni bouton de détail.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PickBoard, { type Candidat } from '../PickBoard';
import InsightBadge from '../InsightBadge';
import { plusRecentParJoueur, type PlayerInsight } from '@/lib/insights';

vi.mock('../actions', () => ({ validerPick: vi.fn(), supprimerPick: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

const insight = (o: Partial<PlayerInsight> = {}): PlayerInsight => ({
  id: 'i1',
  tournamentId: 't',
  playerId: 'p1',
  withdrawn: false,
  injuryRisk: false,
  heavyLoad: false,
  surfaceSwitch: false,
  homeTournament: false,
  summary: 'Résumé',
  facts: [],
  confidence: 'high',
  asOf: '2026-09-27',
  createdAt: '2026-09-27T10:00:00Z',
  ...o,
});

const candidat = (playerId: string, nom: string, ins: PlayerInsight | null): Candidat => ({
  playerId,
  nom,
  rang: null,
  adversaire: null,
  ePoints: 1,
  elo: 1500,
  sourceElo: 'ta',
  taName: null,
  candidats: [],
  ecartElo: null,
  utilise: false,
  insight: ins,
});

const board = (candidats: Candidat[]) =>
  render(
    <PickBoard
      tournamentId="t"
      round="R16"
      colonnes={[{ half: null, label: 'Un seul pick', pickActuel: null, impossible: false, candidats }]}
    />,
  );

describe('InsightBadge', () => {
  it('suit la priorité Forfait > Blessure > Charge, un seul badge', () => {
    render(<InsightBadge insight={insight({ withdrawn: true, injuryRisk: true, heavyLoad: true })} />);
    expect(screen.getByText('Forfait')).toHaveAttribute('title', 'Résumé');
    expect(screen.queryByText('Blessure')).toBeNull();
    cleanup();
    render(<InsightBadge insight={insight({ injuryRisk: true, heavyLoad: true })} />);
    expect(screen.getByText('Blessure')).toBeInTheDocument();
    cleanup();
    render(<InsightBadge insight={insight({ heavyLoad: true })} />);
    expect(screen.getByText('Charge')).toBeInTheDocument();
  });

  it("n'affiche rien sans flag", () => {
    const { container } = render(<InsightBadge insight={insight({ surfaceSwitch: true })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PickBoard + insights', () => {
  it('un joueur en forfait reste sélectionnable', async () => {
    board([candidat('p1', 'Krejcikova', insight({ withdrawn: true }))]);
    const radio = screen.getByRole('radio');
    expect(radio).toBeEnabled();
    await userEvent.click(radio);
    expect(radio).toBeChecked();
  });

  it('ouvrir le détail ne sélectionne pas le joueur, et seules les URL http(s) sont des liens', async () => {
    board([
      candidat(
        'p1',
        'Prozorova',
        insight({
          withdrawn: true,
          facts: [
            { type: 'withdrawal', text: 'Fait sourcé', date: '2026-09-26', confidence: 'high', source: 'https://exemple.org/a' },
            { type: 'context', text: 'Fait piégé', date: null, confidence: 'low', source: 'javascript:alert(1)' },
          ],
        }),
      ),
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Infos sur Prozorova' }));
    expect(screen.getByRole('radio')).not.toBeChecked();
    expect(screen.getByText('Résumé')).toBeInTheDocument();
    const lien = screen.getByRole('link');
    expect(lien).toHaveAttribute('href', 'https://exemple.org/a');
    expect(lien).toHaveAttribute('target', '_blank');
    expect(lien).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByText('Fait piégé')).toBeInTheDocument();
  });

  it("sans insight : ni badge ni bouton d'infos", () => {
    board([candidat('p1', 'Sakkari', null)]);
    expect(screen.queryByRole('button', { name: /Infos/ })).toBeNull();
    expect(screen.queryByText(/Forfait|Blessure|Charge/)).toBeNull();
  });
});

describe('plusRecentParJoueur', () => {
  it('garde la ligne au as_of le plus récent par joueur', () => {
    const m = plusRecentParJoueur([
      insight({ id: 'vieux', asOf: '2026-09-20' }),
      insight({ id: 'recent', asOf: '2026-09-27' }),
      insight({ id: 'autre', playerId: 'p2', asOf: '2026-09-01' }),
    ]);
    expect(m.get('p1')?.id).toBe('recent');
    expect(m.get('p2')?.id).toBe('autre');
  });
});
