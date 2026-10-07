// @vitest-environment node
/**
 * Pont bracket de Thomas -> tn_bracket_round_picks — lib/bracketExternePont.ts.
 * Tableaux synthétiques (pas besoin du fichier gitignoré) : la vérification
 * sur l'US Open WTA 2026 réel se fait par l'aperçu du script.
 */
import { describe, expect, it } from 'vitest';
import type { BracketThomas, MatchThomas } from '../thomasApi';
import {
  correspondanceTours,
  deriverPronostics,
  joueurDePosition,
  planifierEcriture,
  verifierJoueurs,
  type MatchInterne,
} from '../bracketExternePont';

const NOMS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
const LAKI = 'id-laki';
const THOMAS = 'id-thomas';
const PARTICIPANTS = [
  { id: LAKI, name: 'Laki' },
  { id: THOMAS, name: 'Thomas' },
];

/** Tableau interne de 8 : QF positions 0..3, joueur à la position p = `j${p}`. */
function interne8(): { matchs: MatchInterne[]; noms: Map<string, string> } {
  const matchs: MatchInterne[] = [0, 1, 2, 3].map((i) => ({
    round: 'QF',
    position: i,
    player1Id: `j${2 * i + 1}`,
    player2Id: `j${2 * i + 2}`,
  }));
  const noms = new Map(NOMS.map((n, i) => [`j${i + 1}`, `${n[0]}. ${n}`]));
  return { matchs, noms };
}

const prono = (userId: string, position: number | null) => ({
  userId,
  position,
  resultat: 'en_attente' as const,
  joueurAbsent: false,
});

/**
 * Bracket de Thomas de 8 : chaque participant pronostique la position la
 * plus basse de chaque match (Daddy), la plus haute (Laki), rien (moustiton
 * au tour 1, puis la plus basse).
 */
function thomas8(): BracketThomas {
  const tours = [1, 2, 3].map((t) => {
    const bloc = 2 ** t;
    const matchs: MatchThomas[] = Array.from({ length: 8 / bloc }, (_, i) => {
      const bas = i * bloc + 1;
      const haut = (i + 1) * bloc;
      return {
        index: i,
        position1: t === 1 ? bas : null,
        position2: t === 1 ? haut : null,
        vainqueur: null,
        score: null,
        pronostics: [prono('u-daddy', bas), prono('u-laki', haut), prono('u-moust', t === 1 ? null : bas)],
      };
    });
    return { tour: t, nom: `Tour ${t}`, statut: 'A_VENIR', matchs };
  });
  return {
    jeu: 'bracket',
    jeuTennis: 'tennis',
    tournoi: {
      id: 'thomas-1',
      nom: 'Test',
      tour: 'ATP',
      annee: 2026,
      type: 'ATP_500',
      surface: 'HARD',
      lieu: 'Ici',
      drawSize: 8,
      statut: 'EN_COURS',
      verrouille: true,
      lockAt: null,
    },
    participants: [
      { userId: 'u-daddy', pseudo: 'Daddy', rempli: true, pointsTotaux: 0 },
      { userId: 'u-laki', pseudo: 'Laki', rempli: true, pointsTotaux: 0 },
      { userId: 'u-moust', pseudo: 'moustiton', rempli: true, pointsTotaux: 0 },
    ],
    joueurs: NOMS.map((n, i) => ({
      position: i + 1,
      prenom: `${n[0]}${n.slice(1).toLowerCase()}a`,
      nom: n.toUpperCase(),
      tete: null,
      statut: null,
      pays: null,
      classement: null,
      apiPlayerId: `api-${i + 1}`, // volontairement ≠ de notre id : jamais utilisé
    })),
    tours,
  };
}

