// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { LigneMatchMasters } from '../mastersVue';
import { planResultatsMasters, setsPourLigne, statutObservation, type ObservationApi } from '../mastersResultats';

const POULE = 8; // identifiant de tour de l'API pour les poules
const FINALE = 5; // autre identifiant pour la phase finale

/** Après l'import : journée 1 (4 matchs), demies et finale vides. */
function apresImport(): LigneMatchMasters[] {
  const l = (round: string, position: number, half: 'top' | 'bottom', p1: string | null, p2: string | null): LigneMatchMasters => ({
    round, position, half, player1Id: p1, player2Id: p2, winnerId: null, status: 'scheduled', sets: [],
  });
  return [
    l('J1', 0, 'top', 'a1', 'a4'), l('J1', 1, 'top', 'a2', 'a3'), l('J1', 2, 'bottom', 'b1', 'b4'), l('J1', 3, 'bottom', 'b2', 'b3'),
    l('SF', 0, 'top', null, null), l('SF', 1, 'bottom', null, null), l('F', 0, 'top', null, null),
  ];
}

const obs = (p1: string, p2: string, winnerId: string | null, result: string, over: Partial<ObservationApi> = {}): ObservationApi => ({
  roundId: POULE, date: null, p1, p2, winnerId, live: false, result, ...over,
});

describe('setsPourLigne / statutObservation', () => {
  it('sets orientés dans l\'ordre de NOTRE match : vainqueur = notre joueur 1', () => {
    const sets = setsPourLigne([{ v: 6, p: 4, tb: null }, { v: 7, p: 6, tb: 3 }], { player1Id: 'a1' }, obs('a1', 'a4', 'a1', '6-4 7-6(3)'));
    expect(sets).toEqual([{ g1: 6, g2: 4, tb1: null, tb2: null }, { g1: 7, g2: 6, tb1: null, tb2: 3 }]);
  });

  it('vainqueur = notre joueur 2 : jeux et tie-break inversés (le tie-break reste du côté du perdant du set)', () => {
    const sets = setsPourLigne([{ v: 7, p: 6, tb: 5 }, { v: 3, p: 6, tb: null }, { v: 6, p: 4, tb: null }], { player1Id: 'a2' }, obs('a3', 'a2', 'a3', ''));
    expect(sets).toEqual([
      { g1: 6, g2: 7, tb1: 5, tb2: null },
      { g1: 6, g2: 3, tb1: null, tb2: null },
      { g1: 4, g2: 6, tb1: null, tb2: null },
    ]);
  });

  it('match en cours (pas de vainqueur) : les jeux de la source sont ceux de SON joueur 1', () => {
    const o = obs('a4', 'a1', null, '3-2', { live: true });
    expect(setsPourLigne([{ v: 3, p: 2, tb: null }], { player1Id: 'a1' }, o)).toEqual([{ g1: 2, g2: 3, tb1: null, tb2: null }]);
  });

  it('statuts : programmé, en cours, terminé, abandon, forfait', () => {
    expect(statutObservation(obs('a1', 'a4', null, ''))).toBe('scheduled');
    expect(statutObservation(obs('a1', 'a4', null, '3-2', { live: true }))).toBe('live');
    expect(statutObservation(obs('a1', 'a4', null, '6-4 2-1'))).toBe('live');
    expect(statutObservation(obs('a1', 'a4', 'a1', '6-4 6-3'))).toBe('completed');
    expect(statutObservation(obs('a1', 'a4', 'a1', '6-4 2-1 ret.'))).toBe('retired');
    expect(statutObservation(obs('a1', 'a4', 'a1', 'w/o'))).toBe('walkover');
  });
});

