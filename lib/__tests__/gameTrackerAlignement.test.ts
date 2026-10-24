import { describe, expect, it } from 'vitest';
import { decrireChangement, planAlignementGT, type ParametresAlignement } from '../gameTrackerAlignement';
import { lireEtatGT, type PickGT, type TourJoueGT } from '../gameTrackerPicks';

// Tableau de 8 : QF (4 matchs), SF, F. Positions 1..8 au premier tour.
const JOUEURS: [string, string, string, string][] = [
  // [id, nom interne, prénom GT, nom GT]
  ['cob', 'F. Cobolli', 'Flavio', 'COBOLLI'],
  ['nak', 'B. Nakashima', 'Brandon', 'NAKASHIMA'],
  ['van', 'L. Van Assche', 'Luca', 'VAN ASSCHE'],
  ['mus', 'L. Musetti', 'Lorenzo', 'MUSETTI'],
  ['mou', 'C. Moutet', 'Corentin', 'MOUTET'],
  ['pau', 'T. Paul', 'Tommy', 'PAUL'],
  ['alt', 'D. Altmaier', 'Daniel', 'ALTMAIER'],
  ['fri', 'T. Fritz', 'Taylor', 'FRITZ'],
];
const pos = (id: string) => JOUEURS.findIndex((j) => j[0] === id) + 1;
const gt = (id: string): PickGT => {
  const j = JOUEURS.find((x) => x[0] === id)!;
  return { position: pos(id), prenom: j[2], nom: j[3] };
};
const PARTICIPANTS = [
  { id: 'laki-id', name: 'Laki' },
  { id: 'thomas-id', name: 'Thomas' },
];

function base(tours: TourJoueGT[], extra: Partial<ParametresAlignement> = {}): ParametresAlignement {
  return {
    drawSize: 8,
    tourOuvert: 2,
    tours,
    rounds: ['QF', 'SF', 'F'],
    slots: [
      { round: 'QF', half: 'top' },
      { round: 'QF', half: 'bottom' },
      { round: 'SF', half: null },
      { round: 'F', half: null },
    ],
    matchs: [0, 1, 2, 3].map((m) => ({
      round: 'QF',
      position: m,
      player1Id: JOUEURS[2 * m][0],
      player2Id: JOUEURS[2 * m + 1][0],
    })),
    noms: new Map(JOUEURS.map((j) => [j[0], j[1]])),
    participants: PARTICIPANTS,
    picks: [],
    ...extra,
  };
}

const qf = (picks: TourJoueGT['picks']): TourJoueGT => ({ numero: 1, nom: 'Quarts de finale', statut: 'COMPLETED', picks });
const pk = (pseudo: string, haut: string | null, bas: string | null, moi = false) => ({
  pseudo,
  moi,
  haut: haut ? gt(haut) : null,
  bas: bas ? gt(bas) : null,
  points: null,
});

