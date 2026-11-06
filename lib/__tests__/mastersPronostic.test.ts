// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { PronosticMasters } from '../masters';
import { classerTournoi, pronosticFerme, reelDepuisVue } from '../mastersPronostic';
import { vueMasters, type LigneMatchMasters } from '../mastersVue';

const set = (s: string) => s.split(' ').filter(Boolean).map((x) => ({ g1: Number(x.split('-')[0]), g2: Number(x.split('-')[1]) }));

/** Matchs de poule complets ; le joueur de plus petit numéro gagne toujours. SF et F vides ou jouées selon `phase`. */
function tournoi(phase: 'rien' | 'poules' | 'demies' | 'finale'): LigneMatchMasters[] {
  const rows: LigneMatchMasters[] = [];
  const poule = (p: 'a' | 'b', half: 'top' | 'bottom', off: number) => {
    const paires: [string, number, number, string][] = [
      ['J1', 1, 4, ''], ['J1', 2, 3, ''], ['J2', 1, 3, ''], ['J2', 4, 2, ''], ['J3', 1, 2, ''], ['J3', 3, 4, ''],
    ];
    paires.forEach(([round, i, j], k) => {
      const gagnant = phase === 'rien' ? null : i < j ? `${p}${i}` : `${p}${j}`;
      rows.push({
        round, position: off + (k % 2), half, player1Id: `${p}${i}`, player2Id: `${p}${j}`, winnerId: gagnant,
        status: gagnant ? 'completed' : 'scheduled', sets: gagnant ? set(i < j ? '6-4 6-4' : '4-6 4-6') : [],
      });
    });
  };
  poule('a', 'top', 0);
  poule('b', 'bottom', 2);
  const sf = (pos: number, p1: string, p2: string, gagnant: string | null): LigneMatchMasters => ({
    round: 'SF', position: pos, half: pos === 0 ? 'top' : 'bottom', player1Id: p1, player2Id: p2, winnerId: gagnant, status: gagnant ? 'completed' : 'scheduled', sets: gagnant ? set('6-3 6-3') : [],
  });
  const jouees = phase === 'demies' || phase === 'finale';
  rows.push(sf(0, 'a1', 'b2', jouees ? 'a1' : null), sf(1, 'b1', 'a2', jouees ? 'a2' : null));
  rows.push({
    round: 'F', position: 0, half: 'top', player1Id: jouees ? 'a1' : null, player2Id: jouees ? 'a2' : null, winnerId: phase === 'finale' ? 'a2' : null,
    status: phase === 'finale' ? 'completed' : 'scheduled', sets: phase === 'finale' ? set('4-6 7-5 6-4') : [],
  });
  return rows;
}

const prono = (over: Partial<PronosticMasters> = {}): PronosticMasters => ({
  classementA: ['a1', 'a2', 'a3', 'a4'], classementB: ['b1', 'b2', 'b3', 'b4'], vainqueursDemis: ['a1', 'b1'], champion: 'a1', ...over,
});

describe('reelDepuisVue', () => {
  it('avant tout : rien de connu', () => {
    expect(reelDepuisVue(vueMasters(tournoi('rien')))).toEqual({ classementA: null, classementB: null, finalistes: null, champion: null });
  });

  it('poules terminées : classements sûrs, pas encore de finalistes', () => {
    const r = reelDepuisVue(vueMasters(tournoi('poules')));
    expect(r.classementA).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(r.classementB).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(r.finalistes).toBeNull();
    expect(r.champion).toBeNull();
  });

  it('demies jouées : finalistes ; finale jouée : championne', () => {
    expect(reelDepuisVue(vueMasters(tournoi('demies'))).finalistes).toEqual(['a1', 'a2']);
    expect(reelDepuisVue(vueMasters(tournoi('demies'))).champion).toBeNull();
    expect(reelDepuisVue(vueMasters(tournoi('finale'))).champion).toBe('a2');
  });

  it('un classement avec une égalité non départagée n\'est pas compté (on ne donne pas de points à tort)', () => {
    // Circulaire parfait entre a1, a2, a3 (tous battent a4) : égalité totale.
    const rows = tournoi('poules').map((r) => {
      if (r.half !== 'top') return r;
      const cle = `${r.round}${r.position}`;
      const forces: Record<string, [string, string]> = { J10: ['a1', 'a4'], J11: ['a2', 'a3'], J20: ['a1', 'a3'], J21: ['a4', 'a2'], J30: ['a1', 'a2'], J31: ['a3', 'a4'] };
      const [p1, p2] = forces[cle] ?? [r.player1Id!, r.player2Id!];
      const gagnant = (a: string, b: string) => {
        const cycle: Record<string, string> = { 'a1|a2': 'a1', 'a2|a3': 'a2', 'a1|a3': 'a3' };
        const k = [a, b].sort().join('|');
        return cycle[k] ?? (a === 'a4' ? b : b === 'a4' ? a : a);
      };
      const g = gagnant(p1, p2);
      return { ...r, player1Id: p1, player2Id: p2, winnerId: g, status: 'completed', sets: g === p1 ? set('6-4 6-4') : set('4-6 4-6') };
    });
    expect(reelDepuisVue(vueMasters(rows)).classementA).toBeNull();
    expect(reelDepuisVue(vueMasters(rows)).classementB).not.toBeNull();
  });
});

