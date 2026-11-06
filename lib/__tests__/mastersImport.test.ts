// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { construirePlanMasters, trouverJoueur, type JoueurBase, type JoueurPoolGT, type PicksGT, type TourGT } from '../mastersImport';

const NOMS: [string, string][] = [
  ['Elena', 'RYBAKINA'], ['Coco', 'GAUFF'], ['Jessica', 'PEGULA'], ['Linda', 'NOSKOVA'],
  ['Aryna', 'SABALENKA'], ['Mira', 'ANDREEVA'], ['Elina', 'SVITOLINA'], ['Karolina', 'MUCHOVA'],
];
const BASE: JoueurBase[] = [
  { id: '324166', name: 'E. Rybakina' }, { id: '328560', name: 'C. Gauff' }, { id: '316956', name: 'J. Pegula' }, { id: '329668', name: 'L. Noskova' },
  { id: '320760', name: 'A. Sabalenka' }, { id: '331809', name: 'M. Andreeva' }, { id: '316738', name: 'E. Svitolina' }, { id: '322191', name: 'K. Muchova' },
];

/** Pool d'une poule pour une journée : `paires` en positions Game Tracker (1-4 haut, 5-8 bas). */
function pool(positions: number[], paires: [number, number][]): JoueurPoolGT[] {
  return positions.map((p) => {
    const adv = paires.find(([a, b]) => a === p || b === p)!;
    const autre = adv[0] === p ? adv[1] : adv[0];
    return { position: p, prenom: NOMS[p - 1][0], nom: NOMS[p - 1][1], adversaires: [{ position: autre }] };
  });
}
const jour = (numero: number, haut: [number, number][], bas: [number, number][]): TourGT => ({
  numero,
  nom: `Poules · journée ${numero}`,
  pool: { haut: pool([1, 2, 3, 4], haut), bas: pool([5, 6, 7, 8], bas) },
});

function picks(over: Partial<PicksGT> = {}): PicksGT {
  return {
    tournoi: { id: 'cmw3', nom: 'WTA Finals', tour: 'WTA', annee: 2026, type: 'FINALS', surface: 'INDOOR_HARD', drawSize: 8 },
    tourOuvert: jour(1, [[1, 4], [2, 3]], [[5, 8], [6, 7]]),
    toursAVenir: [
      jour(2, [[1, 3], [2, 4]], [[5, 7], [6, 8]]),
      jour(3, [[1, 2], [3, 4]], [[5, 6], [7, 8]]),
      { numero: 4, nom: 'Demi-finales' },
      { numero: 5, nom: 'Finale' },
    ],
    ...over,
  };
}

describe('construirePlanMasters', () => {
  const r = construirePlanMasters(picks(), BASE);
  if (!r.ok) throw new Error(r.erreurs.join('\n'));
  const { plan } = r;

  it('le tournoi : nom, circuit, surface, 8 joueurs, tours J1 J2 J3 SF F', () => {
    expect(plan.tournoi).toMatchObject({
      externalId: 'gt:cmw3', name: 'WTA Finals 2026', tour: 'WTA', category: 'finals', surface: 'hard', drawSize: 8, bestOf: 3, year: 2026,
      rounds: ['J1', 'J2', 'J3', 'SF', 'F'],
    });
  });

  it('15 matchs : 12 de poule (4 par journée), 2 demies, 1 finale', () => {
    expect(plan.matchs).toHaveLength(15);
    expect(plan.matchs.filter((m) => m.round === 'J1')).toHaveLength(4);
    expect(plan.matchs.filter((m) => m.round === 'SF')).toHaveLength(2);
    expect(plan.matchs.filter((m) => m.round === 'F')).toHaveLength(1);
  });

  it('poule haut = moitié « top » (positions 0-1), poule bas = « bottom » (positions 2-3), joueurs trouvés dans la base', () => {
    const j1 = plan.matchs.filter((m) => m.round === 'J1');
    expect(j1.map((m) => [m.position, m.half, m.player1Id, m.player2Id])).toEqual([
      [0, 'top', '324166', '329668'], // Rybakina - Noskova
      [1, 'top', '328560', '316956'], // Gauff - Pegula
      [2, 'bottom', '320760', '322191'], // Sabalenka - Muchova
      [3, 'bottom', '331809', '316738'], // Andreeva - Svitolina
    ]);
    expect(j1.map((m) => m.roundOrder)).toEqual([1, 1, 1, 1]);
  });

  it('chaque joueuse affronte les trois autres de sa poule une fois', () => {
    for (const half of ['top', 'bottom'] as const) {
      const duels = new Set(plan.matchs.filter((m) => m.half === half && m.round.startsWith('J')).map((m) => [m.player1Id, m.player2Id].sort().join('|')));
      expect(duels.size).toBe(6);
    }
    expect(plan.poules.A).toEqual(['324166', '328560', '316956', '329668']);
    expect(plan.poules.B).toEqual(['320760', '331809', '316738', '322191']);
  });

  it('demies et finale : sans joueur, ordre de tours 4 et 5', () => {
    const fin = plan.matchs.filter((m) => m.round === 'SF' || m.round === 'F');
    expect(fin.every((m) => m.player1Id === null && m.player2Id === null)).toBe(true);
    expect(fin.map((m) => [m.round, m.position, m.roundOrder])).toEqual([['SF', 0, 4], ['SF', 1, 4], ['F', 0, 5]]);
  });

  it('identifiants externes stables (réimport sans doublon)', () => {
    expect(new Set(plan.matchs.map((m) => m.externalId)).size).toBe(15);
    expect(plan.matchs[0].externalId).toBe('gt:cmw3:J1:0');
  });
});

