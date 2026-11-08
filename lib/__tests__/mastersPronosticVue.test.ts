// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { PronosticMasters } from '../masters';
import { lignesPhaseFinale, pastillesPoule, pronosticsParParticipant } from '../mastersPronosticVue';
import { vueMasters, type LigneMatchMasters } from '../mastersVue';

const set = (s: string) => s.split(' ').filter(Boolean).map((x) => ({ g1: Number(x.split('-')[0]), g2: Number(x.split('-')[1]) }));

function ligne(round: string, position: number, half: 'top' | 'bottom' | null, p1: string | null, p2: string | null, winner: string | null = null): LigneMatchMasters {
  return { round, position, half, player1Id: p1, player2Id: p2, winnerId: winner, status: winner ? 'completed' : 'scheduled', sets: winner ? set(winner === p1 ? '6-4 6-4' : '4-6 4-6') : [] };
}

function poulesVides(): LigneMatchMasters[] {
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

/** Poule jouée : le joueur au plus petit numéro gagne (a1 > a2 > a3 > a4). */
function jouer(rows: LigneMatchMasters[], prefix: 'a' | 'b'): LigneMatchMasters[] {
  return rows.map((r) => {
    if (!r.half || !r.player1Id?.startsWith(prefix)) return r;
    const gagnant = Number(r.player1Id[1]) < Number(r.player2Id![1]) ? r.player1Id : r.player2Id;
    return { ...r, winnerId: gagnant, status: 'completed', sets: set(gagnant === r.player1Id ? '6-4 6-4' : '4-6 4-6') };
  });
}

const poulesJouees = () => jouer(jouer(poulesVides(), 'a'), 'b');

describe('pastillesPoule', () => {
  const prevu = (classementPrevu: string[] | null, cle = 'moi') => ({ cle, nom: cle, classementPrevu });

  it('poule pas finie : toutes les pastilles sont en attente, avec la place prévue', () => {
    const v = vueMasters(poulesVides());
    const m = pastillesPoule(v.poules.A, [prevu(['a1', 'a2', 'a3', 'a4'])]);
    expect(m.get('a1')).toEqual([{ cle: 'moi', nom: 'moi', rang: 1, verdict: 'attente' }]);
    expect(m.get('a4')?.[0]).toMatchObject({ rang: 4, verdict: 'attente' });
  });

  it('poule finie : juste (place exacte), partiel (qualifiée à une autre place), raté', () => {
    const v = vueMasters(poulesJouees());
    // Réel : a1, a2, a3, a4. Prévu : a2 1er (partiel), a1 2e (partiel), a4 3e (raté), a3 4e (raté).
    const m = pastillesPoule(v.poules.A, [prevu(['a2', 'a1', 'a4', 'a3'])]);
    expect(m.get('a2')?.[0].verdict).toBe('partiel');
    expect(m.get('a1')?.[0].verdict).toBe('partiel');
    expect(m.get('a4')?.[0].verdict).toBe('rate');
    expect(m.get('a3')?.[0].verdict).toBe('rate');
    const exact = pastillesPoule(v.poules.A, [prevu(['a1', 'a2', 'a3', 'a4'])]);
    expect([...exact.values()].every((l) => l[0].verdict === 'juste')).toBe(true);
  });

  it('une qualifiée prévue 3e n\'est pas « partielle » : raté', () => {
    const v = vueMasters(poulesJouees());
    const m = pastillesPoule(v.poules.A, [prevu(['a3', 'a4', 'a1', 'a2'])]);
    expect(m.get('a1')?.[0].verdict).toBe('rate');
  });

  it('plusieurs participants sur la même joueuse, et un participant sans pronostic ignoré', () => {
    const v = vueMasters(poulesJouees());
    const m = pastillesPoule(v.poules.A, [prevu(['a1', 'a2', 'a3', 'a4'], 'moi'), prevu(null, 'laki'), prevu(['a2', 'a1', 'a3', 'a4'], 'thomas')]);
    expect(m.get('a1')?.map((p) => [p.cle, p.rang, p.verdict])).toEqual([
      ['moi', 1, 'juste'],
      ['thomas', 2, 'partiel'],
    ]);
  });
});

describe('lignesPhaseFinale', () => {
  const pronostic = (champion: string, demis: [string, string] = ['a1', 'b1']): PronosticMasters => ({
    classementA: ['a1', 'a2', 'a3', 'a4'],
    classementB: ['b1', 'b2', 'b3', 'b4'],
    vainqueursDemis: demis,
    champion,
  });
  const parts = (p: PronosticMasters | null) => [{ cle: 'moi', nom: 'Moi', pronostic: p }];

  it('ignore les participants sans pronostic', () => {
    expect(lignesPhaseFinale(vueMasters(poulesVides()), parts(null))).toEqual([]);
  });

  it('avant la fin des poules : tout est en attente', () => {
    const [l] = lignesPhaseFinale(vueMasters(poulesVides()), parts(pronostic('a1')));
    expect(l.finalistes.map((f) => f.verdict)).toEqual(['attente', 'attente']);
    expect(l.champion.verdict).toBe('attente');
  });

  it('poules finies : une joueuse éliminée en poule est ratée dès maintenant', () => {
    const [l] = lignesPhaseFinale(vueMasters(poulesJouees()), parts(pronostic('a4', ['a4', 'b1'])));
    expect(l.finalistes[0]).toEqual({ joueurId: 'a4', verdict: 'rate' });
    expect(l.finalistes[1].verdict).toBe('attente');
    expect(l.champion.verdict).toBe('rate');
  });

  it('demie jouée : la gagnante est finaliste juste ; la perdante est ratée comme championne', () => {
    const rows = poulesJouees().map((r) => (r.round === 'SF' && r.position === 0 ? ligne('SF', 0, 'top', 'a1', 'b2', 'a1') : r));
    const [l] = lignesPhaseFinale(vueMasters(rows), parts(pronostic('b2', ['a1', 'b1'])));
    expect(l.finalistes[0]).toEqual({ joueurId: 'a1', verdict: 'juste' });
    expect(l.champion.verdict).toBe('rate');
  });
});

describe('pronosticsParParticipant', () => {
  it('rattache chaque pronostic à son participant (null = moi), sinon null', () => {
    const p: PronosticMasters = { classementA: [], classementB: [], vainqueursDemis: ['x', 'y'], champion: 'x' };
    const r = pronosticsParParticipant([{ participantId: null, pronostic: p }], [
      { id: null, nom: 'Moi' },
      { id: 'u1', nom: 'Laki' },
    ]);
    expect(r).toEqual([
      { cle: 'moi', nom: 'Moi', pronostic: p },
      { cle: 'u1', nom: 'Laki', pronostic: null },
    ]);
  });
});