describe('pronosticFerme (au premier match)', () => {
  const t = (s: string) => new Date(s);
  it('ouvert : aucun match commencé et le premier match est dans le futur', () => {
    expect(pronosticFerme([{ status: 'scheduled', scheduledAt: '2026-11-08T20:00:00.000Z' }, { status: 'scheduled', scheduledAt: '2026-11-09T20:00:00.000Z' }], t('2026-11-08T19:59:00.000Z'))).toBe(false);
  });
  it('fermé dès l\'heure du premier match programmé (même sans résultat)', () => {
    expect(pronosticFerme([{ status: 'scheduled', scheduledAt: '2026-11-08T20:00:00.000Z' }, { status: 'scheduled', scheduledAt: '2026-11-09T20:00:00.000Z' }], t('2026-11-08T20:00:00.000Z'))).toBe(true);
  });
  it('fermé si un match est en cours ou joué, quelle que soit l\'heure', () => {
    expect(pronosticFerme([{ status: 'live' }, { status: 'scheduled' }], t('2026-01-01T00:00:00.000Z'))).toBe(true);
    expect(pronosticFerme([{ status: 'completed' }], t('2026-01-01T00:00:00.000Z'))).toBe(true);
  });
  it('sans horaire ni résultat : ouvert', () => {
    expect(pronosticFerme([{ status: 'scheduled' }, { status: 'bye' }], t('2026-11-20T00:00:00.000Z'))).toBe(false);
  });
});

describe('classerTournoi', () => {
  const reel = reelDepuisVue(vueMasters(tournoi('finale')));

  it('pronostic parfait sur les poules, finalistes et championne partiels : points + picks, classés', () => {
    const l = classerTournoi(
      [
        { nom: 'Moi', pronostic: prono({ vainqueursDemis: ['a1', 'b1'], champion: 'a1' }), picks: 30 },
        { nom: 'Laki', pronostic: prono({ vainqueursDemis: ['a1', 'a2'], champion: 'a2' }), picks: 20 },
        { nom: 'Thomas', pronostic: null, picks: 25 },
      ],
      reel,
    );
    // Réel : poules A et B comme prévu (16 + 16), finalistes a1 et a2, championne a2.
    // Moi : 32 (poules) + 8 (a1 finaliste) + 0 = 40 + 30 picks = 70. Laki : 32 + 16 (a1 et a2) + 16 (championne) = 64 + 20 = 84.
    expect(l.map((x) => [x.rang, x.nom, x.total])).toEqual([[1, 'Laki', 84], [2, 'Moi', 70], [3, 'Thomas', 25]]);
    expect(l[0].pronostic).toMatchObject({ qualifies: 16, places: 16, finalistes: 16, champion: 16, total: 64 });
    expect(l[2].pronostic).toBeNull();
  });

  it('égalité : les ex æquo partagent le rang (1, 1, 3)', () => {
    const l = classerTournoi(
      [
        { nom: 'Moi', pronostic: null, picks: 50 },
        { nom: 'Laki', pronostic: null, picks: 50 },
        { nom: 'Thomas', pronostic: null, picks: 10 },
      ],
      reel,
    );
    expect(l.map((x) => [x.rang, x.nom])).toEqual([[1, 'Laki'], [1, 'Moi'], [3, 'Thomas']]);
  });
});
