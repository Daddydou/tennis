/**
 * Tests de COMPOSANTS (Vitest + React Testing Library, jsdom) — pas de
 * navigateur, pas d'authentification : ils isolent SimulateurBracket avec
 * un petit tableau fictif (2 tours) et simulent les clics/sélections
 * dessus, pour couvrir le câblage React que scripts/test-bracketsim.mts
 * (Node pur, sans React) ne teste pas — un vainqueur cliqué au bloc 2
 * recalcule le classement/les % du bloc 4, changer de tour au bloc 1 met à
 * jour l'affichage, et valider un pronostic au bloc 3 le persiste (Server
 * Action moquée : ce fichier ne teste pas l'écriture DB elle-même, déjà
 * couverte par la lecture du code des actions et la vérification SQL
 * directe, cf. mémoire simulateur-bracket-un-tour).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MatchReel } from '@/lib/bracketSim';
import type { Player } from '@/lib/types';
import type { Joueur, Participant } from '../types';

type Picks = { position: number; playerId: string | null }[];
type SauvegarderPronosticsBracket = (
  tournamentId: string,
  participantId: string | null,
  round: string,
  picks: Picks,
) => Promise<{ ok: true }>;
const sauvegarderPronosticsBracketMock = vi.fn<SauvegarderPronosticsBracket>(async () => ({ ok: true }));
vi.mock('../actions', () => ({
  sauvegarderPronosticsBracket: (...args: Parameters<SauvegarderPronosticsBracket>) =>
    sauvegarderPronosticsBracketMock(...args),
}));

// Importé APRÈS le mock (le module doit être intercepté avant son import).
const { default: SimulateurBracket } = await import('../SimulateurBracket');

/* ========================================================================
 * FIXTURE — 2 tours (SF, F), 4 joueurs d'Elo distincts, comme le fixture
 * réduit de scripts/test-bracketsim.mts (même esprit, ici avec React).
 * ======================================================================== */
const ALPHA = 'A';
const BRAVO = 'B';
const CHARLIE = 'C';
const DELTA = 'D';

const rounds = ['SF', 'F'];

const matches: MatchReel[] = [
  { round: 'SF', position: 0, player1Id: ALPHA, player2Id: BRAVO, winnerId: null },
  { round: 'SF', position: 1, player1Id: CHARLIE, player2Id: DELTA, winnerId: null },
  { round: 'F', position: 0, player1Id: null, player2Id: null, winnerId: null },
];

const joueurs: Record<string, Joueur> = {
  [ALPHA]: { nom: 'Alpha', rang: 1 },
  [BRAVO]: { nom: 'Bravo', rang: 50 },
  [CHARLIE]: { nom: 'Charlie', rang: 10 },
  [DELTA]: { nom: 'Delta', rang: 12 },
};

function joueurElo(id: string, elo: number): Player {
  return {
    id,
    tour: 'ATP',
    name: joueurs[id].nom,
    country: null,
    rank: joueurs[id].rang,
    seed: null,
    half: 'top',
    eloOverall: elo,
    eloHard: elo,
    eloClay: elo,
    eloGrass: elo,
  };
}
const players: Record<string, Player> = {
  [ALPHA]: joueurElo(ALPHA, 2100),
  [BRAVO]: joueurElo(BRAVO, 1500),
  [CHARLIE]: joueurElo(CHARLIE, 1700),
  [DELTA]: joueurElo(DELTA, 1700),
};

const participants: Participant[] = [{ id: 'p1', nom: 'Laki' }];

// Moi suit Alpha en SF ; Laki suit Charlie en SF — pronostics déjà
// enregistrés (comme s'ils venaient de tn_bracket_round_picks).
const picksBracketInitiaux: Record<string, Record<string, string>> = {
  moi: { 'SF|0': ALPHA },
  p1: { 'SF|1': CHARLIE },
};

function renderEcran() {
  return render(
    <SimulateurBracket
      tournamentId="t1"
      rounds={rounds}
      matches={matches}
      joueurs={joueurs}
      players={players}
      surface="hard"
      participants={participants}
      picksBracketInitiaux={picksBracketInitiaux}
      roundParDefaut="SF"
    />,
  );
}

beforeEach(() => {
  sauvegarderPronosticsBracketMock.mockClear();
});
afterEach(() => {
  cleanup();
});

