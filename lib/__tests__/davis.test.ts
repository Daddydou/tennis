import { describe, expect, it } from 'vitest';
import {
  MAX_BRACKET,
  bracketFerme,
  doublePossible,
  ecartJeux,
  matchJoue,
  memeNation,
  moitieDeRencontre,
  nationsAttendues,
  nationsPickables,
  orienterSets,
  parserScore,
  pointsBracketRencontre,
  pointsParticipant,
  pointsPick,
  pointsPronosRencontre,
  pronosFermes,
  resultatRencontre,
  scoreEnSets,
  validerPick,
  validerResultatMatch,
  type MatchDavis,
  type OrdreMatch,
  type RencontreDavis,
  type StatutMatchDavis,
  type TourDavis,
} from '../davis';

/** Fabrique un match : `sets` écrits « jeux du côté 1 - jeux du côté 2 ». */
function match(ordre: OrdreMatch, gagnant: 1 | 2 | null, sets: [number, number][], statut: StatutMatchDavis = 'termine'): MatchDavis {
  return { ordre, joueur1: null, joueur2: null, statut, gagnant, sets: sets.map(([g1, g2]) => ({ g1, g2 })) };
}

function rencontre(
  id: string,
  tour: TourDavis,
  position: number,
  nation1: string | null,
  nation2: string | null,
  matchs: MatchDavis[] = [],
  debut: string | null = null,
): RencontreDavis {
  return { id, tour, position, nation1, nation2, debut, matchs };
}

// Exemple 1 des règles : l'Italie gagne 2-0 (6-3 6-4, 6-2 6-1).
const italieAllemagne = () =>
  rencontre('q1', 'QF', 1, 'Italie', 'Argentine', [
    match(1, 1, [[6, 3], [6, 4]]),
    match(2, 1, [[6, 2], [6, 1]]),
    match(3, null, [], 'non_joue'),
  ]);

// Exemple 2 des règles : l'Allemagne bat le Royaume-Uni 2-1 (Draper gagne 7-6 6-4,
// l'Allemagne 6-4 3-6 6-3 puis le double 7-6 7-6).
const allemagneRoyaumeUni = () =>
  rencontre('q2', 'QF', 2, 'Allemagne', 'Royaume-Uni', [
    match(1, 2, [[6, 7], [4, 6]]),
    match(2, 1, [[6, 4], [3, 6], [6, 3]]),
    match(3, 1, [[7, 6], [7, 6]]),
  ]);

describe('exemples des règles (picks)', () => {
  it('Italie 2-0 : 5 + 3×2 + écarts de jeux (+5, +9) = 25', () => {
    const r = italieAllemagne();
    expect(pointsPick([r], { slot: 'QF-top', nation: 'Italie' })).toBe(25);
    // L'Argentine, battue sans match gagné, n'a rien.
    expect(pointsPick([r], { slot: 'QF-top', nation: 'Argentine' })).toBe(0);
  });

  it('Allemagne 2-1 : 12 points, Royaume-Uni battu : 3 points', () => {
    const r = allemagneRoyaumeUni();
    expect(pointsPick([r], { slot: 'QF-top', nation: 'Allemagne' })).toBe(12);
    expect(pointsPick([r], { slot: 'QF-top', nation: 'Royaume-Uni' })).toBe(3);
  });

  it('rien tant que la rencontre n’est pas décidée', () => {
    const r = rencontre('q', 'QF', 1, 'Italie', 'Argentine', [match(1, 1, [[6, 3], [6, 4]])]);
    expect(pointsPick([r], { slot: 'QF-top', nation: 'Italie' })).toBeNull();
  });
});

describe('écart de jeux', () => {
  it('plancher à 0 match par match : 7-6 0-6 7-6 vaut 0, pas −4', () => {
    expect(ecartJeux(match(1, 1, [[7, 6], [0, 6], [7, 6]]))).toBe(0);
  });

  it('forfait : aucun jeu ; abandon : seuls les sets entièrement joués comptent', () => {
    expect(ecartJeux(match(1, 1, [], 'forfait'))).toBe(0);
    // 6-3 puis abandon à 2-1 dans le deuxième set : le set interrompu ne compte pas.
    expect(ecartJeux(match(1, 1, [[6, 3], [2, 1]], 'abandon'))).toBe(3);
    // Du point de vue du côté 2 : mêmes jeux, signe inversé.
    expect(ecartJeux(match(1, 2, [[3, 6], [1, 2]], 'abandon'))).toBe(3);
  });

  it('un match sans vainqueur ne rapporte rien', () => {
    expect(ecartJeux(match(1, null, [[6, 3]], 'en_cours'))).toBe(0);
    expect(matchJoue(match(1, null, [[6, 3]], 'en_cours'))).toBe(false);
  });
});