describe('planResultatsMasters — journée 1', () => {
  const plan = planResultatsMasters(apresImport(), [obs('a1', 'a4', 'a1', '6-4 6-3'), obs('a3', 'a2', 'a3', '7-6(5) 3-6 6-4', { date: '2026-11-08T21:30:00.000Z' })]);

  it('met à jour les matchs de la journée 1 : vainqueur, statut, sets orientés, horaire', () => {
    expect(plan.maj).toHaveLength(2);
    const m0 = plan.maj.find((m) => m.round === 'J1' && m.position === 0)!;
    expect(m0).toMatchObject({ winnerId: 'a1', status: 'completed', scheduledAt: null });
    expect(m0.sets).toEqual([{ g1: 6, g2: 4, tb1: null, tb2: null }, { g1: 6, g2: 3, tb1: null, tb2: null }]);
    const m1 = plan.maj.find((m) => m.round === 'J1' && m.position === 1)!;
    expect(m1).toMatchObject({ winnerId: 'a3', status: 'completed', scheduledAt: '2026-11-08T21:30:00.000Z' });
    // Notre joueur 1 est a2 (battu) : ses jeux d'abord.
    expect(m1.sets[0]).toEqual({ g1: 6, g2: 7, tb1: 5, tb2: null });
  });

  it('poule A jouée : journées 2 et 3 créées (vainqueurs entre eux, perdants entre eux, puis le reste)', () => {
    const dans = (round: string) => plan.creations.filter((c) => c.round === round).map((c) => [c.position, c.half, c.player1Id, c.player2Id]);
    // Vainqueurs : a1 (match 0), a3 (match 1). Perdants : a4, a2.
    expect(dans('J2')).toEqual([[0, 'top', 'a1', 'a3'], [1, 'top', 'a4', 'a2']]);
    expect(dans('J3').map((x) => [x[0], x[1], [x[2], x[3]].sort().join('-')])).toEqual([[0, 'top', 'a1-a2'], [1, 'top', 'a3-a4']]);
  });

  it('poule B pas jouée : rien n\'est créé pour elle', () => {
    expect(plan.creations.every((c) => c.half === 'top')).toBe(true);
  });

  it('statut du tournoi : en cours', () => {
    expect(plan.tournoiStatut).toBe('running');
  });
});

describe('planResultatsMasters — idempotence', () => {
  it('rien de nouveau : aucune écriture', () => {
    const rows = apresImport().map((r) => (r.position === 0 && r.round === 'J1' && r.half === 'top' ? { ...r, winnerId: 'a1', status: 'completed', sets: [{ g1: 6, g2: 4 }, { g1: 6, g2: 3 }] } : r));
    const p = planResultatsMasters(rows, [obs('a1', 'a4', 'a1', '6-4 6-3')]);
    expect(p.maj).toEqual([]);
  });

  it('programmation seule (horaire connu, pas commencé) : met à jour l\'horaire', () => {
    const p = planResultatsMasters(apresImport(), [obs('a1', 'a4', null, '', { date: '2026-11-08T20:00:00.000Z' })]);
    expect(p.maj).toEqual([{ round: 'J1', position: 0, winnerId: null, status: 'scheduled', sets: [], scheduledAt: '2026-11-08T20:00:00.000Z' }]);
  });

  it('match en direct : statut live, sets partiels, pas de vainqueur', () => {
    const p = planResultatsMasters(apresImport(), [obs('a4', 'a1', null, '4-3', { live: true })]);
    expect(p.maj[0]).toMatchObject({ round: 'J1', position: 0, winnerId: null, status: 'live' });
    expect(p.maj[0].sets).toEqual([{ g1: 3, g2: 4, tb1: null, tb2: null }]);
    expect(p.creations).toEqual([]);
  });

  it('forfait et abandon', () => {
    const p = planResultatsMasters(apresImport(), [obs('a1', 'a4', 'a1', 'w/o'), obs('a2', 'a3', 'a2', '6-4 2-1 ret.')]);
    expect(p.maj.find((m) => m.position === 0)).toMatchObject({ status: 'walkover', winnerId: 'a1', sets: [] });
    expect(p.maj.find((m) => m.position === 1)).toMatchObject({ status: 'retired', winnerId: 'a2' });
  });
});

