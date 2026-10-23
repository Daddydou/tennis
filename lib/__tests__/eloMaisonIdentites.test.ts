import { describe, expect, it } from 'vitest';
import { departagerHomonymes, ELO_DEFAUT_MAISON, normPays } from '../eloMaisonIdentites';

const J = 20_000; // « aujourd'hui » (jour depuis 1970), valeur arbitraire

const c = (ta_slug: string, country: string | null, n: number, ilYa: number) => ({
  ta_slug,
  country,
  n,
  dernier_jour: J - ilYa,
});

describe('departagerHomonymes', () => {
  it('prend le candidat dominant (A. Popyrin : 534 matchs contre 3)', () => {
    const r = departagerHomonymes([c('ATP:s200615', 'AUS', 534, 50), c('ATP:s202270', 'AUS', 3, 984)], null, J);
    expect(r?.ta_slug).toBe('ATP:s200615');
  });

  it('laisse ambigus deux homonymes de poids comparable (D. Blanch : 312 contre 170)', () => {
    const r = departagerHomonymes([c('ATP:s209898', 'USA', 312, 4), c('ATP:s210464', 'USA', 170, 2)], 'USA', J);
    expect(r).toBeNull();
  });

  it('utilise le pays quand un seul candidat correspond (A. Martin, USA)', () => {
    const r = departagerHomonymes(
      [c('ATP:s105413', 'SVK', 1028, 1), c('ATP:s211346', 'USA', 211, 3), c('ATP:s211718', 'ESP', 3, 466)],
      'USA',
      J,
    );
    expect(r?.ta_slug).toBe('ATP:s211346');
  });

  it('traite LBN et LIB comme le même pays', () => {
    expect(normPays('LBN')).toBe(normPays('LIB'));
    const r = departagerHomonymes([c('A', 'LBN', 529, 10), c('B', 'ESP', 40, 10)], 'LIB', J);
    expect(r?.ta_slug).toBe('A');
  });

  it('ignore un pays qui ne désigne personne et retombe sur la règle du dominant', () => {
    const r = departagerHomonymes([c('A', 'AUS', 534, 50), c('B', 'AUS', 3, 984)], 'FRA', J);
    expect(r?.ta_slug).toBe('A');
  });

  it('ne choisit pas un dominant devenu fantôme : plus de 30 jours derrière un homonyme récent', () => {
    // Coleman Wong : 307 matchs mais dernier match il y a 144 jours, l'autre ligne a joué hier.
    const r = departagerHomonymes([c('A', 'HKG', 307, 144), c('B', 'HKG', 33, 2)], 'HKG', J);
    expect(r).toBeNull();
  });

  it('ne choisit pas un dominant inactif depuis plus de 400 jours', () => {
    const r = departagerHomonymes([c('A', 'ESP', 300, 500), c('B', 'ESP', 5, 520)], null, J);
    expect(r).toBeNull();
  });

  it('exige un minimum de matchs pour le dominant', () => {
    const r = departagerHomonymes([c('A', 'USA', 20, 1), c('B', 'USA', 1, 1)], null, J);
    expect(r).toBeNull();
  });

  it('reste ambigu sans nombre de matchs (lignes Tennis Abstract) et sans pays décisif', () => {
    const r = departagerHomonymes([{ ta_slug: 'A' }, { ta_slug: 'B' }], null, J);
    expect(r).toBeNull();
  });
});

describe('ELO_DEFAUT_MAISON', () => {
  it('est bien au-dessus du 1650 de Tennis Abstract, côté WTA plus haut que côté ATP', () => {
    expect(ELO_DEFAUT_MAISON.atp).toBeGreaterThan(1650);
    expect(ELO_DEFAUT_MAISON.wta).toBeGreaterThan(ELO_DEFAUT_MAISON.atp);
  });
});
