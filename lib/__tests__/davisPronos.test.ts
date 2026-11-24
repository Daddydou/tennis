// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  classementsDavis,
  codeDeDrapeau,
  codeDeJoueur,
  lireBracketGT,
  lirePronosGT,
  lireTexteGT,
  pointsDavisParStock,
  resoudreBracket,
  resoudrePronos,
  type LigneProno,
  type RencontreTable,
} from '../davisPronos';

/** Drapeau emoji d'un code ISO Ã  deux lettres (Ã©vite d'Ã©crire les emojis en dur). */
const F = (iso: string) => [...iso].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('');
const CZ = F('CZ');
const CA = F('CA');
const IT = F('IT');
const KR = F('KR');
const GB = F('GB');
const DE = F('DE');
const ES = F('ES');
const AT = F('AT');

// Texte rÃ©el de l'Ã©cran Â« Pronos Â» du 24/11/2026 (quart TchÃ©quie â€“ Canada commencÃ©, les autres ouverts).
const PAGE_PRONOS = `
Final 8 Coupe Davis
Tableau
Picks
Pronos
Bracket
Classement
Pronos des matchs
Pour chaque match dâ€™une rencontre : la nation gagnante (2 pts) et le score en sets (+1).
0 pt pour lâ€™instant
Quarts de finalepoints Ã—1
Quart 2 Â· mar. 24 nov. Ã  16:00
CommencÃ©e
${CZ} RÃ©publique TchÃ¨que
${CA} Canada
1ER SIMPLE
Ton prono : ${CZ} CZE 2-0
3 pts en jeu
2E SIMPLE
Ton prono : ${CZ} CZE 2-1
3 pts en jeu
DOUBLE
JouÃ© seulement Ã  1-1
Ton prono : ${CZ} CZE 2-1
3 pts en jeu
Tes points : 0 pt
LES PRONOS
Joueur S1 S2 D Pts
Daddy ${CZ} 2-0 ${CZ} 2-1 ${CZ} 2-1 0
Laki ${CZ} 2-0 ${CZ} 2-1 ${CZ} 2-0 0
moustiton ${CZ} 2-1 ${CZ} 2-1 ${CZ} 2-0 0
Quart 1 Â· mer. 25 nov. Ã  16:00
${IT} Italie
${KR} CorÃ©e du Sud
1ER SIMPLE
${IT} ITA
${KR} KOR
2-0
2-1
2E SIMPLE
${IT} ITA
${KR} KOR
2-0
2-1
DOUBLE
JouÃ© seulement Ã  1-1
${IT} ITA
${KR} KOR
2-0
2-1
Ferme demain Ã  16:00
Demi-finalespoints Ã—2
Demie 1 Â· ven. 27 nov. Ã  16:00
Vainqueur quart 1
Vainqueur quart 2
Les pronos ouvrent quand les deux nations sont connues.
`;

// Texte rÃ©el de l'Ã©cran Â« Bracket Â» (onglet Moi).
const PAGE_BRACKET = `
Bracket des nations
Moi
Laki
moustiton
Ton bracket : 0 pt Â· encore 36 pts au mieux
Quarts de finale
QUART 1
${IT} Italie en 2-0
3 pts en jeu
QUART 2
${CZ} RÃ©publique TchÃ¨que en 2-0
3 pts en jeu
QUART 3
${DE} Allemagne en 2-0
3 pts en jeu
QUART 4
${ES} Espagne en 2-0
3 pts en jeu
Demi-finales
DEMIE 1
${IT} Italie en 2-1
6 pts en jeu
DEMIE 2
${ES} Espagne en 2-0
6 pts en jeu
Finale
FINALE
${ES} Espagne en 2-0
12 pts en jeu
`;

const TABLEAU: RencontreTable[] = [
  { tour: 'QF', position: 0, nation1: 'ITA', nation2: 'KOR' },
  { tour: 'QF', position: 1, nation1: 'CZE', nation2: 'CAN' },
  { tour: 'QF', position: 2, nation1: 'GBR', nation2: 'GER' },
  { tour: 'QF', position: 3, nation1: 'AUT', nation2: 'ESP' },
  { tour: 'SF', position: 0, nation1: null, nation2: null },
  { tour: 'SF', position: 1, nation1: null, nation2: null },
  { tour: 'F', position: 0, nation1: null, nation2: null },
];
const PARTICIPANTS = [
  { id: 'id-laki', name: 'Laki' },
  { id: 'id-thomas', name: 'Thomas' },
];

