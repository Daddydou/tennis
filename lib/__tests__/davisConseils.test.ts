// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { EQUIPES_DAVIS_2026, equipeDeNation, ordreOfficiel, programmeQuart, type CodeNation } from '../davisEquipes';
import { analyseRencontre, analyseTableau, composition, modeleMatch, plansComplets, plansPicks, probaElo, type RencontreEtat } from '../davisConseils';

const ELO = new Map<string, number>([
  ['Flavio Cobolli', 2146], ['Lorenzo Musetti', 2281], ['Luciano Darderi', 2060],
  ['Soon Woo Kwon', 2092], ['Hyeon Chung', 1841], ['Seong Chan Hong', 1921], ['Uisung Park', 1686],
  ['Jakub Mensik', 2235], ['Jiri Lehecka', 2258], ['Felix Auger Aliassime', 2272], ['Denis Shapovalov', 2195],
  ['Arthur Fery', 2109], ['Cameron Norrie', 2168], ['Alexander Zverev', 2437], ['Jan Lennard Struff', 2152],
  ['Jurij Rodionov', 2016], ['Lukas Neumayer', 1910], ['Carlos Alcaraz', 2583], ['Rafael Jodar', 2231], ['Alejandro Davidovich Fokina', 2288],
]);
const eq = (c: CodeNation) => EQUIPES_DAVIS_2026.find((e) => e.code === c)!;
const analyser = (a: CodeNation, b: CodeNation) => analyseRencontre(composition(eq(a), eq(b), ELO), [eq(a).domicile, eq(b).domicile]);
const QF: RencontreEtat[] = [
  { tour: 'QF', position: 0, nation1: 'ITA', nation2: 'KOR', vainqueur: null, score: null },
  { tour: 'QF', position: 1, nation1: 'CZE', nation2: 'CAN', vainqueur: null, score: null },
  { tour: 'QF', position: 2, nation1: 'GBR', nation2: 'GER', vainqueur: null, score: null },
  { tour: 'QF', position: 3, nation1: 'AUT', nation2: 'ESP', vainqueur: null, score: null },
];

describe('modèle d’un match', () => {
  it('égalité : 50 %, issues symétriques et qui somment à 1', () => {
    const m = modeleMatch(0.5);
    expect(m.issues.A20 + m.issues.A21 + m.issues.B20 + m.issues.B21).toBeCloseTo(1, 6);
    expect(m.issues.A20).toBeCloseTo(m.issues.B20, 6);
    expect(m.ecarts.A20).toBeCloseTo(m.ecarts.B20, 6);
  });
  it('favori net : surtout 2-0, et un gros écart de jeux', () => {
    const m = modeleMatch(0.9);
    expect(m.issues.A20 + m.issues.A21).toBeCloseTo(0.9, 2);
    expect(m.issues.A20).toBeGreaterThan(m.issues.A21);
    expect(m.ecarts.A20).toBeGreaterThan(m.ecarts.A21);
    expect(m.ecarts.A20).toBeGreaterThan(5);
  });
  it('formule Elo', () => {
    expect(probaElo(2000, 2000)).toBe(0.5);
    expect(probaElo(2400, 2000)).toBeCloseTo(0.909, 3);
  });
});

