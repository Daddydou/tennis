import { describe, expect, it } from 'vitest';
import {
  dernierJourComplet,
  eloEnPremier,
  graviteRetard,
  peutLireJour,
  retardJours,
  RESERVE_QUOTA_NORMALE,
} from '../eloMaisonSuivi';

const t = (iso: string) => new Date(iso);

describe('dernierJourComplet', () => {
  it('à 00 h UTC, la veille n’est pas encore complète : on s’arrête à l’avant-veille', () => {
    expect(dernierJourComplet(t('2026-10-24T00:10:00Z'))).toBe('2026-10-22');
  });
  it('à 12 h UTC, la veille est complète', () => {
    expect(dernierJourComplet(t('2026-10-24T12:10:00Z'))).toBe('2026-10-23');
  });
  it('bascule à 10 h UTC pile', () => {
    expect(dernierJourComplet(t('2026-10-24T09:59:00Z'))).toBe('2026-10-22');
    expect(dernierJourComplet(t('2026-10-24T10:00:00Z'))).toBe('2026-10-23');
  });
  it('passe correctement une fin de mois', () => {
    expect(dernierJourComplet(t('2026-11-01T06:00:00Z'))).toBe('2026-10-30');
  });
});

describe('retard et gravité', () => {
  it('0 quand le suivi est au dernier jour complet', () => {
    expect(retardJours('2026-10-23', t('2026-10-24T12:00:00Z'))).toBe(0);
  });
  it('compte les jours manquants et jamais de négatif', () => {
    expect(retardJours('2026-10-20', t('2026-10-24T12:00:00Z'))).toBe(3);
    expect(retardJours('2026-10-30', t('2026-10-24T12:00:00Z'))).toBe(0);
  });
  it('échelle de gravité', () => {
    expect(graviteRetard(0)).toBe('aucune');
    expect(graviteRetard(1)).toBe('normale');
    expect(graviteRetard(2)).toBe('normale');
    expect(graviteRetard(3)).toBe('alerte');
    expect(graviteRetard(10)).toBe('alerte');
    expect(graviteRetard(11)).toBe('en_retard');
  });
  it('l’Elo passe avant les tableaux à partir de 2 jours de retard', () => {
    expect(eloEnPremier(1)).toBe(false);
    expect(eloEnPremier(2)).toBe(true);
  });
});

describe('peutLireJour (quota partagé)', () => {
  it('essaie quand le quota est inconnu', () => {
    expect(peutLireJour(null, 0)).toBe(true);
  });
  it('garde une réserve pour les tableaux quand l’Elo est à jour', () => {
    expect(peutLireJour(RESERVE_QUOTA_NORMALE + 1, 0)).toBe(true);
    expect(peutLireJour(RESERVE_QUOTA_NORMALE, 0)).toBe(false);
    expect(peutLireJour(1, 1)).toBe(false);
  });
  it('en retard, ne s’arrête qu’au dernier cran', () => {
    expect(peutLireJour(2, 3)).toBe(true);
    expect(peutLireJour(1, 3)).toBe(false);
    expect(peutLireJour(0, 3)).toBe(false);
  });
});