describe('drapeaux et joueurs', () => {
  it('drapeau -> code nation', () => {
    expect(codeDeDrapeau(CZ)).toBe('CZE');
    expect(codeDeDrapeau(GB)).toBe('GBR');
    expect(codeDeDrapeau(AT)).toBe('AUT');
    expect(codeDeDrapeau(F('FR'))).toBeNull();
  });
  it('identifiant de nation de lâ€™import Davis', () => {
    expect(codeDeJoueur('davis-ITA')).toBe('ITA');
    expect(codeDeJoueur('davis-XXX')).toBeNull();
    expect(codeDeJoueur(null)).toBeNull();
  });
});

describe('Ã©cran Pronos', () => {
  const lus = lirePronosGT(PAGE_PRONOS);
  const de = (pseudo: string) => lus.filter((p) => p.pseudo === pseudo).sort((a, b) => a.ordre - b.ordre);

  it('lit la ligne de chaque participant, case par case', () => {
    expect(de('Daddy').map((p) => `${p.ordre}:${p.nation}:${p.sets}`)).toEqual(['1:CZE:2-0', '2:CZE:2-1', '3:CZE:2-1']);
    expect(de('Laki').map((p) => `${p.nation} ${p.sets}`)).toEqual(['CZE 2-0', 'CZE 2-1', 'CZE 2-0']);
    expect(de('moustiton').map((p) => p.sets)).toEqual(['2-1', '2-1', '2-0']);
  });
  it('la rencontre est identifiÃ©e par ses deux nations, pas par un numÃ©ro', () => {
    expect(new Set(lus.map((p) => [...p.nations].sort().join('-')))).toEqual(new Set(['CAN-CZE']));
  });
  it('les rencontres ouvertes sans prono (boutons) ne donnent rien', () => {
    expect(lus.some((p) => p.nations.includes('ITA'))).toBe(false);
  });
  it('un double non jouÃ© (tiret) laisse la case vide sans dÃ©caler les autres', () => {
    const texte = `Quart 1 Â· mer.\n${IT} Italie\n${KR} CorÃ©e du Sud\n1ER SIMPLE\nLES PRONOS\nJoueur S1 S2 D Pts\nLaki ${IT} 2-0 ${IT} 2-1 â€“ 0`;
    const l = lirePronosGT(texte);
    expect(l.map((p) => p.ordre)).toEqual([1, 2]);
  });
  it('seul mon prono (Â« Ton prono Â») est lu avant le dÃ©but de la rencontre', () => {
    const texte = `Quart 1 Â· mer.\n${IT} Italie\n${KR} CorÃ©e du Sud\n1ER SIMPLE\nTon prono : ${IT} ITA 2-0\n3 pts en jeu\n2E SIMPLE\nTon prono : ${KR} KOR 2-1`;
    const l = lirePronosGT(texte);
    expect(l.map((p) => `${p.pseudo} ${p.ordre} ${p.nation} ${p.sets}`)).toEqual(['Daddy 1 ITA 2-0', 'Daddy 2 KOR 2-1']);
  });
  it('lireTexteGT reconnaÃ®t lâ€™Ã©cran', () => {
    expect(lireTexteGT(PAGE_PRONOS).type).toBe('pronos');
    expect(lireTexteGT(PAGE_BRACKET).type).toBe('bracket');
    expect(lireTexteGT('bonjour tout le monde, ceci nâ€™est pas une page').type).toBe('inconnu');
  });
});

describe('Ã©cran Bracket', () => {
  it('lit les sept rencontres', () => {
    const b = lireBracketGT(PAGE_BRACKET);
    expect(b.map((x) => `${x.tour}${x.index}:${x.nation}:${x.sets}`)).toEqual([
      'QF0:ITA:2-0',
      'QF1:CZE:2-0',
      'QF2:GER:2-0',
      'QF3:ESP:2-0',
      'SF0:ITA:2-1',
      'SF1:ESP:2-0',
      'F0:ESP:2-0',
    ]);
  });
});