describe('composition et rencontre', () => {
  it('par défaut : numéros 2 au simple 1, numéros 1 au simple 2 (classement ATP)', () => {
    const c = composition(eq('ESP'), eq('AUT'), ELO);
    expect(c.simple1.map((j) => j.nom)).toEqual(['Rafael Jódar', 'Lukas Neumayer']);
    expect(c.simple2.map((j) => j.nom)).toEqual(['Carlos Alcaraz', 'Jurij Rodionov']);
  });
  it('composition imposée (ordre des matchs annoncé)', () => {
    const c = composition(eq('ESP'), eq('AUT'), ELO, { simple1: ['Alejandro Davidovich Fokina', null] });
    expect(c.simple1[0]).toMatchObject({ nom: 'Alejandro Davidovich Fokina', elo: 2288, eloConnu: true });
  });
  it('joueur absent de l’Elo maison : Elo par défaut, signalé', () => {
    const c = composition(eq('ITA'), eq('KOR'), new Map());
    expect(c.simple2[0].eloConnu).toBe(false);
  });
  it('les issues d’une rencontre somment à 1 ; le double n’est joué qu’à 1-1', () => {
    const r = analyser('CZE', 'CAN');
    expect(Object.values(r.issues).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
    expect(r.matchs[2].pJoue).toBeCloseTo(r.issues.A21 + r.issues.B21, 6);
  });
  it('Espagne – Autriche : Espagne très favorite, ses points de pick bien au-dessus de 15', () => {
    const r = analyser('ESP', 'AUT');
    expect(r.pA).toBeGreaterThan(0.85);
    expect(r.pointsPickA).toBeGreaterThan(15);
    expect(r.pointsPickB).toBeLessThan(3);
  });
  it('l’Italie joue à domicile', () => {
    const avec = analyseRencontre(composition(eq('ITA'), eq('CZE'), ELO), [true, false]).pA;
    const sans = analyseRencontre(composition(eq('ITA'), eq('CZE'), ELO), [false, false]).pA;
    expect(avec).toBeGreaterThan(sans);
  });
});

describe('tableau', () => {
  const t = analyseTableau(QF, analyser);
  it('chances : un titre par nation, total 100 % ; quatre demi-finalistes, deux finalistes', () => {
    expect(t.chances.reduce((s, c) => s + c.titre, 0)).toBeCloseTo(1, 6);
    expect(t.chances.reduce((s, c) => s + c.demie, 0)).toBeCloseTo(4, 6);
    expect(t.chances.reduce((s, c) => s + c.finale, 0)).toBeCloseTo(2, 6);
  });
  it('bracket cohérent : 7 choix, demies parmi les quarts retenus, finale parmi les demies retenues', () => {
    expect(t.bracket).toHaveLength(7);
    const qf = t.bracket.filter((b) => b.tour === 'QF').map((b) => b.nation);
    const sf = t.bracket.filter((b) => b.tour === 'SF');
    expect(qf.slice(0, 2)).toContain(sf[0].nation);
    expect(qf.slice(2)).toContain(sf[1].nation);
    expect(sf.map((b) => b.nation)).toContain(t.bracket[6].nation);
  });
  it('rencontre jouée : son vainqueur est certain', () => {
    const joue = QF.map((r) => (r.position === 1 ? { ...r, vainqueur: 'CAN' as CodeNation, score: '2-1' as const } : r));
    const t2 = analyseTableau(joue, analyser);
    expect(t2.chances.find((c) => c.nation === 'CAN')!.demie).toBe(1);
    expect(t2.chances.find((c) => c.nation === 'CZE')!.titre).toBe(0);
  });
});

describe('picks', () => {
  it('16 plans (4 × 4), triés ; les meilleurs prennent les gros favoris des quarts', () => {
    const p = plansPicks(QF, analyser);
    expect(p).toHaveLength(16);
    expect(p[0].points).toBeGreaterThanOrEqual(p[15].points);
    expect(['ITA', 'ESP']).toContain(p[0].quartHaut === 'ITA' ? 'ITA' : p[0].quartBas);
  });
});

describe('équipes', () => {
  it('feuille de match officielle : orientée dans le sens demandé, absente si non annoncée', () => {
    expect(ordreOfficiel('CZE', 'CAN')?.simple1).toEqual(['Tomas Machac', 'Liam Draxl']);
    expect(ordreOfficiel('CAN', 'CZE')?.simple2).toEqual(['Félix Auger-Aliassime', 'Jiri Lehecka']);
    expect(ordreOfficiel('ITA', 'KOR')).toBeNull();
    // Chaque nom de la feuille de match est bien un joueur de simple de son équipe (sinon il serait ignoré).
    const o = ordreOfficiel('CZE', 'CAN')!;
    const c = composition(eq('CZE'), eq('CAN'), ELO, { simple1: o.simple1, simple2: o.simple2 });
    expect([...c.simple1, ...c.simple2].map((j) => j.nom)).toEqual([...o.simple1, ...o.simple2]);
  });
  it('programme réel des quarts : République Tchèque – Canada ouvre la semaine, dans un sens ou dans l’autre', () => {
    expect(programmeQuart('CAN', 'CZE')?.libelle).toMatch(/mar\. 24/);
    expect(programmeQuart('ITA', 'KOR')?.libelle).toMatch(/mer\. 25/);
    expect(programmeQuart('ITA', 'ESP')).toBeNull();
  });

  it('nation retrouvée par son nom en base (accents et casse ignorés)', () => {
    expect(equipeDeNation('République Tchèque')?.code).toBe('CZE');
    expect(equipeDeNation('republique tcheque')?.code).toBe('CZE');
    expect(equipeDeNation('France')).toBeNull();
  });
});

describe('plan complet des picks', () => {
  const plans = plansComplets(QF, analyser);
  it('quatre picks, quatre pays différents, un par moitié en quart', () => {
    const p = plans[0];
    expect(p.picks.map((x) => x.slot)).toEqual(['QF-top', 'QF-bottom', 'SF', 'F']);
    expect(new Set(p.picks.map((x) => x.nation)).size).toBe(4);
    expect(['ITA', 'KOR', 'CZE', 'CAN']).toContain(p.picks[0].nation);
    expect(['GBR', 'GER', 'AUT', 'ESP']).toContain(p.picks[1].nation);
    expect(p.points).toBeCloseTo(p.picks.reduce((s, x) => s + x.points, 0), 6);
  });
  it('les plans sont classés ; chaque pick de demie ou de finale vise un pays qui peut y être', () => {
    expect(plans[0].points).toBeGreaterThanOrEqual(plans[plans.length - 1].points);
    for (const p of plans) for (const x of p.picks) expect(x.pJoue).toBeGreaterThan(0);
  });
  it('garder un favori pour plus tard fait partie des plans étudiés (Espagne en finale)', () => {
    const tous = plansComplets(QF, analyser, {}, 1000);
    const garde = tous.find((p) => p.picks[3].nation === 'ESP');
    expect(garde).toBeDefined();
    expect(garde!.picks[3].pJoue).toBeGreaterThan(0.5);
  });
  it('un pick déjà posé est imposé', () => {
    const p = plansComplets(QF, analyser, { 'QF-top': 'CZE', 'QF-bottom': 'GBR' })[0];
    expect(p.picks[0]).toMatchObject({ nation: 'CZE', pose: true, planB: null });
    expect(p.picks[1].nation).toBe('GBR');
  });
});
