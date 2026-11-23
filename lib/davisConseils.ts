/**
 * CONSEILS COUPE DAVIS — modèle PUR (ni React, ni Next, ni Supabase) : chances de chaque rencontre et
 * meilleurs choix pour les trois jeux (picks par pays, bracket des nations, pronos des matchs).
 * Barème : lib/davis.ts (référence) ; règles : Project, doc `claude/regles-coupe-davis.md`.
 *
 * MODÈLE
 *  - Simple : Elo maison (surface dur) des deux joueurs ; l'Italie joue à domicile (+AVANTAGE_DOMICILE).
 *    Probabilité de gagner le match = formule Elo. Double : note de la paire (lib/davisEquipes.ts).
 *  - Sets et jeux : on retrouve la probabilité de gagner un set (match en deux sets gagnants), puis celle
 *    de gagner un jeu, et on en tire la répartition 2-0 / 2-1 et l'écart de jeux moyen d'un match gagné
 *    (utile au barème des picks : 5 + 3 par match d'écart + écart de jeux des matchs gagnés).
 *  - Rencontre : simple 1 (les numéros 2), simple 2 (les numéros 1), double seulement à 1-1. Tous les cas
 *    sont énumérés : pas de tirage au hasard, résultats exacts pour le modèle.
 *  - Tableau : énumération de tous les vainqueurs possibles (rencontres déjà jouées = fixées).
 *
 * Limites : l'Elo ne connaît ni la forme du jour ni la fatigue ; la note de double est fixée à la main ;
 * la composition réelle (annoncée la veille) peut changer les chiffres : la saisir dans l'écran.
 */
import type { CodeNation, EquipeDavis } from './davisEquipes';
import { joueursDeSimple } from './davisEquipes';

/** Bonus d'Elo du pays hôte (Bologne : l'Italie). */
export const AVANTAGE_DOMICILE = 40;
/** Elo d'un joueur absent de l'Elo maison. */
export const ELO_INCONNU = 1850;

export const probaElo = (a: number, b: number): number => 1 / (1 + 10 ** (-(a - b) / 400));

/* ------------------------------------------------------------------ */
/*  Match : sets et jeux                                               */
/* ------------------------------------------------------------------ */

const matchDepuisSet = (s: number) => s * s * (3 - 2 * s);

function inverse(f: (x: number) => number, cible: number): number {
  let bas = 0;
  let haut = 1;
  for (let i = 0; i < 50; i++) {
    const m = (bas + haut) / 2;
    if (f(m) < cible) bas = m;
    else haut = m;
  }
  return (bas + haut) / 2;
}

interface ModeleSet {
  pGagne: number;
  /** Écart de jeux moyen d'un set gagné (positif). */
  margeGagne: number;
  /** Écart de jeux moyen d'un set perdu, vu du vainqueur du set (positif). */
  margePerdu: number;
}

/** Set à 6 jeux (jeu décisif à 6-6), chaque jeu gagné avec la probabilité q : calcul exact. */
function modeleSet(q: number): ModeleSet {
  // prob[a][b] = probabilité d'atteindre le score a-b.
  const prob: number[][] = Array.from({ length: 8 }, () => new Array(8).fill(0));
  prob[0][0] = 1;
  let pG = 0;
  let mG = 0;
  let pP = 0;
  let mP = 0;
  const fin = (a: number, b: number) => (a === 6 && b <= 4) || (b === 6 && a <= 4) || a === 7 || b === 7;
  for (let total = 0; total <= 12; total++) {
    for (let a = 0; a <= Math.min(7, total); a++) {
      const b = total - a;
      if (b < 0 || b > 7) continue;
      const p = prob[a][b];
      if (!p) continue;
      if (fin(a, b)) {
        if (a > b) {
          pG += p;
          mG += p * (a - b);
        } else {
          pP += p;
          mP += p * (b - a);
        }
        continue;
      }
      if (a === 6 && b === 6) {
        // Jeu décisif : gagné avec la même probabilité qu'un jeu, écart d'un jeu.
        pG += p * q;
        mG += p * q;
        pP += p * (1 - q);
        mP += p * (1 - q);
        continue;
      }
      prob[a + 1][b] += p * q;
      prob[a][b + 1] += p * (1 - q);
    }
  }
  return { pGagne: pG, margeGagne: pG ? mG / pG : 0, margePerdu: pP ? mP / pP : 0 };
}