describe('résultat d’une rencontre', () => {
  it('2-0 : le double n’est pas joué', () => {
    const res = resultatRencontre(italieAllemagne());
    expect(res.gagnant).toBe(1);
    expect(res.score).toBe('2-0');
    expect(doublePossible(italieAllemagne())).toBe(false);
  });

  it('1-1 après les simples : le double est possible, puis décide', () => {
    const r = allemagneRoyaumeUni();
    expect(doublePossible(r)).toBe(true);
    expect(resultatRencontre(r)).toMatchObject({ gagnant: 1, score: '2-1', victoires: [2, 1] });
  });

  it('pas décidée à 1-0', () => {
    const r = rencontre('q', 'QF', 1, 'A', 'B', [match(1, 1, [[6, 3], [6, 4]])]);
    expect(resultatRencontre(r).gagnant).toBeNull();
  });

  it('score en sets : 2-0, 2-1, null sur forfait', () => {
    expect(scoreEnSets(match(1, 1, [[6, 3], [6, 4]]))).toBe('2-0');
    expect(scoreEnSets(match(1, 1, [[6, 4], [3, 6], [6, 3]]))).toBe('2-1');
    expect(scoreEnSets(match(1, 2, [[6, 7], [4, 6]]))).toBe('2-0');
    expect(scoreEnSets(match(1, 1, [], 'forfait'))).toBeNull();
  });
});

describe('bracket des nations', () => {
  it('36 points au maximum', () => {
    expect(MAX_BRACKET).toBe(36);
  });

  it('bonne nation + bon score ; le score ne compte qu’avec la bonne nation', () => {
    const r = italieAllemagne();
    expect(pointsBracketRencontre({ tour: 'QF', position: 1, nation: 'Italie', score: '2-0' }, r)).toEqual({ nation: 2, score: 1, total: 3 });
    expect(pointsBracketRencontre({ tour: 'QF', position: 1, nation: 'Italie', score: '2-1' }, r)).toEqual({ nation: 2, score: 0, total: 2 });
    expect(pointsBracketRencontre({ tour: 'QF', position: 1, nation: 'Argentine', score: '2-0' }, r)).toEqual({ nation: 0, score: 0, total: 0 });
  });

  it('barème des demies (4 + 2) et de la finale (8 + 4)', () => {
    const demi = rencontre('s', 'SF', 1, 'Italie', 'Allemagne', [match(1, 1, [[6, 3], [6, 4]]), match(2, 1, [[6, 2], [6, 1]])]);
    expect(pointsBracketRencontre({ tour: 'SF', position: 1, nation: 'Italie', score: '2-0' }, demi)?.total).toBe(6);
    const finale = rencontre('f', 'F', 1, 'Italie', 'Allemagne', [match(1, 2, [[3, 6], [4, 6]]), match(2, 2, [[2, 6], [1, 6]])]);
    expect(pointsBracketRencontre({ tour: 'F', position: 1, nation: 'Allemagne', score: '2-0' }, finale)?.total).toBe(12);
  });

  it('rien tant que la rencontre n’est pas décidée', () => {
    const r = rencontre('q', 'QF', 1, 'A', 'B');
    expect(pointsBracketRencontre({ tour: 'QF', position: 1, nation: 'A', score: '2-0' }, r)).toBeNull();
  });
});

