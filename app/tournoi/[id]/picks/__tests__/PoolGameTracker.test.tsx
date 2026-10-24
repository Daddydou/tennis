/**
 * Repères Game Tracker sur la grille de picks (Vitest + RTL, jsdom) : après
 * « Lire Game Tracker », les joueurs hors du pool du tour ouvert sont signalés ;
 * le repère ne touche ni à la sélection ni aux autres tours / participants.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import PickBoard, { type Candidat } from '../PickBoard';
import { FournisseurPoolGT, useDefinirPoolGT } from '../PoolGameTracker';
import type { PoolLocalGT } from '@/lib/gameTrackerPicks';

vi.mock('../actions', () => ({ validerPick: vi.fn(), supprimerPick: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

const candidat = (playerId: string, nom: string): Candidat => ({
  playerId,
  nom,
  rang: null,
  adversaire: null, resultat: null,
  ePoints: 1,
  elo: 1500,
  sourceElo: 'ta',
  taName: null,
  candidats: [],
  ecartElo: null,
  utilise: false,
  insight: null,
});

const POOL: PoolLocalGT = {
  roundLocal: 'R16',
  parJoueur: {
    p1: { enAttente: false, dejaPicke: false },
    p2: { enAttente: true, dejaPicke: false },
    p3: { enAttente: false, dejaPicke: true },
  },
};

/** Publie un pool comme le fait le panneau après « Lire Game Tracker ». */
function Publie({ pool }: { pool: PoolLocalGT | null }) {
  const definir = useDefinirPoolGT();
  useEffect(() => definir(pool), [definir, pool]);
  return null;
}

function ecran(opts: { pool: PoolLocalGT | null; round?: string; participantId?: string | null; avecFournisseur?: boolean }) {
  const board = (
    <>
      <Publie pool={opts.pool} />
      <PickBoard
        tournamentId="t"
        round={opts.round ?? 'R16'}
        participantId={opts.participantId ?? null}
        colonnes={[
          {
            half: null,
            label: 'Un seul pick',
            pickActuel: null,
            impossible: false,
            candidats: [candidat('p1', 'Alex Adams'), candidat('p2', 'Ben Baker'), candidat('p3', 'Carl Clark'), candidat('p4', 'Dan Davis')],
          },
        ]}
      />
    </>
  );
  return render(opts.avecFournisseur === false ? board : <FournisseurPoolGT>{board}</FournisseurPoolGT>);
}

describe('repères Game Tracker sur la grille de picks', () => {
  it('sans « Lire » (pas de pool) : aucun repère', () => {
    ecran({ pool: null });
    expect(screen.queryByText('hors pool GT')).toBeNull();
    expect(screen.queryByText('en attente')).toBeNull();
    expect(screen.queryByText('déjà pické GT')).toBeNull();
  });

  it('signale hors pool, en attente et déjà pické ; le joueur du pool sans drapeau reste net', () => {
    ecran({ pool: POOL });
    expect(screen.getAllByText('hors pool GT')).toHaveLength(1); // p4 seulement
    expect(screen.getAllByText('en attente')).toHaveLength(1); // p2
    expect(screen.getAllByText('déjà pické GT')).toHaveLength(1); // p3
  });

  it('un joueur signalé reste sélectionnable (repère indicatif)', () => {
    ecran({ pool: POOL });
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);
    for (const r of radios) expect(r).not.toBeDisabled();
  });

  it('autre tour que celui ouvert chez Game Tracker : aucun repère', () => {
    ecran({ pool: POOL, round: 'QF' });
    expect(screen.queryByText('hors pool GT')).toBeNull();
  });

  it('vue d’un autre participant : aucun repère (le pool est celui de mon compte)', () => {
    ecran({ pool: POOL, participantId: 'laki' });
    expect(screen.queryByText('hors pool GT')).toBeNull();
  });

  it('sans fournisseur (hors page picks) : la grille s’affiche normalement', () => {
    ecran({ pool: POOL, avecFournisseur: false });
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.queryByText('hors pool GT')).toBeNull();
  });
});
