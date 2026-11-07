import { describe, expect, it } from 'vitest';
import { bilanLecture, resumerLecture, type LigneLecture } from '../lectureGlobaleGT';

describe('resumerLecture', () => {
  it('signale une erreur', () => {
    expect(resumerLecture({ ok: false, erreur: 'Clé absente' })).toEqual({ statut: 'erreur', detail: 'Clé absente', attention: true });
  });

  it('signale un tournoi non relié, sans alerte', () => {
    const r = resumerLecture({ ok: true, lie: false });
    expect(r.statut).toBe('non-relie');
    expect(r.attention).toBe(false);
    expect(r.detail).toContain('Pas encore relié');
  });

  it('dit « Rien de nouveau » quand rien ne change', () => {
    expect(
      resumerLecture({ ok: true, lie: true, alignement: { ok: true, changements: [], avertissements: [] }, resultatsRepris: [] }),
    ).toEqual({ statut: 'lu', detail: 'Rien de nouveau.', attention: false });
  });

  it('compte les picks alignés et les résultats repris', () => {
    const r = resumerLecture({
      ok: true,
      lie: true,
      alignement: { ok: true, changements: ['a', 'b'], avertissements: [] },
      resultatsRepris: ['Fritz bat Fils (R16)'],
    });
    expect(r.detail).toBe('2 picks alignés sur Game Tracker · 1 résultat repris de Thomas');
    expect(r.attention).toBe(false);
  });

  it('met en avant un avertissement ou un alignement impossible', () => {
    const avert = resumerLecture({
      ok: true,
      lie: true,
      alignement: { ok: true, changements: [], avertissements: ['x'] },
      resultatsRepris: [],
    });
    expect(avert).toMatchObject({ detail: '1 avertissement', attention: true });

    const impossible = resumerLecture({
      ok: true,
      lie: true,
      alignement: { ok: false, raisons: ['nom différent à la position 3'] },
      resultatsRepris: [],
    });
    expect(impossible.detail).toBe('alignement impossible (nom différent à la position 3)');
    expect(impossible.attention).toBe(true);
  });
});

describe('bilanLecture', () => {
  const ligne = (statut: LigneLecture['statut'], attention = false): LigneLecture => ({
    tournoiId: statut + attention,
    nom: 'T',
    statut,
    detail: '',
    attention,
  });

  it('résume le nombre de tournois lus et les points à regarder', () => {
    expect(bilanLecture([])).toBe('Aucun tournoi en cours ni cette semaine.');
    expect(bilanLecture([ligne('lu'), ligne('non-relie')])).toBe('1 tournoi lu sur 2');
    expect(bilanLecture([ligne('lu'), ligne('lu', true), ligne('erreur', true)])).toBe('2 tournois lus sur 3 · 2 points à regarder');
  });
});