export type Issue = 'A20' | 'A21' | 'B20' | 'B21';
export const ISSUES: readonly Issue[] = ['A20', 'A21', 'B20', 'B21'];

export interface ModeleMatch {
  /** Probabilité que le côté A gagne le match. */
  pA: number;
  /** Probabilité de chaque issue (côté gagnant + score en sets). */
  issues: Record<Issue, number>;
  /** Écart de jeux moyen du vainqueur selon l'issue (jamais négatif). */
  ecarts: Record<Issue, number>;
}

const cacheMatch = new Map<number, ModeleMatch>();

/** Issues d'un match en deux sets gagnants quand A le gagne avec la probabilité pA. */
export function modeleMatch(pA: number): ModeleMatch {
  const cle = Math.round(pA * 1000) / 1000;
  const deja = cacheMatch.get(cle);
  if (deja) return deja;
  const s = inverse(matchDepuisSet, Math.min(0.999, Math.max(0.001, cle)));
  const q = inverse((x) => modeleSet(x).pGagne, s);
  const set = modeleSet(q);
  const r: ModeleMatch = {
    pA: cle,
    issues: { A20: s * s, A21: 2 * s * s * (1 - s), B20: (1 - s) * (1 - s), B21: 2 * (1 - s) * (1 - s) * s },
    ecarts: {
      A20: 2 * set.margeGagne,
      A21: Math.max(0, 2 * set.margeGagne - set.margePerdu),
      B20: 2 * set.margePerdu,
      B21: Math.max(0, 2 * set.margePerdu - set.margeGagne),
    },
  };
  cacheMatch.set(cle, r);
  return r;
}

/* ------------------------------------------------------------------ */
/*  Composition et rencontre                                           */
/* ------------------------------------------------------------------ */

export interface JoueurElo {
  nom: string;
  elo: number;
  /** Faux : Elo absent de l'Elo maison (ELO_INCONNU utilisé). */
  eloConnu: boolean;
}

export interface Composition {
  /** Simple 1 : les numéros 2 de chaque équipe. [côté A, côté B]. */
  simple1: [JoueurElo, JoueurElo];
  /** Simple 2 : les numéros 1. */
  simple2: [JoueurElo, JoueurElo];
  /** Notes des paires de double [A, B]. */
  double: [number, number];
  pairesDouble: [string, string];
}

/** Elo d'un joueur de l'équipe (Elo maison, dur) ; ELO_INCONNU s'il n'y est pas. */
export function joueurElo(nom: string, nomElo: string | null, elo: ReadonlyMap<string, number>): JoueurElo {
  const v = nomElo ? elo.get(nomElo) : undefined;
  return { nom, elo: v ?? ELO_INCONNU, eloConnu: v !== undefined };
}

/**
 * Composition par défaut : numéros 1 et 2 de chaque équipe d'après le classement ATP, sauf choix
 * explicite (`choix` : noms des joueurs retenus pour le simple 1 et le simple 2, côté A puis côté B).
 */
export function composition(
  a: EquipeDavis,
  b: EquipeDavis,
  elo: ReadonlyMap<string, number>,
  choix: { simple1?: [string | null, string | null]; simple2?: [string | null, string | null] } = {},
): Composition {
  const pour = (e: EquipeDavis, rang: 0 | 1, impose: string | null | undefined): JoueurElo => {
    const simples = joueursDeSimple(e);
    const j = (impose && simples.find((x) => x.nom === impose)) || simples[rang] || simples[0];
    return joueurElo(j.nom, j.nomElo, elo);
  };
  return {
    simple1: [pour(a, 1, choix.simple1?.[0]), pour(b, 1, choix.simple1?.[1])],
    simple2: [pour(a, 0, choix.simple2?.[0]), pour(b, 0, choix.simple2?.[1])],
    double: [a.noteDouble, b.noteDouble],
    pairesDouble: [a.pairePressentie, b.pairePressentie],
  };
}

