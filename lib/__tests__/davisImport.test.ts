import { describe, expect, it } from 'vitest';
import { ajouterJours, construirePlanDavis, estIdNation, idNation, jourParis, type NationGT, type PicksDavisGT } from '../davisImport';

const nation = (position: number, nom: string, pays: string): NationGT => ({
  position,
  nom,
  pays,
  adversaires: [{ position: position % 2 === 1 ? position + 1 : position - 1 }],
});

function picks(sur?: (p: PicksDavisGT) => void): PicksDavisGT {
  const p: PicksDavisGT = {
    tournoi: { id: 'cmwdembf6000007l0nhpcm6nz', nom: 'Final 8 Coupe Davis', tour: 'ATP', annee: 2026, type: 'DAVIS', surface: 'INDOOR_HARD', drawSize: 8, statut: 'UPCOMING' },
    tourOuvert: {
      numero: 1,
      nom: 'Quarts de finale',
      lockAt: '2026-11-24T15:00:00.000Z',
      pool: {
        haut: [nation(1, 'Italie', 'ITA'), nation(2, 'Corée du Sud', 'KOR'), nation(3, 'République Tchèque', 'CZE'), nation(4, 'Canada', 'CAN')],
        bas: [nation(5, 'Royaume-Uni', 'GBR'), nation(6, 'Allemagne', 'GER'), nation(7, 'Autriche', 'AUT'), nation(8, 'Espagne', 'ESP')],
      },
    },
  };
  sur?.(p);
  return p;
}

describe('construirePlanDavis', () => {
  it('construit un tableau de 8 nations : 4 quarts, 2 demies, 1 finale', () => {
    const r = construirePlanDavis(picks());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { plan } = r;
    expect(plan.tournoi).toMatchObject({ externalId: 'gt:cmwdembf6000007l0nhpcm6nz', name: 'Coupe Davis 2026', tour: 'ATP', category: 'davis', surface: 'hard', drawSize: 8, bestOf: 3, year: 2026, rounds: ['QF', 'SF', 'F'] });
    expect(plan.nations).toHaveLength(8);
    expect(plan.matchs.map((m) => `${m.round}${m.position}`)).toEqual(['QF0', 'QF1', 'QF2', 'QF3', 'SF0', 'SF1', 'F0']);
  });

  it('place les nations comme Game Tracker : positions 1-2, 3-4 (haut) | 5-6, 7-8 (bas)', () => {
    const r = construirePlanDavis(picks());
    if (!r.ok) throw new Error('plan attendu');
    const qf = r.plan.matchs.filter((m) => m.round === 'QF');
    expect(qf.map((m) => [m.player1Id, m.player2Id])).toEqual([
      ['davis-ITA', 'davis-KOR'],
      ['davis-CZE', 'davis-CAN'],
      ['davis-GBR', 'davis-GER'],
      ['davis-AUT', 'davis-ESP'],
    ]);
    expect(qf.map((m) => m.half)).toEqual(['top', 'top', 'bottom', 'bottom']);
    expect(r.plan.matchs.filter((m) => m.round !== 'QF').every((m) => m.player1Id === null && m.player2Id === null)).toBe(true);
  });

  it('prend les dates du verrouillage des quarts (heure de Paris) et cinq jours de plus', () => {
    const r = construirePlanDavis(picks());
    if (!r.ok) throw new Error('plan attendu');
    expect(r.plan.tournoi.debut).toBe('2026-11-24');
    expect(r.plan.tournoi.fin).toBe('2026-11-29');
  });

  it('accepte des dates imposées', () => {
    const r = construirePlanDavis(picks(), { debut: '2026-11-25', fin: '2026-11-30' });
    if (!r.ok) throw new Error('plan attendu');
    expect(r.plan.tournoi.debut).toBe('2026-11-25');
    expect(r.plan.tournoi.fin).toBe('2026-11-30');
  });

  it('refuse un tournoi qui n\'est pas une Coupe Davis', () => {
    const r = construirePlanDavis(picks((p) => (p.tournoi.type = 'FINALS')));
    expect(r.ok).toBe(false);
  });

  it('refuse sans quarts ouverts', () => {
    const r = construirePlanDavis(picks((p) => (p.tourOuvert = null)));
    expect(r.ok).toBe(false);
  });

  it('refuse un pool incomplet', () => {
    const r = construirePlanDavis(picks((p) => p.tourOuvert!.pool!.bas.pop()));
    expect(r.ok).toBe(false);
  });

  it('refuse une nation sans code pays', () => {
    const r = construirePlanDavis(picks((p) => (p.tourOuvert!.pool!.haut[0].pays = null)));
    expect(r.ok).toBe(false);
  });

  it('refuse un adversaire inattendu', () => {
    const r = construirePlanDavis(picks((p) => (p.tourOuvert!.pool!.haut[0].adversaires = [{ position: 3 }])));
    expect(r.ok).toBe(false);
  });
});

describe('petits outils', () => {
  it('identifiants de nations', () => {
    expect(idNation('ita')).toBe('davis-ITA');
    expect(estIdNation('davis-ITA')).toBe(true);
    expect(estIdNation('ms76298')).toBe(false);
    expect(estIdNation(null)).toBe(false);
  });
  it('jourParis tient compte du fuseau', () => {
    expect(jourParis('2026-11-24T23:30:00.000Z')).toBe('2026-11-25');
    expect(jourParis('pas une date')).toBeNull();
  });
  it('ajouterJours passe le changement de mois', () => {
    expect(ajouterJours('2026-11-28', 5)).toBe('2026-12-03');
  });
});