describe('SimulateurBracket', () => {
  it('bloc 1 : changer le tour de simulation met à jour l’affichage du bloc 2', async () => {
    const user = userEvent.setup();
    renderEcran();

    // Par défaut (onglet Bracket réel), le tour SF affiche ses 2 vrais matchs.
    expect(screen.getByTestId('bracket-reel-round')).toHaveTextContent('Bracket réel du tour SF');
    expect(screen.getByRole('button', { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Charlie/ })).toBeInTheDocument();

    // On bascule sur F au bloc 1 : ses deux entrants ne sont pas encore
    // connus (aucun résultat SF décidé) -> l'affichage change entièrement.
    await user.selectOptions(screen.getByLabelText(/tour de simulation/i), 'F');

    expect(screen.getByTestId('bracket-reel-round')).toHaveTextContent('Bracket réel du tour F');
    expect(screen.queryByRole('button', { name: /Alpha/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('en attente')).toHaveLength(2);
  });

  it('bloc 2 : cliquer un vainqueur recalcule les points simulés et les % du bloc 4', async () => {
    const user = userEvent.setup();
    renderEcran();

    await user.click(screen.getByRole('button', { name: 'Classement & probabilités' }));

    // Rien n'est encore décidé au bloc 2 : le pronostic de Moi (Alpha en
    // SF/0) ne peut pas encore rapporter de points.
    const ligneMoiAvant = screen.getByTestId('classement-moi');
    expect(ligneMoiAvant).toHaveAttribute('data-simules', '0');
    const probaMoiAvant = Number(ligneMoiAvant.getAttribute('data-proba'));
    const probaLakiAvant = Number(screen.getByTestId('classement-p1').getAttribute('data-proba'));
    expect(probaMoiAvant + probaLakiAvant).toBeCloseTo(1, 6);

    // Bloc 2 : je clique Alpha comme vainqueur de SF/0 — exactement le
    // pronostic de Moi.
    await user.click(screen.getByRole('button', { name: 'Bracket réel' }));
    await user.click(screen.getByRole('button', { name: /Alpha/ }));

    await user.click(screen.getByRole('button', { name: 'Classement & probabilités' }));

    const ligneMoiApres = screen.getByTestId('classement-moi');
    // SF est le 1er tour du fixture (index 0) -> barème 2^0 = 1 point.
    expect(ligneMoiApres).toHaveAttribute('data-simules', '1');
    expect(ligneMoiApres).toHaveAttribute('data-total', '1');
    const probaMoiApres = Number(ligneMoiApres.getAttribute('data-proba'));
    const probaLakiApres = Number(screen.getByTestId('classement-p1').getAttribute('data-proba'));

    // Recalcul en direct : la probabilité de Moi a bougé, et les deux
    // stocks se partagent toujours 100 % (jamais de dérive > 100 %).
    expect(probaMoiApres).not.toBeCloseTo(probaMoiAvant, 6);
    expect(probaMoiApres + probaLakiApres).toBeCloseTo(1, 6);
    // Un point garanti d'avance, sur un fixture à 2 tours, doit clairement
    // avantager Moi par rapport à avant.
    expect(probaMoiApres).toBeGreaterThan(probaMoiAvant);
  });

  it('bloc 3 : valider un pronostic de participant appelle la persistance et met à jour l’écran', async () => {
    const user = userEvent.setup();
    renderEcran();

    await user.click(screen.getByRole('button', { name: 'Bracket des participants' }));
    await user.click(screen.getByTestId('participants-stock-tab-p1')); // Laki

    // Laki n'a pronostiqué que SF/1 (Charlie) jusqu'ici ; on le change pour
    // Delta.
    const selectSF1 = screen.getByTestId('pick-SF-1');
    expect(within(screen.getByTestId('pick-SF-1')).getByRole('option', { name: /Charlie/ })).toBeInTheDocument();
    await user.selectOptions(selectSF1, DELTA);

    await user.click(screen.getByRole('button', { name: 'Valider les pronostics de Laki pour SF' }));

    expect(sauvegarderPronosticsBracketMock).toHaveBeenCalledTimes(1);
    expect(sauvegarderPronosticsBracketMock).toHaveBeenCalledWith('t1', 'p1', 'SF', [
      { position: 0, playerId: null },
      { position: 1, playerId: DELTA },
    ]);

    // Persisté côté écran : en quittant puis revenant sur l'onglet
    // Participants, le pronostic de Laki reflète bien Delta (pas resté sur
    // l'ancien Charlie, pas marqué « modifié »).
    await user.click(screen.getByRole('button', { name: 'Classement & probabilités' }));
    await user.click(screen.getByRole('button', { name: 'Bracket des participants' }));
    await user.click(screen.getByTestId('participants-stock-tab-p1'));

    expect(screen.getByTestId('pick-SF-1')).toHaveValue(DELTA);
    expect(screen.getByTestId('participants-stock-tab-p1')).toHaveTextContent('Laki');
    expect(screen.getByTestId('participants-stock-tab-p1').textContent).not.toContain('●');
  });
});