describe('planAlignementGT', () => {
  it('recopie les picks de chacun (moi, Laki, moustiton = Thomas) sur un tour verrouillé', () => {
    const plan = planAlignementGT(
      base([qf([pk('Daddy', 'nak', 'mou', true), pk('Laki', 'cob', 'fri'), pk('moustiton', 'mus', 'pau')])], {
        picks: [{ stockId: null, round: 'QF', half: 'top', playerId: 'cob' }],
      }),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.rounds).toEqual(['QF']);
    const moi = plan.changements.filter((c) => c.stockId === null);
    expect(moi).toEqual([
      expect.objectContaining({ round: 'QF', half: 'top', action: 'remplacement', apres: { playerId: 'nak', nom: 'B. Nakashima' } }),
      expect.objectContaining({ round: 'QF', half: 'bottom', action: 'ajout', apres: { playerId: 'mou', nom: 'C. Moutet' } }),
    ]);
    expect(plan.changements.filter((c) => c.stockId === 'thomas-id').map((c) => c.apres?.playerId)).toEqual(['mus', 'pau']);
    expect(plan.changements.filter((c) => c.stockId === 'laki-id').map((c) => c.apres?.playerId)).toEqual(['cob', 'fri']);
  });

  it('un même joueur peut être pris par plusieurs participants', () => {
    const plan = planAlignementGT(base([qf([pk('Daddy', 'mou', null, true), pk('moustiton', 'mou', null)])]));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.changements.filter((c) => c.apres?.playerId === 'mou')).toHaveLength(2);
    expect(plan.changements.some((c) => c.action === 'retrait-conflit')).toBe(false);
  });

  it('ne touche jamais le tour ouvert, mais retire un pick qui réutiliserait le joueur dans le même stock', () => {
    const plan = planAlignementGT(
      base([qf([pk('moustiton', 'mou', 'pau')])], {
        picks: [
          { stockId: 'thomas-id', round: 'SF', half: null, playerId: 'mou' },
          { stockId: null, round: 'SF', half: null, playerId: 'mou' },
        ],
      }),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const conflits = plan.changements.filter((c) => c.action === 'retrait-conflit');
    expect(conflits).toEqual([expect.objectContaining({ stockId: 'thomas-id', round: 'SF', avant: { playerId: 'mou', nom: 'C. Moutet' } })]);
    expect(plan.changements.some((c) => c.stockId === null)).toBe(false);
  });

  it('ignore le tour ouvert même s’il figure dans `tours`', () => {
    const plan = planAlignementGT(base([{ ...qf([pk('Daddy', 'nak', 'mou', true)]), numero: 2, nom: 'Demi' }]));
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.changements).toEqual([]);
  });

  it('un côté vide chez Game Tracker vide le nôtre', () => {
    const plan = planAlignementGT(
      base([qf([pk('Daddy', 'nak', null, true)])], {
        picks: [
          { stockId: null, round: 'QF', half: 'top', playerId: 'nak' },
          { stockId: null, round: 'QF', half: 'bottom', playerId: 'pau' },
        ],
      }),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.changements).toEqual([expect.objectContaining({ half: 'bottom', action: 'retrait', apres: null })]);
  });

  it('tour à un seul pick (SF) : le pick de `haut` va dans le slot sans moitié', () => {
    const plan = planAlignementGT({
      ...base([{ numero: 2, nom: 'Demi-finales', statut: 'COMPLETED', picks: [pk('Daddy', 'cob', null, true)] }]),
      tourOuvert: 3,
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.changements).toEqual([expect.objectContaining({ round: 'SF', half: null, action: 'ajout' })]);
  });

  it('refuse TOUT si une position ne désigne pas le même joueur chez nous', () => {
    const faux: PickGT = { position: pos('nak'), prenom: 'Stan', nom: 'WAWRINKA' };
    const plan = planAlignementGT(base([qf([pk('Laki', 'cob', 'fri'), { ...pk('Daddy', null, null, true), haut: faux }])]));
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.raisons.join(' ')).toMatch(/WAWRINKA/);
  });

  it('un pseudo inconnu est ignoré avec un avertissement', () => {
    const plan = planAlignementGT(base([qf([pk('Inconnu', 'cob', 'fri')])]));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.changements).toEqual([]);
    expect(plan.avertissements.join(' ')).toMatch(/Inconnu/);
  });

  it('décrit un changement en une phrase', () => {
    const plan = planAlignementGT(
      base([qf([pk('Laki', 'cob', 'fri')])], { picks: [{ stockId: 'laki-id', round: 'QF', half: 'top', playerId: 'van' }] }),
    );
    if (!plan.ok) throw new Error('plan refusé');
    expect(plan.changements.map(decrireChangement)).toEqual([
      'Laki, QF haut : L. Van Assche → F. Cobolli',
      'Laki, QF bas : T. Fritz (ajouté)',
    ]);
  });
});

describe('lireEtatGT : tours verrouillés', () => {
  it('lit les picks de tous les joueurs, enveloppe { joueur } comprise', () => {
    const etat = lireEtatGT({
      maintenant: '2026-10-24T08:00:00Z',
      tournoi: { id: 't', nom: 'Lyon', drawSize: 32, statut: 'ONGOING' },
      tourOuvert: null,
      dejaPickes: [],
      classement: [],
      tours: [
        {
          numero: 3,
          nom: 'Quarts de finale',
          statut: 'COMPLETED',
          picks: [
            {
              userId: 'u',
              pseudo: 'moustiton',
              moi: false,
              haut: { joueur: { position: 16, prenom: 'Lorenzo', nom: 'MUSETTI' }, resultat: 'gagne', points: 11 },
              bas: null,
              points: 11,
            },
          ],
        },
      ],
    });
    expect(etat.tours).toEqual([
      {
        numero: 3,
        nom: 'Quarts de finale',
        statut: 'COMPLETED',
        picks: [{ pseudo: 'moustiton', moi: false, haut: { position: 16, prenom: 'Lorenzo', nom: 'MUSETTI' }, bas: null, points: 11 }],
      },
    ]);
  });
});