export type Score = '2-0' | '2-1';

export interface Prono {
  cote: 'A' | 'B';
  score: Score;
  /** Probabilité que ce prono soit juste (nation et sets). */
  pExact: number;
  /** Probabilité que la nation soit la bonne. */
  pNation: number;
  /** Points espérés sans le carton plein ni le multiplicateur du tour : 2 × P(nation) + P(exact). */
  points: number;
}

export interface AnalyseMatch {
  libelle: 'Simple 1' | 'Simple 2' | 'Double';
  joueurA: string;
  joueurB: string;
  eloA: number | null;
  eloB: number | null;
  pA: number;
  /** Probabilité que le match soit joué (le double seulement à 1-1). */
  pJoue: number;
  modele: ModeleMatch;
  meilleurProno: Prono;
}

export interface AnalyseRencontre {
  pA: number;
  /** Issue de la rencontre : côté gagnant et score (2-0 ou 2-1). */
  issues: Record<Issue, number>;
  /** Points de pick espérés si l'on a choisi la nation A, ou la B. */
  pointsPickA: number;
  pointsPickB: number;
  matchs: [AnalyseMatch, AnalyseMatch, AnalyseMatch];
}

function meilleurProno(m: ModeleMatch): Prono {
  const options: Prono[] = ISSUES.map((i) => {
    const cote = i[0] as 'A' | 'B';
    const pNation = cote === 'A' ? m.pA : 1 - m.pA;
    const pExact = m.issues[i];
    return { cote, score: i.endsWith('20') ? '2-0' : '2-1', pExact, pNation, points: 2 * pNation + pExact };
  });
  return options.sort((x, y) => y.points - x.points)[0];
}

