// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MAX_PRONOSTIC,
  classementPoule,
  demisFinales,
  estMasters,
  joueursDejaPris,
  moitieDePoule,
  phaseDuTour,
  pointsPronostic,
  pouleDeMoitie,
  pouleTerminee,
  qualifies,
  validerPronostic,
  verifierPicksMasters,
  type MatchPoule,
  type PronosticMasters,
  type ReelMasters,
} from '../masters';

/** Match de poule : `score` du point de vue du joueur 1 (« 6-4 3-6 7-5 »). */
function m(p1: string, p2: string, winnerId: string | null, score = ''): MatchPoule {
  const sets = score
    .split(' ')
    .filter(Boolean)
    .map((s) => {
      const [g1, g2] = s.split('-').map(Number);
      return { g1, g2 };
    });
  return { player1Id: p1, player2Id: p2, winnerId, sets };
}

const A = ['a1', 'a2', 'a3', 'a4'];

describe('estMasters / phases / poules', () => {
  it('reconnaît un tournoi Masters à ses tours', () => {
    expect(estMasters(['J1', 'J2', 'J3', 'SF', 'F'])).toBe(true);
    expect(estMasters(['R64', 'R32', 'R16', 'QF', 'SF', 'F'])).toBe(false);
    expect(estMasters(['J1', 'J2', 'J3', 'F'])).toBe(false);
    expect(estMasters(null)).toBe(false);
  });

  it('phase des poules (J1-J3) ou phase finale (SF, F) ; poule A = haut, B = bas', () => {
    expect(['J1', 'J2', 'J3'].map(phaseDuTour)).toEqual(['poules', 'poules', 'poules']);
    expect(['SF', 'F'].map(phaseDuTour)).toEqual(['finale', 'finale']);
    expect(pouleDeMoitie('top')).toBe('A');
    expect(pouleDeMoitie('bottom')).toBe('B');
    expect(moitieDePoule('A')).toBe('top');
    expect(moitieDePoule('B')).toBe('bottom');
  });
});

