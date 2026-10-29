/**
 * Repères Game Tracker sur le grand tableau de l'écran Picks (Vitest + RTL,
 * jsdom) : après « Lire Game Tracker », les joueurs hors du pool du tour
 * ouvert sont signalés ; le repère ne touche ni à la réservation ni aux
 * autres tours / participants.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import TableauJoueurs, { type LigneTableau } from '../../plan/TableauJoueurs';
import { FournisseurPoolGT, useDefinirPoolGT } from '../PoolGameTracker';
import type { PoolLocalGT } from '@/lib/gameTrackerPicks';

afterEach(cleanup);

const ligne = (idx: number, id: string, nom: string): LigneTableau => ({
  idx,
  id,
  nom,
  rang: null,
  elo: 1500,
  sourceElo: 'ta',
  taName: null,
  candidatsElo: [],
  moitie: 'top',
  adversaires: [],
    resultat: null,
    enCours: null,
  parTour: { R16: { e: 1, presence: 1, sigma: 0.5 }, QF: { e: 1, presence: 0.5, sigma: 0.5 } },
  utilise: false,
  prisPar: [],
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

function ecran(opts: { pool: PoolLocalGT | null; tourLibre?: string; avecPoolGT?: boolean; avecFournisseur?: boolean }) {
  const contenu = (
    <>
      <Publie pool={opts.pool} />
      <TableauJoueurs
        lignes={[ligne(0, 'p1', 'Alex Adams'), ligne(1, 'p2', 'Ben Baker'), ligne(2, 'p3', 'Carl Clark'), ligne(3, 'p4', 'Dan Davis')]}
        rounds={['R16', 'QF']}
        premierTourLibre={opts.tourLibre ?? 'R16'}
        tourCourant="R16"
        cleDeCellule={(_idx, round) => `${round}|top`}
        infoSlots={new Map()}
        onCellule={vi.fn()}
        avecPoolGT={opts.avecPoolGT ?? true}
      />
    </>
  );
  return render(opts.avecFournisseur === false ? contenu : <FournisseurPoolGT>{contenu}</FournisseurPoolGT>);
}

describe('repères Game Tracker sur le grand tableau', () => {
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

  it('un joueur signalé reste réservable (repère indicatif)', () => {
    ecran({ pool: POOL });
    const cases = screen.getAllByTitle(/^R16 :/);
    expect(cases).toHaveLength(4);
    for (const c of cases) expect(c).toBeEnabled();
  });

  it('autre tour que celui ouvert chez Game Tracker : aucun repère', () => {
    ecran({ pool: POOL, tourLibre: 'QF' });
    expect(screen.queryByText('hors pool GT')).toBeNull();
  });

  it('vue d’un autre participant : aucun repère (le pool est celui de mon compte)', () => {
    ecran({ pool: POOL, avecPoolGT: false });
    expect(screen.queryByText('hors pool GT')).toBeNull();
  });

  it('sans fournisseur (hors page picks) : le tableau s’affiche normalement', () => {
    ecran({ pool: POOL, avecFournisseur: false });
    expect(screen.getAllByTitle(/^R16 :/)).toHaveLength(4);
    expect(screen.queryByText('hors pool GT')).toBeNull();
  });
});