describe('pronos des matchs', () => {
  it('exemple des règles : deux simples justes en deux sets + carton plein = 8 points en quart', () => {
    const r = italieAllemagne();
    const pronos = [
      { rencontreId: 'q1', ordre: 1 as const, nation: 'Italie', sets: '2-0' as const },
      { rencontreId: 'q1', ordre: 2 as const, nation: 'Italie', sets: '2-0' as const },
    ];
    const res = pointsPronosRencontre(pronos, r);
    expect(res.carton).toBe(true);
    expect(res.brut).toBe(8);
    expect(res.total).toBe(8);
  });

  it('multiplié par le tour, carton plein compris', () => {
    const demi = rencontre('s', 'SF', 1, 'Italie', 'Allemagne', [match(1, 1, [[6, 3], [6, 4]]), match(2, 1, [[6, 2], [6, 1]])]);
    const pronos = [
      { rencontreId: 's', ordre: 1 as const, nation: 'Italie', sets: '2-0' as const },
      { rencontreId: 's', ordre: 2 as const, nation: 'Italie', sets: '2-0' as const },
    ];
    expect(pointsPronosRencontre(pronos, demi).total).toBe(16);
    const finale = { ...demi, id: 'f', tour: 'F' as const };
    expect(pointsPronosRencontre(pronos.map((p) => ({ ...p, rencontreId: 'f' })), finale).total).toBe(24);
  });

  it('bonne nation sans le bon score : 2 points, pas de carton plein', () => {
    const r = italieAllemagne();
    const pronos = [
      { rencontreId: 'q1', ordre: 1 as const, nation: 'Italie', sets: '2-1' as const },
      { rencontreId: 'q1', ordre: 2 as const, nation: 'Italie', sets: '2-0' as const },
    ];
    const res = pointsPronosRencontre(pronos, r);
    expect(res.carton).toBe(false);
    expect(res.brut).toBe(2 + 3);
  });

  it('le double pas joué ne compte pas, même pronostiqué', () => {
    const r = italieAllemagne();
    const pronos = [
      { rencontreId: 'q1', ordre: 1 as const, nation: 'Italie', sets: '2-0' as const },
      { rencontreId: 'q1', ordre: 2 as const, nation: 'Italie', sets: '2-0' as const },
      { rencontreId: 'q1', ordre: 3 as const, nation: 'Argentine', sets: '2-0' as const },
    ];
    const res = pointsPronosRencontre(pronos, r);
    expect(res.details).toHaveLength(2);
    expect(res.carton).toBe(true);
  });

  it('trois matchs joués : carton plein seulement si les trois sont justes', () => {
    const r = allemagneRoyaumeUni();
    const justes = [
      { rencontreId: 'q2', ordre: 1 as const, nation: 'Royaume-Uni', sets: '2-0' as const },
      { rencontreId: 'q2', ordre: 2 as const, nation: 'Allemagne', sets: '2-1' as const },
      { rencontreId: 'q2', ordre: 3 as const, nation: 'Allemagne', sets: '2-0' as const },
    ];
    expect(pointsPronosRencontre(justes, r)).toMatchObject({ carton: true, brut: 3 + 3 + 3 + 2 });
    const unRate = justes.map((p) => (p.ordre === 3 ? { ...p, nation: 'Royaume-Uni' } : p));
    expect(pointsPronosRencontre(unRate, r)).toMatchObject({ carton: false, brut: 3 + 3 });
  });

  it('forfait : seul le vainqueur compte, pas de bonus de score, carton plein possible', () => {
    const r = rencontre('q', 'QF', 1, 'Italie', 'Argentine', [match(1, 1, [], 'forfait'), match(2, 1, [[6, 3], [6, 4]])]);
    const res = pointsPronosRencontre(
      [
        { rencontreId: 'q', ordre: 1, nation: 'Italie', sets: '2-0' },
        { rencontreId: 'q', ordre: 2, nation: 'Italie', sets: '2-0' },
      ],
      r,
    );
    expect(res.details[0]).toMatchObject({ nationJuste: true, setsJustes: false, points: 2 });
    expect(res.carton).toBe(true);
    expect(res.brut).toBe(2 + 3 + 2);
  });

  it('pas de carton plein tant que la rencontre n’est pas décidée', () => {
    const r = rencontre('q', 'QF', 1, 'Italie', 'Argentine', [match(1, 1, [[6, 3], [6, 4]])]);
    const res = pointsPronosRencontre([{ rencontreId: 'q', ordre: 1, nation: 'Italie', sets: '2-0' }], r);
    expect(res.carton).toBe(false);
    expect(res.brut).toBe(3);
  });
});

describe('picks : validation', () => {
  const rencontres = [
    rencontre('q1', 'QF', 1, 'Italie', 'Argentine'),
    rencontre('q2', 'QF', 2, 'Allemagne', 'Royaume-Uni'),
    rencontre('q3', 'QF', 3, 'France', 'Espagne'),
    rencontre('q4', 'QF', 4, 'Canada', 'Pays-Bas'),
    rencontre('s1', 'SF', 1, null, null),
    rencontre('s2', 'SF', 2, null, null),
    rencontre('f', 'F', 1, null, null),
  ];

  it('moitiés du tableau', () => {
    expect(moitieDeRencontre({ tour: 'QF', position: 2 })).toBe('top');
    expect(moitieDeRencontre({ tour: 'QF', position: 3 })).toBe('bottom');
    expect(moitieDeRencontre({ tour: 'F', position: 1 })).toBeNull();
  });

  it('une nation de chaque moitié', () => {
    expect(nationsPickables(rencontres, 'QF-top')).toEqual(['Italie', 'Argentine', 'Allemagne', 'Royaume-Uni']);
    expect(validerPick(rencontres, { slot: 'QF-top', nation: 'France' }, [])).toHaveLength(1);
    expect(validerPick(rencontres, { slot: 'QF-bottom', nation: 'France' }, [])).toEqual([]);
  });

  it('un pays ne se pique qu’une fois sur la compétition', () => {
    const demies = [
      rencontre('q1', 'QF', 1, 'Italie', 'Argentine'),
      rencontre('s1', 'SF', 1, 'Italie', 'France'),
    ];
    expect(validerPick(demies, { slot: 'SF', nation: 'Italie' }, [{ slot: 'QF-top', nation: 'Italie' }])).toHaveLength(1);
    expect(validerPick(demies, { slot: 'SF', nation: 'France' }, [{ slot: 'QF-top', nation: 'Italie' }])).toEqual([]);
    // Repiquer dans le même slot (changer d’avis) reste permis.
    expect(validerPick(demies, { slot: 'QF-top', nation: 'Italie' }, [{ slot: 'QF-top', nation: 'Argentine' }])).toEqual([]);
  });
});