describe('classementPoule', () => {
  it('classe par victoires', () => {
    const matchs = [
      m('a1', 'a2', 'a1', '6-4 6-4'), m('a1', 'a3', 'a1', '6-4 6-4'), m('a1', 'a4', 'a1', '6-4 6-4'),
      m('a2', 'a3', 'a2', '6-4 6-4'), m('a2', 'a4', 'a2', '6-4 6-4'),
      m('a3', 'a4', 'a3', '6-4 6-4'),
    ];
    const c = classementPoule(A, matchs);
    expect(c.map((l) => [l.playerId, l.rang, l.victoires])).toEqual([['a1', 1, 3], ['a2', 2, 2], ['a3', 3, 1], ['a4', 4, 0]]);
    expect(c.every((l) => !l.egalite)).toBe(true);
    expect(pouleTerminee(A, matchs)).toBe(true);
  });

  it('le nombre de victoires prime sur les jeux gagnés', () => {
    // a2 et a3 : 2 victoires chacun ; a3 a battu a2 (serré), a2 écrase les autres.
    const matchs = [
      m('a1', 'a2', 'a1', '7-6 7-6'), m('a1', 'a3', 'a3', '0-6 0-6'), m('a1', 'a4', 'a1', '6-0 6-0'),
      m('a2', 'a3', 'a3', '6-7 6-7'), m('a2', 'a4', 'a2', '6-0 6-0'),
      m('a3', 'a4', 'a3', '6-0 6-0'),
    ];
    // Victoires : a1 2, a2 1, a3 3 ... recalcul : a3 3, a1 2, a2 1.
    const c = classementPoule(A, matchs);
    expect(c.map((l) => l.playerId)).toEqual(['a3', 'a1', 'a2', 'a4']);
  });
  it('deux ex æquo à 2 victoires : le vainqueur du duel direct passe devant, même avec moins de jeux', () => {
    // a1 : bat a3 et a4 (6-0 6-0), perd contre a2. a2 : bat a1 (7-6 7-6) et a3, perd contre a4.
    // a3 : bat a4. a4 : bat a2. Victoires : a1 2, a2 2, a3 1, a4 1.
    const matchs = [
      m('a1', 'a2', 'a2', '6-7 6-7'), m('a1', 'a3', 'a1', '6-0 6-0'), m('a1', 'a4', 'a1', '6-0 6-0'),
      m('a2', 'a3', 'a2', '6-4 6-4'), m('a2', 'a4', 'a4', '4-6 4-6'),
      m('a3', 'a4', 'a3', '6-4 6-4'),
    ];
    const c = classementPoule(A, matchs);
    expect(c.map((x) => [x.playerId, x.rang, x.victoires])).toEqual([['a2', 1, 2], ['a1', 2, 2], ['a3', 3, 1], ['a4', 4, 1]]);
    expect(c.every((x) => !x.egalite)).toBe(true);
  });
  it('trois ex æquo (circulaire) : pourcentage de sets, puis de jeux, sur leurs matchs entre eux', () => {
    // a1 > a2, a2 > a3, a3 > a1 ; tous battent a4. Chacun 2 victoires.
    const matchs = [
      m('a1', 'a2', 'a1', '6-0 6-0'), m('a2', 'a3', 'a2', '6-4 6-4'), m('a3', 'a1', 'a3', '6-4 3-6 6-4'),
      m('a1', 'a4', 'a1', '6-0 6-0'), m('a2', 'a4', 'a2', '6-0 6-0'), m('a3', 'a4', 'a3', '6-0 6-0'),
    ];
    // Entre eux : a1 sets 2-0 puis 1-2 = 3 gagnés, 2 perdus ; a2 : 0-2 puis 2-0 = 2 gagnés, 2 perdus ;
    // a3 : 2-0... a3 gagne 2 sets contre a1 (6-4, 6-4 le dernier), perd 1, et 0-2 contre a2 : 2 gagnés, 3 perdus.
    const c = classementPoule(A, matchs);
    expect(c.slice(0, 3).map((l) => l.playerId)).toEqual(['a1', 'a2', 'a3']);
    expect(c[3]).toMatchObject({ playerId: 'a4', rang: 4, victoires: 0 });
    expect(c.slice(0, 3).every((l) => !l.egalite)).toBe(true);
  });

  it('égalité que les règles ne départagent pas : rang partagé, signalée', () => {
    // Trois joueurs, mêmes sets et mêmes jeux entre eux (circulaire parfait) : égalité totale.
    const matchs = [
      m('a1', 'a2', 'a1', '6-4 6-4'), m('a2', 'a3', 'a2', '6-4 6-4'), m('a3', 'a1', 'a3', '6-4 6-4'),
      m('a1', 'a4', 'a1', '6-0 6-0'), m('a2', 'a4', 'a2', '6-0 6-0'), m('a3', 'a4', 'a3', '6-0 6-0'),
    ];
    const c = classementPoule(A, matchs);
    expect(c.slice(0, 3).map((l) => l.rang)).toEqual([1, 1, 1]);
    expect(c.slice(0, 3).every((l) => l.egalite)).toBe(true);
    expect(c[3].rang).toBe(4);
    expect(qualifies(A, matchs)).toBeNull();
  });

  it('en cours de poule : classement provisoire, poule non terminée', () => {
    const matchs = [m('a1', 'a2', 'a1', '6-4 6-4'), m('a3', 'a4', null)];
    const c = classementPoule(A, matchs);
    expect(c[0]).toMatchObject({ playerId: 'a1', victoires: 1, joues: 1 });
    expect(pouleTerminee(A, matchs)).toBe(false);
    expect(qualifies(A, matchs)).toBeNull();
  });

  it('cumule sets et jeux (un set perdu compte pour l\'adversaire)', () => {
    const c = classementPoule(A, [m('a1', 'a2', 'a1', '6-4 3-6 7-5')]);
    const a1 = c.find((l) => l.playerId === 'a1')!;
    const a2 = c.find((l) => l.playerId === 'a2')!;
    expect([a1.setsGagnes, a1.setsPerdus, a1.jeuxGagnes, a1.jeuxPerdus]).toEqual([2, 1, 16, 15]);
    expect([a2.setsGagnes, a2.setsPerdus, a2.jeuxGagnes, a2.jeuxPerdus]).toEqual([1, 2, 15, 16]);
  });
});

