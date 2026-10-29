// @vitest-environment node
/**
 * Alias d'identité de l'Elo maison : un joueur de l'app dont le nom est
 * ambigu (deux « X. Wang » chinoises) retrouve SA ligne d'Elo grâce à
 * tn_elo_maison_alias, au lieu de recevoir le défaut du circuit.
 */
import { describe, expect, it } from 'vitest';
import { indexerAlias } from '@/lib/eloMaisonAlias';
import { construireIndex } from '@/lib/matching';
import { resoudreElos, type IndexElo, type TaEloRow } from '../elo';

const ligne = (slug: string, nom: string, elo: number, n: number): TaEloRow => ({
  ta_name: nom,
  ta_name_normalized: 'x wang', // initiale + nom, comme dans la table : les deux sont homonymes
  ta_slug: slug,
  country: 'CHN',
  tour: 'wta',
  elo_overall: elo,
  elo_hard: elo,
  elo_clay: elo,
  elo_grass: elo,
  atp_rank: null,
  updated_at: '2026-10-23',
  n,
  dernier_jour: 20750,
});

const LIGNES = [ligne('WTA:s216016', 'Xiyu Wang', 2283, 300), ligne('WTA:s216133', 'Xin Yu Wang', 2260, 280)];
const joueur = (id: string) => ({ id, name: 'X. Wang', country: 'CHN' });

function indexMaison(alias: { player_id: string; ta_slug: string }[]): IndexElo {
  return { ...construireIndex(LIGNES, []), base: 'maison', eloDefaut: 2100, parIdJoueur: indexerAlias(LIGNES, alias) };
}

describe('resoudreElos — alias d\'identité (Elo maison)', () => {
  it('sans alias : deux homonymes à poids comparable restent ambigus, défaut du circuit', () => {
    const r = resoudreElos(joueur('326376'), indexMaison([]));
    expect(r.source).toBe('ambigu');
    expect(r.eloOverall).toBe(2100);
  });

  it('avec alias : la ligne désignée est utilisée, source « trouvé »', () => {
    const idx = indexMaison([
      { player_id: '326376', ta_slug: 'WTA:s216133' },
      { player_id: '326160', ta_slug: 'WTA:s216016' },
    ]);
    const a = resoudreElos(joueur('326376'), idx);
    expect(a).toMatchObject({ source: 'ta', eloOverall: 2260, taSlug: 'WTA:s216133', via: 'alias' });
    const b = resoudreElos(joueur('326160'), idx);
    expect(b).toMatchObject({ source: 'ta', eloOverall: 2283, taSlug: 'WTA:s216016' });
  });

  it('un autre joueur du même nom, sans alias, reste ambigu', () => {
    const idx = indexMaison([{ player_id: '326376', ta_slug: 'WTA:s216133' }]);
    expect(resoudreElos(joueur('999999'), idx).source).toBe('ambigu');
  });

  it('alias vers une ligne inconnue de l\'index : ignoré, le nom reprend la main', () => {
    const idx = indexMaison([{ player_id: '326376', ta_slug: 'WTA:s000000' }]);
    expect(resoudreElos(joueur('326376'), idx).source).toBe('ambigu');
  });
});