export function analyseRencontre(c: Composition, domicile: [boolean, boolean] = [false, false]): AnalyseRencontre {
  const bonus = (i: 0 | 1) => (domicile[i] ? AVANTAGE_DOMICILE : 0);
  const p1 = probaElo(c.simple1[0].elo + bonus(0), c.simple1[1].elo + bonus(1));
  const p2 = probaElo(c.simple2[0].elo + bonus(0), c.simple2[1].elo + bonus(1));
  const pd = probaElo(c.double[0] + bonus(0), c.double[1] + bonus(1));
  const m1 = modeleMatch(p1);
  const m2 = modeleMatch(p2);
  const md = modeleMatch(pd);

  const issues: Record<Issue, number> = { A20: 0, A21: 0, B20: 0, B21: 0 };
  let ptsA = 0;
  let ptsB = 0;
  let pUnPartout = 0;
  for (const o1 of ISSUES) {
    for (const o2 of ISSUES) {
      const p12 = m1.issues[o1] * m2.issues[o2];
      const gagnes = (o: Issue[], cote: 'A' | 'B', modeles: ModeleMatch[]) => o.reduce((s, x, k) => s + (x[0] === cote ? modeles[k].ecarts[x] : 0), 0);
      if (o1[0] === o2[0]) {
        const g = o1[0] as 'A' | 'B';
        issues[`${g}20` as Issue] += p12;
        const ecart = gagnes([o1, o2], g, [m1, m2]);
        if (g === 'A') ptsA += p12 * (5 + 3 * 2 + ecart);
        else ptsB += p12 * (5 + 3 * 2 + ecart);
        continue;
      }
      pUnPartout += p12;
      for (const od of ISSUES) {
        const p = p12 * md.issues[od];
        const g = od[0] as 'A' | 'B';
        issues[`${g}21` as Issue] += p;
        const tous: Issue[] = [o1, o2, od];
        const mods = [m1, m2, md];
        const eA = gagnes(tous, 'A', mods);
        const eB = gagnes(tous, 'B', mods);
        ptsA += p * (g === 'A' ? 5 + 3 + eA : eA);
        ptsB += p * (g === 'B' ? 5 + 3 + eB : eB);
      }
    }
  }
  const analyse = (libelle: AnalyseMatch['libelle'], jA: string, jB: string, eA: number | null, eB: number | null, m: ModeleMatch, pJoue: number): AnalyseMatch => ({
    libelle,
    joueurA: jA,
    joueurB: jB,
    eloA: eA,
    eloB: eB,
    pA: m.pA,
    pJoue,
    modele: m,
    meilleurProno: meilleurProno(m),
  });
  return {
    pA: issues.A20 + issues.A21,
    issues,
    pointsPickA: ptsA,
    pointsPickB: ptsB,
    matchs: [
      analyse('Simple 1', c.simple1[0].nom, c.simple1[1].nom, c.simple1[0].eloConnu ? c.simple1[0].elo : null, c.simple1[1].eloConnu ? c.simple1[1].elo : null, m1, 1),
      analyse('Simple 2', c.simple2[0].nom, c.simple2[1].nom, c.simple2[0].eloConnu ? c.simple2[0].elo : null, c.simple2[1].eloConnu ? c.simple2[1].elo : null, m2, 1),
      analyse('Double', c.pairesDouble[0], c.pairesDouble[1], null, null, md, pUnPartout),
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Tableau entier                                                     */
/* ------------------------------------------------------------------ */

export type TourDavis = 'QF' | 'SF' | 'F';

export interface RencontreEtat {
  tour: TourDavis;
  position: number;
  nation1: CodeNation | null;
  nation2: CodeNation | null;
  /** Vainqueur déjà connu (rencontre jouée). */
  vainqueur: CodeNation | null;
  /** Score réel (« 2-0 » / « 2-1 ») si joué. */
  score: Score | null;
}

/** Analyse d'une rencontre entre deux nations (composition par défaut ou saisie). */
export type Analyseur = (a: CodeNation, b: CodeNation) => AnalyseRencontre;

type Distribution = Map<string, number>; // « ITA|2-0 » -> probabilité

function distributionRencontre(r: RencontreEtat | undefined, a: CodeNation, b: CodeNation, analyser: Analyseur): Distribution {
  const d: Distribution = new Map();
  if (r?.vainqueur && r.nation1 === a && r.nation2 === b) {
    d.set(`${r.vainqueur}|${r.score ?? '2-0'}`, 1);
    return d;
  }
  const x = analyser(a, b);
  d.set(`${a}|2-0`, x.issues.A20);
  d.set(`${a}|2-1`, x.issues.A21);
  d.set(`${b}|2-0`, x.issues.B20);
  d.set(`${b}|2-1`, x.issues.B21);
  return d;
}

export interface ChoixBracket {
  tour: TourDavis;
  position: number;
  nation: CodeNation;
  score: Score;
  pNation: number;
  pExact: number;
  points: number;
}

export interface ChancesNation {
  nation: CodeNation;
  demie: number;
  finale: number;
  titre: number;
}

export interface AnalyseTableau {
  chances: ChancesNation[];
  bracket: ChoixBracket[];
  /** Probabilité de chaque (nation, score) par rencontre : `${tour}${position}` -> distribution. */
  distributions: Map<string, Distribution>;
}

export const POINTS_BRACKET: Record<TourDavis, [number, number]> = { QF: [2, 1], SF: [4, 2], F: [8, 4] };

/**
 * Chances de chaque nation et meilleur bracket (nation + score de chaque rencontre, cohérent : une demie
 * se joue entre deux nations retenues en quart, la finale entre les deux retenues en demie).
 * `quarts` : les 4 quarts dans l'ordre (0 et 1 = haut du tableau, 2 et 3 = bas).
 */
export function analyseTableau(rencontres: RencontreEtat[], analyser: Analyseur): AnalyseTableau {
  const qf = [0, 1, 2, 3].map((i) => rencontres.find((r) => r.tour === 'QF' && r.position === i));
  const sf = [0, 1].map((i) => rencontres.find((r) => r.tour === 'SF' && r.position === i));
  const fi = rencontres.find((r) => r.tour === 'F');
  const distributions = new Map<string, Distribution>();
  const add = (d: Distribution, cle: string, p: number) => d.set(cle, (d.get(cle) ?? 0) + p);

  const dQf = qf.map((r, i) => {
    if (!r?.nation1 || !r.nation2) throw new Error(`Quart ${i + 1} incomplet`);
    const d = distributionRencontre(r, r.nation1, r.nation2, analyser);
    distributions.set(`QF${i}`, d);
    return d;
  });
  const vainqueurs = (d: Distribution) => {
    const m = new Map<CodeNation, number>();
    for (const [k, p] of d) m.set(k.split('|')[0] as CodeNation, (m.get(k.split('|')[0] as CodeNation) ?? 0) + p);
    return m;
  };
  const dSf: Distribution[] = [new Map(), new Map()];
  for (const h of [0, 1]) {
    for (const [x, px] of vainqueurs(dQf[2 * h])) {
      for (const [y, py] of vainqueurs(dQf[2 * h + 1])) {
        const r = sf[h]?.nation1 === x && sf[h]?.nation2 === y ? sf[h] : undefined;
        for (const [k, p] of distributionRencontre(r, x, y, analyser)) add(dSf[h], k, px * py * p);
      }
    }
    distributions.set(`SF${h}`, dSf[h]);
  }
  const dF: Distribution = new Map();
  for (const [x, px] of vainqueurs(dSf[0])) {
    for (const [y, py] of vainqueurs(dSf[1])) {
      const r = fi?.nation1 === x && fi?.nation2 === y ? fi : undefined;
      for (const [k, p] of distributionRencontre(r, x, y, analyser)) add(dF, k, px * py * p);
    }
  }
  distributions.set('F0', dF);

  const nations = qf.flatMap((r) => [r!.nation1!, r!.nation2!]);
  const chances: ChancesNation[] = nations
    .map((n) => ({
      nation: n,
      demie: dQf.reduce((s, d) => s + (vainqueurs(d).get(n) ?? 0), 0),
      finale: dSf.reduce((s, d) => s + (vainqueurs(d).get(n) ?? 0), 0),
      titre: vainqueurs(dF).get(n) ?? 0,
    }))
    .sort((a, b) => b.titre - a.titre || b.finale - a.finale);

  // Bracket : meilleur choix par rencontre, restreint aux nations retenues au tour précédent.
  const meilleur = (tour: TourDavis, position: number, d: Distribution, permises: Set<string> | null): ChoixBracket => {
    const [pn, ps] = POINTS_BRACKET[tour];
    let best: ChoixBracket | null = null;
    for (const [k, pExact] of d) {
      const [nation, score] = k.split('|') as [CodeNation, Score];
      if (permises && !permises.has(nation)) continue;
      const pNation = (d.get(`${nation}|2-0`) ?? 0) + (d.get(`${nation}|2-1`) ?? 0);
      const points = pn * pNation + ps * pExact;
      if (!best || points > best.points) best = { tour, position, nation, score, pNation, pExact, points };
    }
    return best!;
  };
  const bracket: ChoixBracket[] = dQf.map((d, i) => meilleur('QF', i, d, null));
  const sfChoix = [0, 1].map((h) => meilleur('SF', h, dSf[h], new Set([bracket[2 * h].nation, bracket[2 * h + 1].nation])));
  bracket.push(...sfChoix);
  bracket.push(meilleur('F', 0, dF, new Set(sfChoix.map((c) => c.nation))));
  return { chances, bracket, distributions };
}

/* ------------------------------------------------------------------ */
/*  Picks par pays                                                     */
/* ------------------------------------------------------------------ */

export interface PlanPicks {
  quartHaut: CodeNation;
  quartBas: CodeNation;
  /** Points espérés sur les quatre picks (demie et finale choisies au mieux le moment venu). */
  points: number;
  pointsQuarts: number;
  /** Probabilité de n'avoir aucun pays disponible en finale (les deux finalistes déjà pickés). */
  pFinaleSansPick: number;
}

/**
 * Plans de picks classés : chaque paire de quarts (un pays par moitié), puis, une fois les demies et la
 * finale connues, le pays non encore utilisé qui rapporte le plus (choix « glouton » à chaque tour).
 */
export function plansPicks(rencontres: RencontreEtat[], analyser: Analyseur): PlanPicks[] {
  const qf = [0, 1, 2, 3].map((i) => rencontres.find((r) => r.tour === 'QF' && r.position === i)!);
  const memo = new Map<string, number>();
  const ept = (a: CodeNation, b: CodeNation): number => {
    const k = `${a}|${b}`;
    if (!memo.has(k)) memo.set(k, analyser(a, b).pointsPickA);
    return memo.get(k)!;
  };
  const pGagne = (a: CodeNation, b: CodeNation) => analyser(a, b).pA;
  const plans: PlanPicks[] = [];
  const haut = [qf[0].nation1!, qf[0].nation2!, qf[1].nation1!, qf[1].nation2!];
  const bas = [qf[2].nation1!, qf[2].nation2!, qf[3].nation1!, qf[3].nation2!];
  const adversaireQf = (n: CodeNation) => {
    const r = qf.find((x) => x.nation1 === n || x.nation2 === n)!;
    return r.nation1 === n ? r.nation2! : r.nation1!;
  };
  // Vainqueurs possibles des quarts (une rencontre jouée a un vainqueur certain).
  const issuesQf = qf.map((r) => {
    const p = r.vainqueur ? (r.vainqueur === r.nation1 ? 1 : 0) : pGagne(r.nation1!, r.nation2!);
    return [
      { n: r.nation1!, p },
      { n: r.nation2!, p: 1 - p },
    ];
  });
  const sf = [0, 1].map((i) => rencontres.find((r) => r.tour === 'SF' && r.position === i));
  const pDemie = (h: number, x: CodeNation, y: CodeNation) => {
    const r = sf[h];
    if (r?.vainqueur && r.nation1 === x && r.nation2 === y) return r.vainqueur === x ? 1 : 0;
    return pGagne(x, y);
  };
  for (const h of haut) {
    for (const b of bas) {
      const pointsQuarts = ept(h, adversaireQf(h)) + ept(b, adversaireQf(b));
      let total = pointsQuarts;
      let sansPick = 0;
      for (const a0 of issuesQf[0]) for (const a1 of issuesQf[1]) for (const a2 of issuesQf[2]) for (const a3 of issuesQf[3]) {
        const pQ = a0.p * a1.p * a2.p * a3.p;
        const demies: [CodeNation, CodeNation][] = [[a0.n, a1.n], [a2.n, a3.n]];
        const utilises = new Set<CodeNation>([h, b]);
        let choixSf: CodeNation | null = null;
        let bestSf = -1;
        for (const [x, y] of demies) {
          for (const [u, v] of [[x, y], [y, x]] as [CodeNation, CodeNation][]) {
            if (!utilises.has(u) && ept(u, v) > bestSf) {
              bestSf = ept(u, v);
              choixSf = u;
            }
          }
        }
        if (choixSf) {
          total += pQ * bestSf;
          utilises.add(choixSf);
        }
        const issuesSf = demies.map(([x, y], k) => [
          { n: x, p: pDemie(k, x, y) },
          { n: y, p: 1 - pDemie(k, x, y) },
        ]);
        for (const f0 of issuesSf[0]) for (const f1 of issuesSf[1]) {
          const p = pQ * f0.p * f1.p;
          const options = [
            [f0.n, f1.n],
            [f1.n, f0.n],
          ].filter(([u]) => !utilises.has(u as CodeNation)) as [CodeNation, CodeNation][];
          if (!options.length) {
            sansPick += p;
            continue;
          }
          total += p * Math.max(...options.map(([u, v]) => ept(u, v)));
        }
      }
      plans.push({ quartHaut: h, quartBas: b, points: total, pointsQuarts, pFinaleSansPick: sansPick });
    }
  }
  return plans.sort((x, y) => y.points - x.points);
}

/* ------------------------------------------------------------------ */
/*  Plan complet des picks (comme le plan des tournois classiques)     */
/* ------------------------------------------------------------------ */

export type SlotDavis = 'QF-top' | 'QF-bottom' | 'SF' | 'F';
export const SLOTS_DAVIS: readonly SlotDavis[] = ['QF-top', 'QF-bottom', 'SF', 'F'];

export interface PickPlan {
  slot: SlotDavis;
  nation: CodeNation;
  /** Points espérés de ce pick (0 si la nation ne joue pas ce tour). */
  points: number;
  /** Probabilité que la nation joue ce tour (1 en quart). */
  pJoue: number;
  /** Probabilité qu'elle gagne la rencontre de ce tour. */
  pGagne: number;
  /** Pick déjà posé (lu chez Game Tracker) : imposé au plan. */
  pose: boolean;
  /** Meilleure autre nation pour ce slot, les autres picks inchangés. */
  planB: { nation: CodeNation; points: number } | null;
}

export interface PlanComplet {
  picks: PickPlan[];
  points: number;
}

/**
 * Plan des quatre picks (quart haut, quart bas, demie, finale), un pays une seule fois : la combinaison qui
 * rapporte le plus de points ESPÉRÉS, en tenant compte des chances de chaque nation d'atteindre la demie
 * ou la finale (un favori peut être gardé pour plus tard, comme le plan des tournois classiques). Les picks
 * déjà posés sont imposés. Le plan se recalcule à chaque résultat : il ne fige rien.
 * Renvoie les meilleurs plans, du meilleur au moins bon.
 */
export function plansComplets(
  rencontres: RencontreEtat[],
  analyser: Analyseur,
  poses: Partial<Record<SlotDavis, CodeNation>> = {},
  combien = 5,
): PlanComplet[] {
  const qf = [0, 1, 2, 3].map((i) => rencontres.find((r) => r.tour === 'QF' && r.position === i)!);
  const sf = [0, 1].map((i) => rencontres.find((r) => r.tour === 'SF' && r.position === i));
  const fi = rencontres.find((r) => r.tour === 'F');
  const memo = new Map<string, AnalyseRencontre>();
  const an = (a: CodeNation, b: CodeNation) => {
    const k = `${a}|${b}`;
    if (!memo.has(k)) memo.set(k, analyser(a, b));
    return memo.get(k)!;
  };
  const ept = (a: CodeNation, b: CodeNation) => an(a, b).pointsPickA;
  const pVictoire = (r: RencontreEtat | undefined, a: CodeNation, b: CodeNation) => {
    if (r?.vainqueur && ((r.nation1 === a && r.nation2 === b) || (r.nation1 === b && r.nation2 === a))) return r.vainqueur === a ? 1 : 0;
    return an(a, b).pA;
  };

  // Rencontres possibles de chaque tour : paire -> probabilité.
  const gagnantQf = qf.map((r) => {
    const p = pVictoire(r, r.nation1!, r.nation2!);
    return new Map<CodeNation, number>([
      [r.nation1!, p],
      [r.nation2!, 1 - p],
    ]);
  });
  const pairesSf: Map<string, number>[] = [0, 1].map((h) => {
    const m = new Map<string, number>();
    for (const [x, px] of gagnantQf[2 * h]) for (const [y, py] of gagnantQf[2 * h + 1]) if (px * py > 0) m.set(`${x}|${y}`, px * py);
    return m;
  });
  const gagnantSf = [0, 1].map((h) => {
    const m = new Map<CodeNation, number>();
    for (const [k, p] of pairesSf[h]) {
      const [x, y] = k.split('|') as [CodeNation, CodeNation];
      const px = pVictoire(sf[h], x, y);
      m.set(x, (m.get(x) ?? 0) + p * px);
      m.set(y, (m.get(y) ?? 0) + p * (1 - px));
    }
    return m;
  });
  const pairesF = new Map<string, number>();
  for (const [x, px] of gagnantSf[0]) for (const [y, py] of gagnantSf[1]) if (px * py > 0) pairesF.set(`${x}|${y}`, px * py);

  // Valeur d'une nation sur un slot : points espérés, probabilité de jouer, probabilité de gagner ce tour.
  const valeur = (slot: SlotDavis, n: CodeNation): { points: number; pJoue: number; pGagne: number } => {
    if (slot === 'QF-top' || slot === 'QF-bottom') {
      const r = qf.slice(slot === 'QF-top' ? 0 : 2, slot === 'QF-top' ? 2 : 4).find((x) => x.nation1 === n || x.nation2 === n);
      if (!r) return { points: -Infinity, pJoue: 0, pGagne: 0 };
      const adv = r.nation1 === n ? r.nation2! : r.nation1!;
      return { points: ept(n, adv), pJoue: 1, pGagne: pVictoire(r, n, adv) };
    }
    const paires = slot === 'SF' ? [...pairesSf[0], ...pairesSf[1]] : [...pairesF];
    let points = 0;
    let pJoue = 0;
    let pGagne = 0;
    for (const [k, p] of paires) {
      const [x, y] = k.split('|') as [CodeNation, CodeNation];
      if (x !== n && y !== n) continue;
      const adv = x === n ? y : x;
      const r = slot === 'SF' ? sf.find((s) => s && (s.nation1 === n || s.nation2 === n)) : fi;
      pJoue += p;
      points += p * ept(n, adv);
      pGagne += p * pVictoire(r, n, adv);
    }
    return { points, pJoue, pGagne };
  };

  const nations = qf.flatMap((r) => [r.nation1!, r.nation2!]);
  const candidats: Record<SlotDavis, CodeNation[]> = {
    'QF-top': poses['QF-top'] ? [poses['QF-top']] : [qf[0].nation1!, qf[0].nation2!, qf[1].nation1!, qf[1].nation2!],
    'QF-bottom': poses['QF-bottom'] ? [poses['QF-bottom']] : [qf[2].nation1!, qf[2].nation2!, qf[3].nation1!, qf[3].nation2!],
    SF: poses.SF ? [poses.SF] : nations,
    F: poses.F ? [poses.F] : nations,
  };
  const cache = new Map<string, ReturnType<typeof valeur>>();
  const val = (s: SlotDavis, n: CodeNation) => {
    const k = `${s}|${n}`;
    if (!cache.has(k)) cache.set(k, valeur(s, n));
    return cache.get(k)!;
  };

  const plans: { nations: CodeNation[]; points: number }[] = [];
  for (const h of candidats['QF-top'])
    for (const b of candidats['QF-bottom'])
      for (const s of candidats.SF)
        for (const f of candidats.F) {
          const choix = [h, b, s, f];
          if (new Set(choix).size < 4) continue;
          const points = SLOTS_DAVIS.reduce((t, slot, i) => t + Math.max(0, val(slot, choix[i]).points), 0);
          plans.push({ nations: choix, points });
        }
  plans.sort((x, y) => y.points - x.points);

  return plans.slice(0, combien).map((pl) => ({
    points: pl.points,
    picks: SLOTS_DAVIS.map((slot, i) => {
      const n = pl.nations[i];
      const v = val(slot, n);
      const autres = new Set(pl.nations.filter((_, j) => j !== i));
      const pose = poses[slot] === n;
      let planB: PickPlan['planB'] = null;
      if (!pose) {
        for (const m of candidats[slot]) {
          if (m === n || autres.has(m)) continue;
          const p = val(slot, m).points;
          if (p > 0 && (!planB || p > planB.points)) planB = { nation: m, points: p };
        }
      }
      return { slot, nation: n, points: Math.max(0, v.points), pJoue: v.pJoue, pGagne: v.pGagne, pose, planB };
    }),
  }));
}