describe('qualifiés et demies croisées', () => {
  const complet = [
    m('a1', 'a2', 'a1', '6-4 6-4'), m('a1', 'a3', 'a1', '6-4 6-4'), m('a1', 'a4', 'a1', '6-4 6-4'),
    m('a2', 'a3', 'a2', '6-4 6-4'), m('a2', 'a4', 'a2', '6-4 6-4'), m('a3', 'a4', 'a3', '6-4 6-4'),
  ];
  it('les deux premiers d\'une poule terminée', () => {
    expect(qualifies(A, complet)).toEqual(['a1', 'a2']);
  });

  it('égalité entre le 2e et le 3e : on ne sait pas qui passe', () => {
    // a1 3 v ; a2, a3, a4 à 1 v chacun, circulaire parfait entre eux.
    const matchs = [
      m('a1', 'a2', 'a1', '6-4 6-4'), m('a1', 'a3', 'a1', '6-4 6-4'), m('a1', 'a4', 'a1', '6-4 6-4'),
      m('a2', 'a3', 'a2', '6-4 6-4'), m('a3', 'a4', 'a3', '6-4 6-4'), m('a4', 'a2', 'a4', '6-4 6-4'),
    ];
    expect(qualifies(A, matchs)).toBeNull();
  });

  it('demies croisées : 1er A - 2e B et 1er B - 2e A', () => {
    expect(demisFinales(['a1', 'a2'], ['b1', 'b2'])).toEqual([['a1', 'b2'], ['b1', 'a2']]);
  });
});

describe('pointsPronostic', () => {
  const prono: PronosticMasters = {
    classementA: ['a1', 'a2', 'a3', 'a4'],
    classementB: ['b1', 'b2', 'b3', 'b4'],
    vainqueursDemis: ['a1', 'b1'],
    champion: 'a1',
  };

  it('le barème fait 64 points au maximum', () => {
    expect(MAX_PRONOSTIC).toBe(64);
  });

  it('pronostic parfait : 64 points', () => {
    const reel: ReelMasters = { classementA: ['a1', 'a2', 'a3', 'a4'], classementB: ['b1', 'b2', 'b3', 'b4'], finalistes: ['a1', 'b1'], champion: 'a1' };
    expect(pointsPronostic(prono, reel)).toMatchObject({ qualifies: 16, places: 16, finalistes: 16, champion: 16, total: 64, maxRestant: 64 });
  });

  it('qualifié trouvé même mal classé (4 pts) et place exacte (2 pts)', () => {
    // Poule A réelle : a2, a1, a4, a3 -> a1 et a2 qualifiés (2 x 4), aucune place exacte. Poule B inconnue.
    const reel: ReelMasters = { classementA: ['a2', 'a1', 'a4', 'a3'], classementB: null, finalistes: null, champion: null };
    const p = pointsPronostic(prono, reel);
    expect(p).toMatchObject({ qualifies: 8, places: 0, finalistes: 0, champion: 0, total: 8 });
    // Reste atteignable : poule B (2x4 + 4x2 = 16) + finalistes 16 + champion 16 = 48.
    expect(p.maxRestant).toBe(8 + 48);
  });

  it('un finaliste compte quel que soit son parcours (il gagne l\'autre demie que celle du pronostic)', () => {
    // Le pronostic donnait a1 vainqueur de la demie « a1-b2 » et b1 de « b1-a2 ». Réel : finale a1 - b1 inchangée,
    // mais ici b2 bat a1 en demie et a2 bat b1 : finalistes b2 et a2, aucun dans le pronostic.
    const reelAutre: ReelMasters = { classementA: null, classementB: null, finalistes: ['b2', 'a2'], champion: 'b2' };
    expect(pointsPronostic(prono, reelAutre).finalistes).toBe(0);
    // Finalistes a2 et b1 : b1 est pronostiqué finaliste (via l'autre demie), 8 pts.
    const reelMix: ReelMasters = { classementA: null, classementB: null, finalistes: ['a2', 'b1'], champion: 'b1' };
    const p = pointsPronostic(prono, reelMix);
    expect(p.finalistes).toBe(8);
    expect(p.champion).toBe(0); // champion pronostiqué = a1
  });

  it('champion trouvé : 16 pts', () => {
    const reel: ReelMasters = { classementA: null, classementB: null, finalistes: ['a1', 'b3'], champion: 'a1' };
    expect(pointsPronostic(prono, reel)).toMatchObject({ finalistes: 8, champion: 16 });
  });
});

