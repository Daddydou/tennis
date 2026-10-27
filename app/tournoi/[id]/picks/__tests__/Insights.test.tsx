/**
 * Tests de COMPOSANTS des insights joueurs (Vitest + RTL, jsdom), sur le grand
 * tableau de l'écran Picks (plan/TableauJoueurs).
 *
 * Invariants couverts : un seul badge par priorité (Forfait > Blessure >
 * Charge), un joueur flaggé reste réservable (affichage seul), ouvrir le
 * détail ne réserve pas le joueur, seules les sources http(s) deviennent des
 * liens, et sans insight l'écran n'a ni badge ni bouton de détail.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TableauJoueurs, { type LigneTableau } from '../../plan/TableauJoueurs';
import InsightBadge from '../InsightBadge';
import { plusRecentParJoueur, type PlayerInsight } from '@/lib/insights';

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

const ligne = (idx: number, id: string, nom: string, ins: PlayerInsight | null = null): LigneTableau => ({
  idx,
  id,
  nom,
  rang: null,
  elo: 1500,
  sourceElo: 'ta',
  taName: null,
  candidatsElo: [],
  moitie: 'top',
  adversaire: null,
  pVictoire: null,
  pointsMatch: null,
  resultat: null,
  parTour: { R16: { e: 1, presence: 1, sigma: 0.5 } },
  utilise: false,
  prisPar: [],
  insight: ins,
});

function tableau(lignes: LigneTableau[], onCellule = vi.fn()) {
  render(
    <TableauJoueurs
      lignes={lignes}
      rounds={['R16']}
      premierTourLibre="R16"
      tourCourant="R16"
      cleDeCellule={(_idx, round) => `${round}|top`}
      infoSlots={new Map()}
      onCellule={onCellule}
    />,
  );
  return onCellule;
}

/** La case « R16 » d'un joueur : le bouton qui le réserve pour ce tour. */
const caseDe = () => screen.getAllByTitle(/^R16 :/);

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

describe('grand tableau + insights', () => {
  it('un joueur en forfait reste réservable', async () => {
    const onCellule = tableau([ligne(0, 'p1', 'Krejcikova', insight({ withdrawn: true }))]);
    const [c] = caseDe();
    expect(c).toBeEnabled();
    await userEvent.click(c);
    expect(onCellule).toHaveBeenCalledWith(0, 'R16');
  });

  it('ouvrir le détail ne réserve pas le joueur, et seules les URL http(s) sont des liens', async () => {
    const onCellule = tableau([
      ligne(
        0,
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
    expect(onCellule).not.toHaveBeenCalled();
    expect(screen.getByText('Résumé')).toBeInTheDocument();
    const lien = screen.getByRole('link');
    expect(lien).toHaveAttribute('href', 'https://exemple.org/a');
    expect(lien).toHaveAttribute('target', '_blank');
    expect(lien).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByText('Fait piégé')).toBeInTheDocument();
  });

  it("sans insight : ni badge ni bouton d'infos", () => {
    tableau([ligne(0, 'p1', 'Sakkari')]);
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