describe('rattachement Ã  nos rencontres', () => {
  it('pronos : participants retrouvÃ©s (Daddy = moi, moustiton = Thomas), rencontre retrouvÃ©e par ses nations', () => {
    const r = resoudrePronos(lirePronosGT(PAGE_PRONOS), TABLEAU, PARTICIPANTS);
    expect(r.erreurs).toEqual([]);
    expect(r.lignes).toHaveLength(9);
    const moi = r.lignes.filter((l) => l.participantId === null);
    expect(moi.map((l) => `${l.round}${l.matchPosition}-${l.ordre}`)).toEqual(['QF1-1', 'QF1-2', 'QF1-3']);
    expect(r.lignes.filter((l) => l.participantId === 'id-thomas')).toHaveLength(3);
  });
  it('mÃªme avec les quarts rangÃ©s dans un autre ordre chez nous, la rencontre est la bonne', () => {
    const autre: RencontreTable[] = [{ tour: 'QF', position: 0, nation1: 'CAN', nation2: 'CZE' }, ...TABLEAU.slice(2)];
    const r = resoudrePronos(lirePronosGT(PAGE_PRONOS), autre, PARTICIPANTS);
    expect(r.lignes.every((l) => l.matchPosition === 0)).toBe(true);
  });
  it('rencontre absente de notre tableau : avertissement, rien dâ€™Ã©crit', () => {
    const r = resoudrePronos(lirePronosGT(PAGE_PRONOS), TABLEAU.slice(2), PARTICIPANTS);
    expect(r.lignes).toEqual([]);
    expect(r.avertissements[0]).toMatch(/absente de notre tableau/);
  });
  it('bracket : lignes du participant choisi', () => {
    const r = resoudreBracket(lireBracketGT(PAGE_BRACKET), 'Daddy', TABLEAU, PARTICIPANTS);
    expect(r.erreurs).toEqual([]);
    expect(r.lignes).toHaveLength(7);
    expect(r.lignes.every((l) => l.participantId === null && l.jeu === 'bracket' && l.ordre === null)).toBe(true);
  });
  it('bracket : une nation qui ne peut pas gagner la rencontre est refusÃ©e (numÃ©ros qui ne collent pas)', () => {
    const inverse: RencontreTable[] = [
      { tour: 'QF', position: 0, nation1: 'CZE', nation2: 'CAN' },
      { tour: 'QF', position: 1, nation1: 'ITA', nation2: 'KOR' },
      ...TABLEAU.slice(2),
    ];
    const r = resoudreBracket(lireBracketGT(PAGE_BRACKET), 'Daddy', inverse, PARTICIPANTS);
    expect(r.erreurs.length).toBeGreaterThan(0);
    expect(r.erreurs[0]).toMatch(/ne peut pas gagner/);
  });
  it('bracket : pseudo inconnu', () => {
    const r = resoudreBracket(lireBracketGT(PAGE_BRACKET), 'Inconnu' as 'Daddy', TABLEAU, PARTICIPANTS);
    expect(r.lignes).toEqual([]);
    expect(r.erreurs[0]).toMatch(/inconnu/);
  });
});

