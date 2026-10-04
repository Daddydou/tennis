// @vitest-environment node
/**
 * API BRACKET DE THOMAS — lib/thomasApi.ts, sur l'exemple réel
 * exemple-api-tennis-brackets.json (US Open WTA 2026, terminé).
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ErreurFormatThomas,
  desaccordsResultat,
  lireBracket,
  lireIds,
  lireTournois,
  recalculerPointsTotaux,
  statistiquesPronostics,
  validerBracket,
  type BracketThomas,
} from '../thomasApi';

// Fichier gitignoré (vrais pseudos et userId de l'app de Thomas) : présent en
// local seulement. Sans lui, ces tests sont ignorés au lieu d'échouer.
const EXEMPLE = fileURLToPath(new URL('../../exemple-api-tennis-brackets.json', import.meta.url));
const PRESENT = existsSync(EXEMPLE);
const BRUT = PRESENT ? JSON.parse(readFileSync(EXEMPLE, 'utf8')) : null;
const avecExemple = describe.skipIf(!PRESENT);
const exemple = () => lireBracket(structuredClone(BRUT));
const pseudoDe = (b: BracketThomas) => new Map(b.participants.map((p) => [p.userId, p.pseudo]));

avecExemple('exemple réel', () => {
  it('se lit sans erreur et passe la validation', () => {
    const b = exemple();
    expect(b.tournoi).toMatchObject({ tour: 'WTA', drawSize: 128, verrouille: true });
    expect(b.joueurs).toHaveLength(128);
    expect(b.tours).toHaveLength(7);
    expect(validerBracket(b)).toEqual([]);
  });

  it('recalculerPointsTotaux retombe exactement sur 310 / 240 / 322', () => {
    const b = exemple();
    const points = recalculerPointsTotaux(b.tours);
    const parPseudo = Object.fromEntries([...points].map(([u, p]) => [pseudoDe(b).get(u), p]));
    expect(parPseudo).toEqual({ Daddy: 310, Laki: 240, moustiton: 322 });
    // … et donc sur les pointsTotaux de Thomas, sans les avoir lus.
    for (const p of b.participants) expect(points.get(p.userId)).toBe(p.pointsTotaux);
  });

  it('notre jugement (position = vainqueur) concorde avec chaque « resultat » de Thomas', () => {
    expect(desaccordsResultat(exemple().tours)).toEqual([]);
  });

  it('le barème est un paramètre', () => {
    const b = exemple();
    const unPoint = recalculerPointsTotaux(b.tours, () => 1);
    // 279 pronostics corrects au total dans l'exemple.
    expect([...unPoint.values()].reduce((a, n) => a + n, 0)).toBe(279);
  });
});

avecExemple('joueurAbsent', () => {
  it('est lu true quand présent, false quand la clé manque', () => {
    const pronos = exemple().tours.flatMap((t) => t.matchs.flatMap((m) => m.pronostics));
    expect(pronos.filter((p) => p.joueurAbsent)).toHaveLength(25);
    expect(pronos.every((p) => typeof p.joueurAbsent === 'boolean')).toBe(true);
  });

  it('est compté à part, jamais dans les ratés classiques ni dans le taux', () => {
    const stats = [...statistiquesPronostics(exemple().tours).values()];
    const somme = (k: 'correct' | 'rate' | 'rateJoueurAbsent') => stats.reduce((a, s) => a + s[k], 0);
    expect(somme('rateJoueurAbsent')).toBe(25);
    // 102 « rate » chez Thomas = 77 ratés classiques + 25 joueurAbsent.
    expect(somme('rate')).toBe(77);
    expect(somme('correct')).toBe(279);
    for (const s of stats) expect(s.tauxClassique).toBeCloseTo(s.correct / (s.correct + s.rate), 12);
  });

  it('basculer un pronostic en joueurAbsent ne change pas le taux classique des autres matchs', () => {
    const b = exemple();
    const u = b.participants[0].userId;
    // Un raté classique de ce participant…
    const m = b.tours[0].matchs.find((x) => x.pronostics.some((p) => p.userId === u && p.position !== x.vainqueur))!;
    const avant = statistiquesPronostics(b.tours).get(u)!;
    m.pronostics.find((p) => p.userId === u)!.joueurAbsent = true;
    const apres = statistiquesPronostics(b.tours).get(u)!;
    // … sort du dénominateur au lieu de compter comme un échec.
    expect(apres.rate).toBe(avant.rate - 1);
    expect(apres.rateJoueurAbsent).toBe(avant.rateJoueurAbsent + 1);
    expect(apres.tauxClassique).toBeCloseTo(apres.correct / (apres.correct + apres.rate), 12);
  });
});

avecExemple('tournoi non verrouillé', () => {
  const nonVerrouille = (listes: Record<string, unknown>) => ({
    jeu: 'tennis',
    jeuTennis: 'bracket',
    tournoi: { ...BRUT.tournoi, statut: 'UPCOMING', verrouille: false, lockAt: '2026-10-20T10:00:00.000Z' },
    ...listes,
  });

  it('listes vides : lu sans erreur, validation vide, aucun point', () => {
    const b = lireBracket(nonVerrouille({ participants: [], joueurs: [], tours: [] }));
    expect(b.tournoi.verrouille).toBe(false);
    expect(b.tournoi.lockAt).toBe('2026-10-20T10:00:00.000Z');
    expect(validerBracket(b)).toEqual([]);
    expect(recalculerPointsTotaux(b.tours).size).toBe(0);
    expect(statistiquesPronostics(b.tours).size).toBe(0);
  });

  it('listes absentes : lues comme vides', () => {
    const b = lireBracket(nonVerrouille({}));
    expect([b.participants, b.joueurs, b.tours]).toEqual([[], [], []]);
  });

  it('non verrouillé mais avec des données : signalé', () => {
    const b = lireBracket(nonVerrouille({ participants: BRUT.participants, joueurs: [], tours: [] }));
    expect(validerBracket(b).join()).toMatch(/non verrouillé/);
  });
});

avecExemple('tournoi en cours (valeurs encore inconnues)', () => {
  it('match sans vainqueur ni positions, pronostic sans position : accepté', () => {
    const brut = structuredClone(BRUT);
    const finale = brut.tours[6].matchs[0];
    Object.assign(finale, { position1: null, position2: null, vainqueur: null, score: null });
    finale.pronostics[0] = { ...finale.pronostics[0], position: null, resultat: 'sans_prono' };
    finale.pronostics[1] = { ...finale.pronostics[1], resultat: 'en_attente' };
    finale.pronostics[2] = { ...finale.pronostics[2], resultat: 'en_attente' };
    brut.tours[6].statut = 'IN_PROGRESS';
    const b = lireBracket(brut);
    expect(validerBracket(b)).toEqual([]);
    expect(desaccordsResultat(b.tours)).toEqual([]);
    const stats = [...statistiquesPronostics(b.tours).values()];
    expect(stats.reduce((a, s) => a + s.sansProno, 0)).toBe(1);
  });
});

avecExemple('validation : erreurs de mapping détectées', () => {
  it('position hors tableau', () => {
    const b = exemple();
    b.joueurs[0].position = 129;
    expect(validerBracket(b).join('\n')).toMatch(/129 hors de 1\.\.128/);
  });

  it('userId inconnu', () => {
    const b = exemple();
    b.tours[0].matchs[0].pronostics[0].userId = 'inconnu';
    expect(validerBracket(b).join('\n')).toMatch(/userId inconnu \(inconnu\)/);
  });

  it('index de match décalé (positions hors du bloc)', () => {
    const b = exemple();
    [b.tours[0].matchs[0].index, b.tours[0].matchs[1].index] = [1, 0];
    expect(validerBracket(b).join('\n')).toMatch(/hors du bloc de ce match/);
  });

  it('vainqueur absent du match', () => {
    const b = exemple();
    b.tours[0].matchs[0].vainqueur = 3;
    expect(validerBracket(b).join('\n')).toMatch(/vainqueur 3 absent du match/);
  });

  it('« resultat » contredit par notre jugement : désaccord signalé', () => {
    const b = exemple();
    const p = b.tours[0].matchs[0].pronostics[0];
    p.resultat = p.resultat === 'correct' ? 'rate' : 'correct';
    expect(desaccordsResultat(b.tours)).toHaveLength(1);
  });
});

avecExemple('format', () => {
  it('champ manquant : erreur avec le chemin exact', () => {
    const brut = structuredClone(BRUT);
    delete brut.tours[2].matchs[3].index;
    expect(() => lireBracket(brut)).toThrow(ErreurFormatThomas);
    expect(() => lireBracket(brut)).toThrow('$.tours[2].matchs[3].index');
  });

  it('resultat inconnu refusé', () => {
    const brut = structuredClone(BRUT);
    brut.tours[0].matchs[0].pronostics[0].resultat = 'gagne';
    expect(() => lireBracket(brut)).toThrow(/resultat/);
  });
});

// Indépendant de l'exemple : tourne partout.
describe('format /tournaments et /ids', () => {
  it('/tournaments et /ids : tableau nu ou objet à un tableau, sinon erreur claire', () => {
    expect(lireTournois([{ id: 'a', nom: 'X', updatedAt: '2026-10-01T00:00:00Z' }])).toEqual([
      { id: 'a', nom: 'X', updatedAt: '2026-10-01T00:00:00Z' },
    ]);
    expect(lireTournois({ tournois: [{ id: 'b' }] })).toEqual([{ id: 'b', nom: null, updatedAt: null }]);
    expect(lireIds(['a', 'b'])).toEqual(['a', 'b']);
    expect(lireIds({ ids: [{ id: 'c' }] })).toEqual(['c']);
    expect(() => lireIds({ a: [], b: [] })).toThrow(/clés reçues : a, b/);
    expect(() => lireTournois({ tournois: [{ nom: 'sans id' }] })).toThrow(ErreurFormatThomas);
  });
});