describe('fermetures', () => {
  const avant = new Date('2026-11-18T10:00:00Z');
  const apres = new Date('2026-11-18T14:00:00Z');
  const q1 = rencontre('q1', 'QF', 1, 'A', 'B', [match(1, null, [], 'a_venir')], '2026-11-18T12:00:00Z');

  it('le bracket ferme au premier quart', () => {
    expect(bracketFerme([q1], avant)).toBe(false);
    expect(bracketFerme([q1], apres)).toBe(true);
  });

  it('les pronos ferment au début de la rencontre, ou dès qu’un match est lancé', () => {
    expect(pronosFermes(q1, avant)).toBe(false);
    expect(pronosFermes(q1, apres)).toBe(true);
    expect(pronosFermes(rencontre('q', 'QF', 1, 'A', 'B', [match(1, null, [], 'en_cours')]), avant)).toBe(true);
  });
});

describe('propagation des vainqueurs', () => {
  it('remplit demies et finale d’après les rencontres décidées', () => {
    const rencontres = [
      italieAllemagne(),
      allemagneRoyaumeUni(),
      rencontre('q3', 'QF', 3, 'France', 'Espagne'),
      rencontre('q4', 'QF', 4, 'Canada', 'Pays-Bas'),
    ];
    const attendues = nationsAttendues(rencontres);
    expect(attendues['SF-1']).toEqual({ nation1: 'Italie', nation2: 'Allemagne' });
    expect(attendues['SF-2']).toEqual({ nation1: null, nation2: null });
    expect(attendues['F-1']).toEqual({ nation1: null, nation2: null });
  });
});

describe('saisie d’un score', () => {
  it('lit les sets, avec ou sans tie-break', () => {
    expect(parserScore('6-4 3-6 7-6(5)')).toEqual([{ g1: 6, g2: 4 }, { g1: 3, g2: 6 }, { g1: 7, g2: 6 }]);
    expect(parserScore('')).toEqual([]);
    expect(parserScore('six-quatre')).toBeNull();
  });

  it('écrit du point de vue du vainqueur, rangé du côté 1', () => {
    expect(orienterSets([{ g1: 6, g2: 4 }], 2)).toEqual([{ g1: 4, g2: 6 }]);
    expect(orienterSets([{ g1: 6, g2: 4 }], 1)).toEqual([{ g1: 6, g2: 4 }]);
  });

  it('valide un résultat de match', () => {
    const gagne = (a: number, b: number) => ({ g1: a, g2: b });
    expect(validerResultatMatch('termine', 1, [gagne(6, 3), gagne(6, 4)])).toEqual([]);
    expect(validerResultatMatch('termine', 1, [gagne(6, 4), gagne(3, 6), gagne(7, 5)])).toEqual([]);
    expect(validerResultatMatch('termine', 1, [gagne(6, 4)])).not.toEqual([]);
    expect(validerResultatMatch('termine', 1, [gagne(6, 4), gagne(3, 6), gagne(5, 7)])).not.toEqual([]);
    expect(validerResultatMatch('termine', null, [gagne(6, 4), gagne(6, 4)])).not.toEqual([]);
    expect(validerResultatMatch('forfait', 2, [])).toEqual([]);
    expect(validerResultatMatch('forfait', 2, [gagne(6, 4)])).not.toEqual([]);
    expect(validerResultatMatch('abandon', 1, [gagne(6, 3), gagne(2, 1)])).toEqual([]);
    expect(validerResultatMatch('a_venir', 1, [])).not.toEqual([]);
  });
});

describe('classement', () => {
  it('additionne picks, bracket et pronos', () => {
    const rencontres = [italieAllemagne(), allemagneRoyaumeUni()];
    const total = pointsParticipant(
      rencontres,
      [{ slot: 'QF-top', nation: 'Allemagne' }],
      [{ tour: 'QF', position: 1, nation: 'Italie', score: '2-0' }],
      [
        { rencontreId: 'q1', ordre: 1, nation: 'Italie', sets: '2-0' },
        { rencontreId: 'q1', ordre: 2, nation: 'Italie', sets: '2-0' },
      ],
    );
    expect(total).toEqual({ picks: 12, bracket: 3, pronos: 8, total: 23 });
  });

  it('compare les noms sans tenir compte de la casse', () => {
    expect(memeNation(' italie', 'Italie ')).toBe(true);
    expect(memeNation(null, 'Italie')).toBe(false);
  });
});