describe('correspondanceTours', () => {
  it('même taille : tour 1 = premier tour, dernier tour = finale', () => {
    const c = correspondanceTours(128, ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F']);
    if (!c.ok) throw new Error(c.erreur);
    expect(c.decalage).toBe(0);
    expect(c.premierRound).toBe('R128');
    expect(c.roundDuTour(1)).toBe('R128');
    expect(c.roundDuTour(7)).toBe('F');
  });

  it('tableau de Thomas plus petit (96 vu comme 64 dès le R64) : décalage d’un tour', () => {
    const c = correspondanceTours(64, ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F']);
    if (!c.ok) throw new Error(c.erreur);
    expect(c.decalage).toBe(1);
    expect(c.premierRound).toBe('R64');
    expect(c.roundDuTour(1)).toBe('R64');
    expect(c.roundDuTour(6)).toBe('F');
  });

  it('cas limite : tableau de 2, un seul match (la finale)', () => {
    const c = correspondanceTours(2, ['F']);
    if (!c.ok) throw new Error(c.erreur);
    expect(c.roundDuTour(1)).toBe('F');
  });

  it('refuse un drawSize qui n’est pas une puissance de 2, ou plus grand que notre tableau', () => {
    expect(correspondanceTours(96, ['R128', 'R64']).ok).toBe(false);
    expect(correspondanceTours(128, ['R32', 'R16', 'QF', 'SF', 'F']).ok).toBe(false);
    expect(correspondanceTours(4, []).ok).toBe(false);
  });
});

describe('joueurDePosition', () => {
  const premier = new Map(interne8().matchs.map((m) => [m.position, m]));

  it('position impaire = player1, paire = player2, du match floor((p−1)/2)', () => {
    expect(joueurDePosition(1, premier)).toBe('j1');
    expect(joueurDePosition(2, premier)).toBe('j2');
    expect(joueurDePosition(5, premier)).toBe('j5');
    expect(joueurDePosition(8, premier)).toBe('j8');
  });

  it('exemption ou match absent : null', () => {
    const avecBye = new Map(premier);
    avecBye.set(0, { round: 'QF', position: 0, player1Id: 'j1', player2Id: null });
    expect(joueurDePosition(2, avecBye)).toBeNull();
    expect(joueurDePosition(9, premier)).toBeNull();
  });
});

describe('verifierJoueurs', () => {
  it('mêmes joueurs aux mêmes positions : aucune erreur, malgré des apiPlayerId différents', () => {
    const { matchs, noms } = interne8();
    expect(verifierJoueurs(thomas8(), new Map(matchs.map((m) => [m.position, m])), noms)).toEqual([]);
  });

  it('deux joueurs inversés chez nous : les deux positions sont signalées', () => {
    const { matchs, noms } = interne8();
    matchs[0] = { ...matchs[0], player1Id: 'j2', player2Id: 'j1' };
    const erreurs = verifierJoueurs(thomas8(), new Map(matchs.map((m) => [m.position, m])), noms);
    expect(erreurs).toHaveLength(2);
    expect(erreurs[0]).toContain('Position 1');
  });

  it('place vide chez nous : signalée', () => {
    const { matchs, noms } = interne8();
    matchs[3] = { ...matchs[3], player2Id: null };
    expect(verifierJoueurs(thomas8(), new Map(matchs.map((m) => [m.position, m])), noms)).toEqual([
      'Position 8 (Hotela HOTEL) : aucun joueur à cette place chez nous.',
    ]);
  });
});

describe('deriverPronostics', () => {
  it('traduit tour/index/position en round/position/player_id, pour les trois stocks', () => {
    const { matchs, noms } = interne8();
    const d = deriverPronostics(thomas8(), ['QF', 'SF', 'F'], matchs, noms, PARTICIPANTS);
    if (!d.ok) throw new Error(d.erreurs.join('\n'));
    const de = (stock: string | null) =>
      d.pronostics.filter((p) => p.participantId === stock).map((p) => `${p.round}|${p.position}=${p.playerId}`);
    expect(de(null)).toEqual(['QF|0=j1', 'QF|1=j3', 'QF|2=j5', 'QF|3=j7', 'SF|0=j1', 'SF|1=j5', 'F|0=j1']);
    expect(de(LAKI)).toEqual(['QF|0=j2', 'QF|1=j4', 'QF|2=j6', 'QF|3=j8', 'SF|0=j4', 'SF|1=j8', 'F|0=j8']);
    // moustiton -> Thomas ; ses 4 matchs sans pronostic au tour 1 sont ignorés.
    expect(de(THOMAS)).toEqual(['SF|0=j1', 'SF|1=j5', 'F|0=j1']);
    expect(d.sansPronostic).toBe(4);
    expect(d.pseudosInconnus).toEqual([]);
  });

  it('pseudo inconnu : ses pronostics sont ignorés et signalés, les autres passent', () => {
    const { matchs, noms } = interne8();
    const b = thomas8();
    b.participants[2] = { ...b.participants[2], pseudo: 'nouveau' };
    const d = deriverPronostics(b, ['QF', 'SF', 'F'], matchs, noms, PARTICIPANTS);
    if (!d.ok) throw new Error(d.erreurs.join('\n'));
    expect(d.pseudosInconnus).toEqual(['nouveau']);
    expect(d.pronostics.some((p) => p.participantId === THOMAS)).toBe(false);
    expect(d.pronostics).toHaveLength(14);
  });

  it('décalage : tableau de 4 chez Thomas posé sur nos SF/F', () => {
    const b = thomas8();
    b.tournoi.drawSize = 4;
    b.joueurs = [
      { ...b.joueurs[0], position: 1 },
      { ...b.joueurs[3], position: 2 },
      { ...b.joueurs[4], position: 3 },
      { ...b.joueurs[7], position: 4 },
    ];
    b.tours = [
      {
        tour: 1,
        nom: 'Demies',
        statut: 'A_VENIR',
        matchs: [
          { index: 0, position1: 1, position2: 2, vainqueur: null, score: null, pronostics: [prono('u-daddy', 2)] },
          { index: 1, position1: 3, position2: 4, vainqueur: null, score: null, pronostics: [prono('u-daddy', 3)] },
        ],
      },
      { tour: 2, nom: 'Finale', statut: 'A_VENIR', matchs: [{ index: 0, position1: null, position2: null, vainqueur: null, score: null, pronostics: [prono('u-daddy', 3)] }] },
    ];
    const { noms } = interne8();
    const sf: MatchInterne[] = [
      { round: 'SF', position: 0, player1Id: 'j1', player2Id: 'j4' },
      { round: 'SF', position: 1, player1Id: 'j5', player2Id: 'j8' },
    ];
    const d = deriverPronostics(b, ['QF', 'SF', 'F'], [...interne8().matchs, ...sf], noms, PARTICIPANTS);
    if (!d.ok) throw new Error(d.erreurs.join('\n'));
    expect(d.pronostics.map((p) => `${p.round}|${p.position}=${p.playerId}`)).toEqual(['SF|0=j4', 'SF|1=j5', 'F|0=j5']);
  });

  it('tableaux non superposables : refus en bloc, aucun pronostic', () => {
    const { matchs, noms } = interne8();
    matchs[1] = { ...matchs[1], player1Id: 'j4', player2Id: 'j3' };
    const d = deriverPronostics(thomas8(), ['QF', 'SF', 'F'], matchs, noms, PARTICIPANTS);
    expect(d.ok).toBe(false);
    expect(deriverPronostics(thomas8(), ['SF', 'F'], matchs, noms, PARTICIPANTS).ok).toBe(false);
  });
});

describe('planifierEcriture', () => {
  const derives = [
    { participantId: null, round: 'QF', position: 0, playerId: 'j1' },
    { participantId: null, round: 'QF', position: 1, playerId: 'j3' },
    { participantId: LAKI, round: 'QF', position: 0, playerId: 'j2' },
  ];

  it('vide -> insertion, identique -> rien, différent -> écart non écrasé', () => {
    const plan = planifierEcriture(
      derives,
      [
        { id: 'a', participantId: null, round: 'QF', position: 0, playerId: 'j1' },
        { id: 'b', participantId: LAKI, round: 'QF', position: 0, playerId: 'j1' },
        // Emplacement absent chez Thomas : jamais touché.
        { id: 'c', participantId: null, round: 'F', position: 0, playerId: 'j8' },
      ],
      false,
    );
    expect(plan.aInserer).toEqual([derives[1]]);
    expect(plan.identiques).toBe(1);
    expect(plan.aModifier).toEqual([]);
    expect(plan.ecarts).toEqual([{ participantId: LAKI, round: 'QF', position: 0, interne: 'j1', thomas: 'j2' }]);
  });

  it('ecraser : les écarts deviennent des mises à jour, rien d’autre ne bouge', () => {
    const plan = planifierEcriture(
      derives,
      [
        { id: 'b', participantId: LAKI, round: 'QF', position: 0, playerId: 'j1' },
        { id: 'c', participantId: null, round: 'F', position: 0, playerId: 'j8' },
      ],
      true,
    );
    expect(plan.aModifier).toEqual([{ id: 'b', playerId: 'j2' }]);
    expect(plan.aInserer).toHaveLength(2);
  });

  it('moi (null) et un participant au même emplacement ne se confondent pas', () => {
    const plan = planifierEcriture(derives, [{ id: 'x', participantId: LAKI, round: 'QF', position: 1, playerId: 'j3' }], false);
    expect(plan.aInserer).toHaveLength(3);
    expect(plan.identiques).toBe(0);
  });
});