describe('construirePlanMasters — journées 2 et 3 pas encore connues (avant les premiers matchs)', () => {
  /** Journée 2 et 3 : pools présents mais sans adversaire du jour, comme Game Tracker avant la journée 1. */
  const vide = (numero: number): TourGT => ({
    numero,
    nom: `Poules · journée ${numero}`,
    pool: {
      haut: [1, 2, 3, 4].map((p) => ({ position: p, prenom: NOMS[p - 1][0], nom: NOMS[p - 1][1], adversaires: [] })),
      bas: [5, 6, 7, 8].map((p) => ({ position: p, prenom: NOMS[p - 1][0], nom: NOMS[p - 1][1], adversaires: [] })),
    },
  });
  const avant = picks({ toursAVenir: [vide(2), vide(3), { numero: 4, nom: 'Demi-finales' }, { numero: 5, nom: 'Finale' }] });

  it('importe la journée 1, les demies et la finale ; signale J2 et J3 à importer plus tard', () => {
    const r = construirePlanMasters(avant, BASE);
    if (!r.ok) throw new Error(r.erreurs.join('\n'));
    expect(r.plan.joursManquants).toEqual(['J2', 'J3']);
    expect(r.plan.matchs.map((m) => m.round)).toEqual(['J1', 'J1', 'J1', 'J1', 'SF', 'SF', 'F']);
    expect(r.plan.poules.A).toHaveLength(4);
    expect(r.plan.poules.B).toHaveLength(4);
  });

  it('seule la journée 3 manque : J2 importée', () => {
    const r = construirePlanMasters(
      picks({ toursAVenir: [jour(2, [[1, 3], [2, 4]], [[5, 7], [6, 8]]), vide(3), { numero: 4, nom: 'D' }, { numero: 5, nom: 'F' }] }),
      BASE,
    );
    if (!r.ok) throw new Error(r.erreurs.join('\n'));
    expect(r.plan.joursManquants).toEqual(['J3']);
    expect(r.plan.matchs.filter((m) => m.round === 'J2')).toHaveLength(4);
  });

  it('un plan complet n\'a aucune journée manquante', () => {
    const r = construirePlanMasters(picks(), BASE);
    if (!r.ok) throw new Error(r.erreurs.join('\n'));
    expect(r.plan.joursManquants).toEqual([]);
  });
});

describe('construirePlanMasters — refus', () => {
  it('pas un Masters, ou pas 8 joueurs', () => {
    const p = picks({ tournoi: { id: 'x', nom: 'Paris', tour: 'ATP', annee: 2026, type: 'MASTERS_1000', surface: 'HARD', drawSize: 64 } });
    const r = construirePlanMasters(p, BASE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs.length).toBeGreaterThanOrEqual(2);
  });

  it('la journée 1 manquante (déjà jouée : plus dans la réponse) : refus, la composition des poules est inconnue', () => {
    const p = picks({ tourOuvert: jour(2, [[1, 3], [2, 4]], [[5, 7], [6, 8]]), toursAVenir: [jour(3, [[1, 2], [3, 4]], [[5, 6], [7, 8]])] });
    const r = construirePlanMasters(p, BASE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs.join(' ')).toMatch(/journée 1/);
  });

  it('une joueuse absente de la base : signalée, rien d\'inventé', () => {
    const r = construirePlanMasters(picks(), BASE.filter((j) => j.id !== '329668'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs).toEqual(['Joueur introuvable dans la base : Linda NOSKOVA.']);
  });

  it('un duel programmé deux fois : refusé', () => {
    const p = picks({ toursAVenir: [jour(2, [[1, 4], [2, 3]], [[5, 7], [6, 8]]), jour(3, [[1, 2], [3, 4]], [[5, 6], [7, 8]]), { numero: 4, nom: 'D' }, { numero: 5, nom: 'F' }] });
    const r = construirePlanMasters(p, BASE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs.join(' ')).toMatch(/deux fois/);
  });
});

describe('trouverJoueur', () => {
  it('même nom de famille et même initiale ; accents et casse ignorés', () => {
    expect(trouverJoueur('Karolina', 'MUCHOVÁ', BASE)).toEqual({ ok: true, id: '322191' });
    expect(trouverJoueur('Mira', 'andreeva', BASE)).toEqual({ ok: true, id: '331809' });
  });

  it('deux homonymes d\'initiale différente ne se confondent pas ; deux de même initiale : ambigu', () => {
    const base = [{ id: '1', name: 'X. Wang' }, { id: '2', name: 'Y. Wang' }, { id: '3', name: 'X. Wang' }];
    expect(trouverJoueur('Yafan', 'WANG', base)).toEqual({ ok: true, id: '2' });
    expect(trouverJoueur('Xinyu', 'WANG', base).ok).toBe(false);
  });
});