describe('points', () => {
  // TchÃ©quie â€“ Canada : S1 TchÃ©quie 6-4 6-4, S2 Canada 7-5 6-3, double TchÃ©quie 6-3 7-6 -> TchÃ©quie 2-1.
  const sets = [
    { g1: 1, g2: 0, ordre: 1, statut: 'termine', jeux: [{ g1: 6, g2: 4 }, { g1: 6, g2: 4 }] },
    { g1: 0, g2: 1, ordre: 2, statut: 'termine', jeux: [{ g1: 5, g2: 7 }, { g1: 3, g2: 6 }] },
    { g1: 1, g2: 0, ordre: 3, statut: 'termine', jeux: [{ g1: 6, g2: 3 }, { g1: 7, g2: 6 }] },
  ];
  const ROWS = [
    { round: 'QF', position: 1, player1_id: 'davis-CZE', player2_id: 'davis-CAN', sets },
    { round: 'QF', position: 0, player1_id: 'davis-ITA', player2_id: 'davis-KOR', sets: [] },
  ];
  const L = (participantId: string | null, ordre: 1 | 2 | 3, nation: 'CZE' | 'CAN', s: '2-0' | '2-1'): LigneProno => ({
    participantId,
    round: 'QF',
    matchPosition: 1,
    jeu: 'match',
    ordre,
    nation,
    sets: s,
  });

  it('pronos des matchs : 2 la nation, +1 le score, +2 le carton plein, Ã—1 en quart', () => {
    const lignes: LigneProno[] = [
      // Daddy : S1 CZE 2-0 juste (3), S2 CZE faux (0), D CZE 2-1 : nation juste mais le double s'est jouÃ© en 2-0 (2).
      L(null, 1, 'CZE', '2-0'), L(null, 2, 'CZE', '2-1'), L(null, 3, 'CZE', '2-1'),
      // Laki : S1 (3), S2 CAN 2-0 juste (3), D CZE 2-0 juste (3) + carton plein (2).
      L('id-laki', 1, 'CZE', '2-0'), L('id-laki', 2, 'CAN', '2-0'), L('id-laki', 3, 'CZE', '2-0'),
    ];
    const p = pointsDavisParStock(ROWS, lignes);
    expect(p.get(null)?.pronos).toBe(5);
    expect(p.get('id-laki')?.pronos).toBe(11);
    expect(p.get('id-thomas')).toBeUndefined();
  });
  it('bracket : bonus de score (+1 en quart) seulement avec la bonne nation', () => {
    const bracket = (participantId: string | null, nation: 'CZE' | 'CAN', s: '2-0' | '2-1'): LigneProno => ({
      participantId, round: 'QF', matchPosition: 1, jeu: 'bracket', ordre: null, nation, sets: s,
    });
    const p = pointsDavisParStock(ROWS, [bracket(null, 'CZE', '2-1'), bracket('id-laki', 'CZE', '2-0'), bracket('id-thomas', 'CAN', '2-1')]);
    expect(p.get(null)).toMatchObject({ bracketScore: 1, bracketTotal: 3 });
    expect(p.get('id-laki')).toMatchObject({ bracketScore: 0, bracketTotal: 2 });
    expect(p.get('id-thomas')).toMatchObject({ bracketScore: 0, bracketTotal: 0 });
  });
  it('rencontre pas jouÃ©e : aucun point', () => {
    const p = pointsDavisParStock(ROWS, [{ ...L(null, 1, 'CZE', '2-0'), matchPosition: 0, nation: 'CZE' }]);
    expect(p.get(null)?.pronos).toBe(0);
  });
});

describe('classement des trois mini-tournois', () => {
  const pts = (o: Partial<{ pronos: number; bracketTotal: number; nbPronos: number; nbBracket: number }>) => ({
    pronos: 0, bracketScore: 0, bracketTotal: 0, nbPronos: 0, nbBracket: 0, ...o,
  });
  it('bracket Game Tracker prioritaire, sinon nations du pont doublÃ©es (sans score) ; pronos seulement si importÃ©s', () => {
    const l = classementsDavis([
      { id: null, nom: 'Moi', picks: 10, bracketNationsSeules: null, davis: pts({ pronos: 5, bracketTotal: 3, nbPronos: 3, nbBracket: 7 }) },
      { id: 'a', nom: 'Laki', picks: 4, bracketNationsSeules: 2, davis: null },
      { id: 'b', nom: 'Thomas', picks: 0, bracketNationsSeules: null, davis: null },
    ]);
    expect(l.map((x) => x.nom)).toEqual(['Moi', 'Laki', 'Thomas']);
    expect(l[0]).toMatchObject({ bracket: 3, pronos: 5, picks: 10, total: 18, bracketSansScore: false });
    expect(l[1]).toMatchObject({ bracket: 4, pronos: null, total: 8, bracketSansScore: true });
    expect(l[2]).toMatchObject({ bracket: null, pronos: null, total: 0 });
  });
});