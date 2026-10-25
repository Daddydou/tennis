import { describe, expect, it } from 'vitest';
import { completerRangsParNom, type LigneAvecRang } from '../eloMaisonRangs';

const ligne = (nom: string, rang: number | null = null): LigneAvecRang => ({
  ta_name_normalized: nom,
  atp_rank: rang,
});

describe('completerRangsParNom', () => {
  it('donne à un joueur maison sans rang celui de Tennis Abstract', () => {
    const lignes = [ligne('a rinderknech'), ligne('j kym')];
    const n = completerRangsParNom(lignes, [
      { ta_name_normalized: 'a rinderknech', atp_rank: 32 },
    ]);
    expect(n).toBe(1);
    expect(lignes[0].atp_rank).toBe(32);
    expect(lignes[1].atp_rank).toBeNull();
  });

  it('accepte un rang renvoyé en texte par la base', () => {
    const lignes = [ligne('c ruud')];
    completerRangsParNom(lignes, [{ ta_name_normalized: 'c ruud', atp_rank: '12' }]);
    expect(lignes[0].atp_rank).toBe(12);
  });

  it('ne touche pas un rang déjà renseigné', () => {
    const lignes = [ligne('c ruud', 7)];
    const n = completerRangsParNom(lignes, [{ ta_name_normalized: 'c ruud', atp_rank: 12 }]);
    expect(n).toBe(0);
    expect(lignes[0].atp_rank).toBe(7);
  });

  it('laisse sans rang un homonyme côté maison', () => {
    const lignes = [ligne('j smith'), ligne('j smith')];
    completerRangsParNom(lignes, [{ ta_name_normalized: 'j smith', atp_rank: 150 }]);
    expect(lignes.map((l) => l.atp_rank)).toEqual([null, null]);
  });

  it('laisse sans rang un homonyme côté Tennis Abstract', () => {
    const lignes = [ligne('j smith')];
    completerRangsParNom(lignes, [
      { ta_name_normalized: 'j smith', atp_rank: 150 },
      { ta_name_normalized: 'j smith', atp_rank: 400 },
    ]);
    expect(lignes[0].atp_rank).toBeNull();
  });

  it('ignore les rangs absents ou illisibles', () => {
    const lignes = [ligne('x y')];
    completerRangsParNom(lignes, [
      { ta_name_normalized: 'x y', atp_rank: null },
      { ta_name_normalized: 'x y', atp_rank: 'abc' },
    ]);
    expect(lignes[0].atp_rank).toBeNull();
  });
});
