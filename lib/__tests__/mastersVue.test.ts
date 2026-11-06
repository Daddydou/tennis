// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { vueMasters, type LigneMatchMasters } from '../mastersVue';

const set = (s: string) => s.split(' ').filter(Boolean).map((x) => ({ g1: Number(x.split('-')[0]), g2: Number(x.split('-')[1]) }));

function ligne(round: string, position: number, half: 'top' | 'bottom' | null, p1: string | null, p2: string | null, winner: string | null = null, score = '', status?: string): LigneMatchMasters {
  return { round, position, half, player1Id: p1, player2Id: p2, winnerId: winner, status: status ?? (winner ? 'completed' : 'scheduled'), sets: score ? set(score) : [] };
}

/** Journées de la poule A (a1..a4) et B (b1..b4) : J1 a1-a4 a2-a3, J2 a1-a3 a4-a2, J3 a1-a2 a3-a4. */
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

/** Tous les matchs de la poule jouée : le joueur 1 est le mieux classé (a1 > a2 > a3 > a4). */
function jouer(rows: LigneMatchMasters[], prefix: 'a' | 'b'): LigneMatchMasters[] {
  return rows.map((r) => {
    if (!r.half || !r.player1Id?.startsWith(prefix)) return r;
    const n1 = Number(r.player1Id[1]);
    const n2 = Number(r.player2Id![1]);
    const gagnant = n1 < n2 ? r.player1Id : r.player2Id;
    const score = gagnant === r.player1Id ? '6-4 6-4' : '4-6 4-6';
    return { ...r, winnerId: gagnant, status: 'completed', sets: set(score) };
  });
}

describe('vueMasters', () => {
  it('avant tout match : deux poules de 4, trois journées de 2 matchs, étiquettes pour les demies', () => {
    const v = vueMasters(poulesVides());
    expect(v.poules.A.joueurs.sort()).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(v.poules.B.joueurs.sort()).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(v.poules.A.journees.map((j) => j.matchs.length)).toEqual([2, 2, 2]);
    expect(v.poules.A.terminee).toBe(false);
    expect(v.poules.A.qualifies).toBeNull();
    expect(v.demis[0]).toMatchObject({ player1Id: null, player2Id: null, deduit: false, etiquettes: ['1er A', '2e B'] });
    expect(v.demis[1].etiquettes).toEqual(['1er B', '2e A']);
    expect(v.championId).toBeNull();
  });

  it('une poule terminée : classement, qualifiés ; l\'autre poule en cours : pas de demies déduites', () => {
    const v = vueMasters(jouer(poulesVides(), 'a'));
    expect(v.poules.A.terminee).toBe(true);
    expect(v.poules.A.classement.map((l) => l.playerId)).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(v.poules.A.qualifies).toEqual(['a1', 'a2']);
    expect(v.poules.B.terminee).toBe(false);
    expect(v.demis[0].deduit).toBe(false);
  });

  it('deux poules terminées : les demies croisées sont déduites du classement (1er A - 2e B, 1er B - 2e A)', () => {
    const v = vueMasters(jouer(jouer(poulesVides(), 'a'), 'b'));
    expect(v.demis[0]).toMatchObject({ player1Id: 'a1', player2Id: 'b2', deduit: true });
    expect(v.demis[1]).toMatchObject({ player1Id: 'b1', player2Id: 'a2', deduit: true });
  });

  it('les joueurs enregistrés sur le match de demie priment sur le calcul', () => {
    const rows = jouer(jouer(poulesVides(), 'a'), 'b').map((r) => (r.round === 'SF' && r.position === 0 ? { ...r, player1Id: 'a1', player2Id: 'b2' } : r));
    expect(vueMasters(rows).demis[0].deduit).toBe(false);
  });

  it('demies jouées : finalistes ; finale jouée : champion', () => {
    let rows = jouer(jouer(poulesVides(), 'a'), 'b');
    rows = rows.map((r) => {
      if (r.round === 'SF' && r.position === 0) return ligne('SF', 0, 'top', 'a1', 'b2', 'a1', '6-3 6-3');
      if (r.round === 'SF' && r.position === 1) return ligne('SF', 1, 'bottom', 'b1', 'a2', 'a2', '4-6 6-4 6-2');
      if (r.round === 'F') return ligne('F', 0, 'top', 'a1', 'a2', 'a2', '4-6 7-5 6-4');
      return r;
    });
    const v = vueMasters(rows);
    expect(v.demis.map((d) => d.match?.winnerId)).toEqual(['a1', 'a2']);
    expect(v.finale).toMatchObject({ player1Id: 'a1', player2Id: 'a2' });
    expect(v.championId).toBe('a2');
  });

  it('finalistes déduits des vainqueurs de demie tant que le match de finale n\'a pas ses joueurs', () => {
    let rows = jouer(jouer(poulesVides(), 'a'), 'b');
    rows = rows.map((r) => {
      if (r.round === 'SF' && r.position === 0) return ligne('SF', 0, 'top', 'a1', 'b2', 'a1', '6-3 6-3');
      if (r.round === 'SF' && r.position === 1) return ligne('SF', 1, 'bottom', 'b1', 'a2', 'b1', '6-3 6-3');
      return r;
    });
    const v = vueMasters(rows);
    expect(v.finale).toMatchObject({ player1Id: 'a1', player2Id: 'b1' });
    expect(v.championId).toBeNull();
  });

  it('forfait et abandon sont signalés ; un match en direct est « en cours » et sans vainqueur', () => {
    const rows = poulesVides().map((r) => {
      if (r.round === 'J1' && r.position === 0) return { ...r, winnerId: 'a1', status: 'walkover' };
      if (r.round === 'J1' && r.position === 1) return { ...r, winnerId: 'a2', status: 'retired', sets: set('6-4 2-1') };
      if (r.round === 'J2' && r.position === 0) return { ...r, status: 'live', sets: set('3-2') };
      return r;
    });
    const j1 = vueMasters(rows).poules.A.journees;
    expect(j1[0].matchs[0]).toMatchObject({ speciale: 'forfait', etat: 'termine', winnerId: 'a1' });
    expect(j1[0].matchs[1]).toMatchObject({ speciale: 'abandon', etat: 'termine' });
    expect(j1[1].matchs[0]).toMatchObject({ etat: 'en_cours', winnerId: null });
  });
});