describe('planResultatsMasters — tournoi complet jusqu\'à la finale', () => {
  /** Tous les matchs de poule : le mieux classé (numéro le plus petit) gagne 6-4 6-4. */
  function resultatsDePoule(prefixe: 'a' | 'b'): ObservationApi[] {
    const out: ObservationApi[] = [];
    for (let i = 1; i <= 4; i++) {
      for (let j = i + 1; j <= 4; j++) out.push(obs(`${prefixe}${i}`, `${prefixe}${j}`, `${prefixe}${i}`, '6-4 6-4'));
    }
    return out;
  }

  it('poules jouées : demies placées (1er A – 2e B, 1er B – 2e A) ; demies jouées : finale placée ; finale jouée : tournoi terminé', () => {
    // Étape 1 : toutes les poules. L'import n'a que la journée 1 : les autres lignes sont créées puis mises à jour.
    const rows = apresImport();
    const appliquer = (plan: ReturnType<typeof planResultatsMasters>) => {
      for (const c of plan.creations) rows.push({ round: c.round, position: c.position, half: c.half, player1Id: c.player1Id, player2Id: c.player2Id, winnerId: null, status: 'scheduled', sets: [] });
      for (const m of plan.maj) {
        const r = rows.find((x) => x.round === m.round && (x.position ?? 0) === m.position)!;
        r.winnerId = m.winnerId;
        r.status = m.status;
        r.sets = m.sets;
      }
      for (const p of plan.placements) {
        const r = rows.find((x) => x.round === p.round && (x.position ?? 0) === p.position)!;
        r.player1Id = p.player1Id;
        r.player2Id = p.player2Id;
      }
    };
    const toutes = [...resultatsDePoule('a'), ...resultatsDePoule('b')];
    // Passage 1 : l'API a tout, mais seule la journée 1 existe chez nous : J1 mise à jour, J2/J3 créées et jouées dans la foulée.
    const p1 = planResultatsMasters(rows, toutes);
    appliquer(p1);
    expect(p1.creations).toHaveLength(8);
    expect(p1.placements.map((p) => [p.round, p.position, p.player1Id, p.player2Id])).toEqual([['SF', 0, 'a1', 'b2'], ['SF', 1, 'b1', 'a2']]);

    // Passage 2 : l'API donne les demies.
    const demies = [obs('a1', 'b2', 'a1', '6-3 6-3', { roundId: FINALE }), obs('b1', 'a2', 'a2', '4-6 6-4 6-2', { roundId: FINALE })];
    const p2 = planResultatsMasters(rows, [...toutes, ...demies]);
    appliquer(p2);
    expect(p2.maj.filter((m) => m.round === 'SF').map((m) => [m.position, m.winnerId])).toEqual([[0, 'a1'], [1, 'a2']]);
    expect(p2.placements.map((p) => [p.round, p.player1Id, p.player2Id])).toEqual([['F', 'a1', 'a2']]);
    expect(p2.tournoiStatut).toBe('running');

    // Passage 3 : la finale, entre a1 et a2 qui ont DÉJÀ joué en poule (autre tour d'API : pas de confusion).
    const finale = obs('a2', 'a1', 'a2', '6-7(4) 6-4 6-3', { roundId: 6 });
    const p3 = planResultatsMasters(rows, [...toutes, ...demies, finale]);
    expect(p3.maj.find((m) => m.round === 'F')).toMatchObject({ winnerId: 'a2', status: 'completed' });
    expect(p3.maj.filter((m) => m.round === 'J1')).toEqual([]); // le duel de poule a1 - a2 n'est pas écrasé par la finale
    expect(p3.tournoiStatut).toBe('completed');
  });

  it('une poule pas finie : pas de demies', () => {
    const rows = apresImport();
    const p = planResultatsMasters(rows, resultatsDePoule('a').slice(0, 5));
    expect(p.placements).toEqual([]);
  });

  it('avertissement : l\'API programme un duel de notre journée 3 avant un duel de notre journée 2', () => {
    const rows = apresImport();
    const j1 = [obs('a1', 'a4', 'a1', '6-4 6-4'), obs('a2', 'a3', 'a3', '4-6 4-6')];
    // Déduit : J2 = (a1,a3) et (a4,a2) ; J3 = (a1,a2) et (a3,a4). L'API date (a1,a2) AVANT (a1,a3).
    const dates = [
      obs('a1', 'a3', null, '', { date: '2026-11-11T20:00:00.000Z' }),
      obs('a4', 'a2', null, '', { date: '2026-11-11T21:30:00.000Z' }),
      obs('a1', 'a2', null, '', { date: '2026-11-10T20:00:00.000Z' }),
      obs('a3', 'a4', null, '', { date: '2026-11-10T21:30:00.000Z' }),
    ];
    const p = planResultatsMasters(rows, [...j1, ...dates]);
    expect(p.avertissements).toHaveLength(1);
    expect(p.avertissements[0]).toMatch(/Poule A/);
  });
});