describe('validerPronostic', () => {
  const poules = { A: ['a1', 'a2', 'a3', 'a4'], B: ['b1', 'b2', 'b3', 'b4'] };
  const bon: PronosticMasters = { classementA: ['a2', 'a1', 'a3', 'a4'], classementB: ['b1', 'b2', 'b3', 'b4'], vainqueursDemis: ['b2', 'a1'], champion: 'a1' };

  it('un pronostic cohérent est valide', () => {
    // Demies : [a2 - b2] et [b1 - a1]. Vainqueurs b2 (demie 1) et a1 (demie 2) : champion a1.
    expect(validerPronostic({ ...bon, vainqueursDemis: ['a2', 'a1'] }, poules)).toEqual([]);
    expect(validerPronostic(bon, poules)).toEqual([]);
  });

  it('classement incomplet ou avec un joueur d\'une autre poule : refusé', () => {
    expect(validerPronostic({ ...bon, classementA: ['a1', 'a2', 'a3', 'b1'] }, poules)).toHaveLength(1);
    expect(validerPronostic({ ...bon, classementB: ['b1', 'b1', 'b3', 'b4'] }, poules)).toHaveLength(1);
  });

  it('vainqueur de demie qui n\'est pas dans cette demie, champion qui n\'est pas finaliste : refusés', () => {
    expect(validerPronostic({ ...bon, vainqueursDemis: ['a1', 'a1'] }, poules).length).toBeGreaterThan(0);
    expect(validerPronostic({ ...bon, champion: 'b3' }, poules).some((e) => e.includes('champion'))).toBe(true);
  });
});

describe('picks : un joueur une fois par phase', () => {
  it('poules : trois journées, trois joueurs différents par poule ; la finale repart de zéro', () => {
    const picks = [
      { round: 'J1', half: 'top' as const, playerId: 'a1' },
      { round: 'J2', half: 'top' as const, playerId: 'a2' },
      { round: 'J1', half: 'bottom' as const, playerId: 'b1' },
    ];
    expect([...joueursDejaPris(picks, 'J3')].sort()).toEqual(['a1', 'a2', 'b1']);
    // Phase finale : les picks de poules ne comptent plus.
    expect(joueursDejaPris(picks, 'SF').size).toBe(0);
  });

  it('en phase finale, la demie compte pour la finale et inversement', () => {
    const picks = [{ round: 'SF', half: null, playerId: 'a1' }];
    expect([...joueursDejaPris(picks, 'F')]).toEqual(['a1']);
    expect(joueursDejaPris(picks, 'SF').size).toBe(0); // le pick du même tour n'est pas « déjà pris » : on peut le changer
  });

  it('verifierPicksMasters : repiquer un joueur dans la même phase est refusé, pas entre phases', () => {
    expect(verifierPicksMasters([{ round: 'J1', half: 'top', playerId: 'a1' }, { round: 'J3', half: 'top', playerId: 'a1' }])).toHaveLength(1);
    expect(verifierPicksMasters([{ round: 'J1', half: 'top', playerId: 'a1' }, { round: 'SF', half: null, playerId: 'a1' }])).toEqual([]);
    expect(verifierPicksMasters([{ round: 'SF', half: null, playerId: 'a1' }, { round: 'F', half: null, playerId: 'a1' }])).toHaveLength(1);
  });
});
