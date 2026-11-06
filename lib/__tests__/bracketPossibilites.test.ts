// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { possibilitesBracket, type EntreePossibilites } from '../bracketPossibilites';

/**
 * Tableau de 8 : 3 tours (quarts, demies, finale). Seul le tour 1 est visible.
 * Quarts : (1-2) (3-4) (5-6) (7-8). Joués : 1 bat 2, 4 bat 3. Pas encore joués : (5-6) et (7-8).
 * Éliminés : 2 et 3. Barème : 1 point au tour 1, 2 au tour 2, 4 au tour 3.
 */
const noms = new Map([1, 2, 3, 4, 5, 6, 7, 8].map((p) => [p, `P${p}`]));

function entree(over: Partial<EntreePossibilites> = {}): EntreePossibilites {
  return {
    drawSize: 8,
    noms,
    matchs: [
      { tour: 1, index: 0, position1: 1, position2: 2, vainqueur: 1 },
      { tour: 1, index: 1, position1: 3, position2: 4, vainqueur: 4 },
      { tour: 1, index: 2, position1: 5, position2: 6, vainqueur: null },
      { tour: 1, index: 3, position1: 7, position2: 8, vainqueur: null },
    ],
    participants: [
      { userId: 'a', pseudo: 'Alice', points: 1 },
      { userId: 'b', pseudo: 'Bob', points: 0 },
    ],
    pronostics: [
      // Alice : 1, 3, 5, 7. Bob : 2, 4, 6, 8.
      ...[1, 3, 5, 7].map((position, index) => ({ userId: 'a', tour: 1, index, position })),
      ...[2, 4, 6, 8].map((position, index) => ({ userId: 'b', tour: 1, index, position })),
    ],
    ...over,
  };
}

const de = (r: ReturnType<typeof possibilitesBracket>, pseudo: string) => r.find((x) => x.pseudo === pseudo)!;
const noms_ = (c: { candidats: { nom: string }[] }) => c.candidats.map((x) => x.nom).sort();

describe('possibilitesBracket — sans « max »', () => {
  const alice = de(possibilitesBracket(entree()), 'Alice');

  it('énumère tous les tableaux cohérents : 2 candidats par case cachée (2^3 = 8)', () => {
    expect(alice.statut).toBe('sans_max');
    expect(alice.total).toBe(8);
    expect(alice.compatibles).toBe(8);
    expect(alice.cases.map((c) => `${c.tour}|${c.match}`)).toEqual(['2|0', '2|1', '3|0']);
  });

  it('chaque demie ne propose que les pronostics des deux quarts qui l\'alimentent', () => {
    expect(noms_(alice.cases[0])).toEqual(['P1', 'P3']);
    expect(noms_(alice.cases[1])).toEqual(['P5', 'P7']);
  });

  it('marque les joueurs éliminés (P3 a perdu) ; la finale ne reprend que les gagnants de demie possibles', () => {
    expect(alice.cases[0].candidats.find((c) => c.nom === 'P3')?.vivant).toBe(false);
    expect(alice.cases[0].candidats.find((c) => c.nom === 'P1')?.vivant).toBe(true);
    expect(noms_(alice.cases[2])).toEqual(['P1', 'P3', 'P5', 'P7']);
    expect(alice.champion).toHaveLength(4);
  });

  it('points encore possibles sur le tour visible : les matchs pas joués dont le pick est vivant', () => {
    // Alice : picks 5 et 7 sur deux matchs en attente, vivants : 2 x 1 point.
    expect(alice.visibles).toBe(2);
  });

  it('bornes : minimum et maximum atteignables', () => {
    // 1 point acquis + 2 visibles ; hidden : min = P3 (mort) en demie 0 + 5/7 en demie 1 (2) + finale morte = 2 ;
    // max = P1 (2) + P5/P7 (2) + finale vivante (4) = 8.
    expect(alice.bornes).toEqual({ min: 1 + 2 + 2, max: 1 + 2 + 8 });
  });

  it('Bob : ses picks P2 et P4 : P2 est éliminé, P4 vivant', () => {
    const bob = de(possibilitesBracket(entree()), 'Bob');
    expect(noms_(bob.cases[0])).toEqual(['P2', 'P4']);
    expect(bob.cases[0].candidats.find((c) => c.nom === 'P2')?.vivant).toBe(false);
  });
});

describe('possibilitesBracket — avec « max »', () => {
  it('le max ne garde que les tableaux dont le potentiel colle exactement', () => {
    // Potentiel hidden = 6 : demie 0 morte (0) + demie 1 vivante (2) + finale vivante (4).
    const r = possibilitesBracket(entree({ max: { Alice: 1 + 2 + 6 } }));
    const alice = de(r, 'Alice');
    expect(alice.statut).toBe('avec_max');
    expect(alice.total).toBe(8);
    expect(alice.compatibles).toBe(2);
    // Demie 0 : P3 (éliminé) certain ; finale = le gagnant de la demie 1.
    expect(alice.cases[0].certain).toBe(true);
    expect(alice.cases[0].candidats[0]).toMatchObject({ nom: 'P3', vivant: false, part: 1 });
    expect(noms_(alice.cases[1])).toEqual(['P5', 'P7']);
    expect(alice.bornes).toEqual({ min: 9, max: 9 });
  });

  it('max impossible (périmé ou erroné) : incohérent, aucune case annoncée', () => {
    // Potentiels cachés possibles : 2, 4, 6 ou 8. Un max de 4 laisse 1 point : impossible.
    const alice = de(possibilitesBracket(entree({ max: { Alice: 4 } })), 'Alice');
    expect(alice.statut).toBe('incoherent');
    expect(alice.cases).toEqual([]);
    expect(alice.compatibles).toBe(0);
  });

  it('le max d\'un participant ne touche pas les autres', () => {
    const r = possibilitesBracket(entree({ max: { Alice: 9 } }));
    expect(de(r, 'Bob').statut).toBe('sans_max');
  });
});

describe('possibilitesBracket — cas limites', () => {
  it('tableau qui n\'est pas une puissance de 2 : rien', () => {
    expect(possibilitesBracket(entree({ drawSize: 6 }))).toEqual([]);
  });

  it('aucun pronostic visible : rien à déduire', () => {
    expect(de(possibilitesBracket(entree({ pronostics: [] })), 'Alice').statut).toBe('rien_a_deduire');
  });

  it('tout est visible (tous les tours verrouillés) : rien à déduire', () => {
    const pronostics = [
      ...entree().pronostics,
      { userId: 'a', tour: 2, index: 0, position: 1 },
      { userId: 'a', tour: 2, index: 1, position: 5 },
      { userId: 'a', tour: 3, index: 0, position: 1 },
    ];
    expect(de(possibilitesBracket(entree({ pronostics })), 'Alice').statut).toBe('rien_a_deduire');
  });

  it('un seul tour visible sur un grand tableau : trop de tableaux pour les énumérer', () => {
    const e = entree({ drawSize: 128 });
    expect(de(possibilitesBracket(e), 'Alice').statut).toBe('trop_grand');
  });

  it('un participant qui n\'a rien rempli à un tour visible : aucune possibilité annoncée', () => {
    const r = possibilitesBracket(entree({ pronostics: entree().pronostics.filter((p) => p.userId !== 'b') }));
    expect(de(r, 'Bob').statut).toBe('rien_a_deduire');
    expect(de(r, 'Alice').statut).toBe('sans_max');
  });
});
