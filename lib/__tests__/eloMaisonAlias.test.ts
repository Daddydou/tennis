import { describe, expect, it } from 'vitest';
import { indexerAlias } from '../eloMaisonAlias';

const lignes = [
  { ta_slug: 'WTA:s216133', nom: 'Xin Yu Wang' },
  { ta_slug: 'WTA:m47152', nom: 'Xinyu Wang' },
  { ta_slug: 'WTA:s216016', nom: 'Xiyu Wang' },
];

describe('indexerAlias', () => {
  it('relie un joueur de l\'app à la ligne d\'Elo désignée', () => {
    const m = indexerAlias(lignes, [{ player_id: '326376', ta_slug: 'WTA:s216133' }]);
    expect(m.get('326376')?.nom).toBe('Xin Yu Wang');
  });

  it('plusieurs alias, un par joueur', () => {
    const m = indexerAlias(lignes, [
      { player_id: '326376', ta_slug: 'WTA:s216133' },
      { player_id: '326160', ta_slug: 'WTA:s216016' },
    ]);
    expect(m.size).toBe(2);
    expect(m.get('326160')?.nom).toBe('Xiyu Wang');
  });

  it('un alias vers une ligne absente de l\'index est ignoré (le nom reprend la main)', () => {
    const m = indexerAlias(lignes, [{ player_id: '1', ta_slug: 'WTA:s000000' }]);
    expect(m.size).toBe(0);
  });

  it('sans alias : index vide', () => {
    expect(indexerAlias(lignes, []).size).toBe(0);
  });
});
