/**
 * PRONOS DE LA COUPE DAVIS (pronos des matchs + score du bracket) - module PUR, sans React / Next / Supabase.
 *
 * Game Tracker ne donne ces deux jeux dans aucune API (celle de Thomas ne donne que les positions du bracket).
 * On lit donc le TEXTE de ses pages (copié-collé de l'écran « Pronos » ou « Bracket »), on le rattache aux
 * rencontres de notre tableau, puis on compte les points avec le barème de lib/davis.ts.
 *
 *   - Écran « Pronos » : toutes les rencontres, avec, pour chacune une fois commencée, la ligne de chaque
 *     participant (S1, S2, Double) ; avant, seulement MON prono (« Ton prono : CZE 2-0 »).
 *   - Écran « Bracket » : un participant à la fois (onglets Moi / Laki / moustiton, non visibles dans le
 *     texte : l'appelant dit de qui il s'agit), « QUART 1 / Italie en 2-0 ».
 *
 * On identifie une rencontre par ses DEUX NATIONS (jamais par le numéro de quart, qui n'est pas l'ordre des
 * dates) ; l'écran Bracket n'a que le numéro : on vérifie alors que la nation pronostiquée peut bien
 * gagner cette rencontre dans notre tableau.
 */
import { resoudreParticipant } from './bracketImport';
import {
  pointsBracketRencontre,
  pointsPronosRencontre,
  type OrdreMatch,
  type PronoMatch,
  type RencontreDavis,
  type ScoreSets,
  type TourDavis,
} from './davis';
import { depuisStockage } from './davisRencontre';
import { EQUIPES_DAVIS_2026, type CodeNation } from './davisEquipes';

/* ------------------------------------------------------------------ */
/*  Lecture du texte de Game Tracker                                   */
/* ------------------------------------------------------------------ */

/** Les trois pseudos du jeu (Daddy = moi, moustiton = Thomas : voir resoudreParticipant). */
export type PseudoGT = 'Daddy' | 'Laki' | 'moustiton';
export const PSEUDOS_GT: readonly PseudoGT[] = ['Daddy', 'Laki', 'moustiton'];

export interface PronoMatchLu {
  pseudo: PseudoGT;
  /** Les deux nations de la rencontre (ordre de l'écran). */
  nations: [CodeNation, CodeNation];
  ordre: OrdreMatch;
  nation: CodeNation;
  sets: ScoreSets;
}

export interface PronoBracketLu {
  tour: TourDavis;
  /** 0-based : « QUART 2 » = 1. */
  index: number;
  nation: CodeNation;
  sets: ScoreSets;
}

export type LectureGT =
  | { type: 'pronos'; pronos: PronoMatchLu[] }
  | { type: 'bracket'; bracket: PronoBracketLu[] }
  | { type: 'inconnu'; erreur: string };

const ISO2_VERS_CODE: Record<string, CodeNation> = {
  IT: 'ITA',
  KR: 'KOR',
  CZ: 'CZE',
  CA: 'CAN',
  GB: 'GBR',
  DE: 'GER',
  AT: 'AUT',
  ES: 'ESP',
};

/** Drapeau (deux indicateurs régionaux) -> code nation ; null si inconnu. */
export function codeDeDrapeau(drapeau: string): CodeNation | null {
  const lettres = [...drapeau].map((c) => String.fromCharCode((c.codePointAt(0) ?? 0) - 0x1f1e6 + 65)).join('');
  return ISO2_VERS_CODE[lettres] ?? null;
}

const FLAG = '[\\u{1F1E6}-\\u{1F1FF}]{2}';
/** Un prono : drapeau, éventuellement le code (« 🇨🇿 CZE 2-0 »), puis le score en sets. */
const PAIRE = `(${FLAG})\\s*(?:[A-Z]{3}\\s+)?(2-[01])(?!\\d)`;
/** Une case d'une ligne de participant : un prono, ou un tiret (rien de pronostiqué / double non joué). */
const RE_CASE = new RegExp(`${PAIRE}|(?<!\\d)[—–-](?!\\d)`, 'gu');
const RE_PAIRE = new RegExp(PAIRE, 'u');
const RE_LIGNE_NATION = new RegExp(`^(${FLAG})\\s+\\S`, 'u');
const RE_LIGNE_PARTICIPANT = /^(Daddy|Laki|moustiton)\b(?:\s*\((?:toi|moi)\))?\s*(.*)$/;
const RE_ENTETE_RENCONTRE = /^(quart\s*\d|demie\s*\d|finale\b)/i;
const RE_BRACKET_ENTETE = /^(QUART|DEMIE|FINALE)\s*(\d+)?$/i;
const RE_BRACKET_LIGNE = new RegExp(`^(${FLAG})\\s+.+?\\s+en\\s+(2-[01])(?!\\d)`, 'u');

const lignes = (texte: string) =>
  texte
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

const estSets = (s: string): s is ScoreSets => s === '2-0' || s === '2-1';

/** Écran « Pronos » -> un prono par participant, rencontre et match lisibles. */
export function lirePronosGT(texte: string): PronoMatchLu[] {
  const out = new Map<string, PronoMatchLu>();
  let nations: CodeNation[] = [];
  let section: 'entete' | 'matchs' | 'pronos' | 'autre' = 'autre';
  let ordre: OrdreMatch | null = null;

  const poser = (pseudo: PseudoGT, o: OrdreMatch, code: CodeNation | null, sets: string) => {
    if (nations.length !== 2 || !code || !estSets(sets)) return;
    const cle = `${nations.slice().sort().join('-')}|${pseudo}|${o}`;
    out.set(cle, { pseudo, nations: [nations[0], nations[1]], ordre: o, nation: code, sets });
  };

  for (const ligne of lignes(texte)) {
    if (RE_ENTETE_RENCONTRE.test(ligne)) {
      nations = [];
      section = 'entete';
      ordre = null;
      continue;
    }
    if (/^1ER SIMPLE/i.test(ligne)) {
      section = 'matchs';
      ordre = 1;
      continue;
    }
    if (/^2E SIMPLE/i.test(ligne)) {
      section = 'matchs';
      ordre = 2;
      continue;
    }
    if (/^DOUBLE/i.test(ligne)) {
      section = 'matchs';
      ordre = 3;
      continue;
    }
    if (/^LES PRONOS/i.test(ligne)) {
      section = 'pronos';
      continue;
    }

    if (section === 'entete') {
      const m = RE_LIGNE_NATION.exec(ligne);
      const code = m ? codeDeDrapeau(m[1]) : null;
      if (code && nations.length < 2) nations.push(code);
      continue;
    }
    if (section === 'matchs' && ordre !== null && /^Ton prono/i.test(ligne)) {
      const m = RE_PAIRE.exec(ligne);
      if (m) poser('Daddy', ordre, codeDeDrapeau(m[1]), m[2]);
      continue;
    }
    if (section === 'pronos') {
      const m = RE_LIGNE_PARTICIPANT.exec(ligne);
      if (!m) continue;
      const pseudo = m[1] as PseudoGT;
      let k = 0;
      for (const c of m[2].matchAll(RE_CASE)) {
        k += 1;
        if (k > 3) break;
        if (c[1]) poser(pseudo, k as OrdreMatch, codeDeDrapeau(c[1]), c[2]);
      }
    }
  }
  return [...out.values()];
}

const TOUR_DU_MOT: Record<string, TourDavis> = { QUART: 'QF', DEMIE: 'SF', FINALE: 'F' };

/** Écran « Bracket » (un participant) -> sa nation et son score pour chaque rencontre. */
export function lireBracketGT(texte: string): PronoBracketLu[] {
  const out = new Map<string, PronoBracketLu>();
  let courant: { tour: TourDavis; index: number } | null = null;
  for (const ligne of lignes(texte)) {
    const h = RE_BRACKET_ENTETE.exec(ligne);
    if (h) {
      courant = { tour: TOUR_DU_MOT[h[1].toUpperCase()], index: h[2] ? Number(h[2]) - 1 : 0 };
      continue;
    }
    const m = RE_BRACKET_LIGNE.exec(ligne);
    if (m && courant) {
      const code = codeDeDrapeau(m[1]);
      if (code && estSets(m[2])) out.set(`${courant.tour}${courant.index}`, { tour: courant.tour, index: courant.index, nation: code, sets: m[2] });
    }
  }
  return [...out.values()];
}

/** Devine de quel écran vient le texte collé et le lit. */
export function lireTexteGT(texte: string): LectureGT {
  if (texte.trim().length < 20) return { type: 'inconnu', erreur: 'Rien à lire : colle le texte de la page Game Tracker.' };
  const bracket = lireBracketGT(texte);
  if (bracket.length > 0 && !/LES PRONOS|1ER SIMPLE/i.test(texte)) return { type: 'bracket', bracket };
  const pronos = lirePronosGT(texte);
  if (pronos.length > 0) return { type: 'pronos', pronos };
  return {
    type: 'inconnu',
    erreur:
      'Aucun prono reconnu. Colle toute la page « Pronos » (ou « Bracket »), sélectionnée avec Ctrl+A puis copiée ; les drapeaux et les scores doivent être dans le texte.',
  };
}

/* ------------------------------------------------------------------ */
/*  Rattachement à nos rencontres                                      */
/* ------------------------------------------------------------------ */

/** Une rencontre de notre tableau (tn_matches), avec ses nations en code ; null tant qu'elle n'est pas connue. */
export interface RencontreTable {
  tour: TourDavis;
  position: number;
  nation1: CodeNation | null;
  nation2: CodeNation | null;
}

/** Ce qui s'écrit dans tn_davis_pronos (participantId null = moi). */
export interface LigneProno {
  participantId: string | null;
  round: TourDavis;
  matchPosition: number;
  jeu: 'match' | 'bracket';
  ordre: OrdreMatch | null;
  nation: CodeNation;
  sets: ScoreSets;
}

export interface ResolutionPronos {
  lignes: LigneProno[];
  erreurs: string[];
  avertissements: string[];
  /** Phrases à montrer après l'enregistrement. */
  resume: string[];
}

const nomNation = (c: CodeNation) => EQUIPES_DAVIS_2026.find((e) => e.code === c)?.nom ?? c;
const libelleOrdre: Record<OrdreMatch, string> = { 1: 'simple 1', 2: 'simple 2', 3: 'double' };

type Participant = { id: string; name: string };

/** Pronos des matchs lus -> lignes, rencontre retrouvée par ses deux nations. */
export function resoudrePronos(lus: PronoMatchLu[], rencontres: RencontreTable[], participants: Participant[]): ResolutionPronos {
  const lignesOut: LigneProno[] = [];
  const erreurs: string[] = [];
  const avertissements: string[] = [];
  const parRencontre = new Map<string, Set<string>>();

  for (const p of lus) {
    const r = rencontres.find(
      (x) => x.nation1 && x.nation2 && [x.nation1, x.nation2].sort().join() === [...p.nations].sort().join(),
    );
    const nom = `${nomNation(p.nations[0])} – ${nomNation(p.nations[1])}`;
    if (!r) {
      const msg = `Rencontre ${nom} absente de notre tableau : ignorée.`;
      if (!avertissements.includes(msg)) avertissements.push(msg);
      continue;
    }
    if (p.nation !== r.nation1 && p.nation !== r.nation2) {
      erreurs.push(`${nom} (${libelleOrdre[p.ordre]}) : ${nomNation(p.nation)} ne joue pas cette rencontre.`);
      continue;
    }
    const stock = resoudreParticipant(p.pseudo, participants);
    if (!stock.ok) {
      erreurs.push(stock.error);
      continue;
    }
    lignesOut.push({ participantId: stock.stockId, round: r.tour, matchPosition: r.position, jeu: 'match', ordre: p.ordre, nation: p.nation, sets: p.sets });
    const cle = `${nom} · ${p.pseudo}`;
    const set = parRencontre.get(cle) ?? new Set<string>();
    set.add(libelleOrdre[p.ordre]);
    parRencontre.set(cle, set);
  }
  const resume = [...parRencontre.entries()].map(([cle, s]) => `${cle} : ${s.size} prono${s.size > 1 ? 's' : ''}`);
  return { lignes: lignesOut, erreurs: [...new Set(erreurs)], avertissements, resume };
}

/** Nations qui peuvent encore gagner la rencontre (tour, index) d'après notre tableau (QF : ses deux nations). */
function nationsPossibles(tour: TourDavis, index: number, rencontres: RencontreTable[]): Set<CodeNation> {
  if (tour === 'QF') {
    const r = rencontres.find((x) => x.tour === 'QF' && x.position === index);
    return new Set([r?.nation1, r?.nation2].filter((n): n is CodeNation => !!n));
  }
  const dessous: TourDavis = tour === 'SF' ? 'QF' : 'SF';
  const set = new Set<CodeNation>();
  for (const i of [2 * index, 2 * index + 1]) for (const n of nationsPossibles(dessous, i, rencontres)) set.add(n);
  return set;
}

/** Bracket d'un participant (écran « Bracket ») -> lignes, en vérifiant que chaque nation peut gagner sa rencontre. */
export function resoudreBracket(
  lus: PronoBracketLu[],
  pseudo: PseudoGT,
  rencontres: RencontreTable[],
  participants: Participant[],
): ResolutionPronos {
  const erreurs: string[] = [];
  const stock = resoudreParticipant(pseudo, participants);
  if (!stock.ok) return { lignes: [], erreurs: [stock.error], avertissements: [], resume: [] };
  const lignesOut: LigneProno[] = [];
  for (const b of lus) {
    const possibles = nationsPossibles(b.tour, b.index, rencontres);
    if (!possibles.has(b.nation)) {
      erreurs.push(
        `${b.tour === 'QF' ? 'Quart' : b.tour === 'SF' ? 'Demie' : 'Finale'} ${b.index + 1} : ${nomNation(b.nation)} ne peut pas gagner cette rencontre chez nous (numéros différents ?). Rien n'est enregistré.`,
      );
      continue;
    }
    lignesOut.push({ participantId: stock.stockId, round: b.tour, matchPosition: b.index, jeu: 'bracket', ordre: null, nation: b.nation, sets: b.sets });
  }
  const resume = lignesOut.length ? [`Bracket de ${pseudo} : ${lignesOut.length} rencontre${lignesOut.length > 1 ? 's' : ''}`] : [];
  return { lignes: lignesOut, erreurs, avertissements: [], resume };
}

/* ------------------------------------------------------------------ */
/*  Points                                                             */
/* ------------------------------------------------------------------ */

/** La ligne tn_matches utile au calcul. */
export interface LigneRencontreBase {
  round: string;
  position: number | null;
  player1_id: string | null;
  player2_id: string | null;
  sets: unknown;
}

const CODES = EQUIPES_DAVIS_2026.map((e) => e.code) as string[];

/** « davis-ITA » -> « ITA » (identifiants créés par l'import Davis). */
export function codeDeJoueur(id: string | null | undefined): CodeNation | null {
  const m = /^davis-([A-Z]{3})$/.exec(id ?? '');
  return m && CODES.includes(m[1]) ? (m[1] as CodeNation) : null;
}

const TOURS = ['QF', 'SF', 'F'];

/** Rencontres de la base -> rencontres du barème (matchs lus dans tn_matches.sets). */
export function rencontresDavis(rows: LigneRencontreBase[]): RencontreDavis[] {
  return rows
    .filter((r) => TOURS.includes(r.round) && r.position !== null)
    .map((r) => ({
      id: `${r.round}${r.position}`,
      tour: r.round as TourDavis,
      position: (r.position as number) + 1,
      nation1: codeDeJoueur(r.player1_id),
      nation2: codeDeJoueur(r.player2_id),
      debut: null,
      matchs: depuisStockage(r.sets),
    }));
}

export interface PointsDavisStock {
  /** Points des pronos des matchs (déjà multipliés par le tour). */
  pronos: number;
  /** Bonus de score du bracket (+1 / +2 / +4). */
  bracketScore: number;
  /** Bracket complet : bonne nation (2 / 4 / 8) + bonus de score, d'après les pronos de Game Tracker lus. */
  bracketTotal: number;
  /** Nombre de pronos de matchs / de rencontres de bracket enregistrés. */
  nbPronos: number;
  nbBracket: number;
}

/** Points des pronos de chaque stock (null = moi). Un stock sans aucune ligne est absent de la carte. */
export function pointsDavisParStock(rows: LigneRencontreBase[], lignesPronos: LigneProno[]): Map<string | null, PointsDavisStock> {
  const rencontres = rencontresDavis(rows);
  const out = new Map<string | null, PointsDavisStock>();
  const stocks = new Set<string | null>(lignesPronos.map((l) => l.participantId));
  for (const stock of stocks) {
    const siennes = lignesPronos.filter((l) => l.participantId === stock);
    const pronosMatch: PronoMatch[] = siennes
      .filter((l) => l.jeu === 'match' && l.ordre !== null)
      .map((l) => ({ rencontreId: `${l.round}${l.matchPosition}`, ordre: l.ordre as OrdreMatch, nation: l.nation, sets: l.sets }));
    const pronos = rencontres.reduce((s, r) => s + pointsPronosRencontre(pronosMatch, r).total, 0);
    let bracketScore = 0;
    let bracketTotal = 0;
    const bracket = siennes.filter((l) => l.jeu === 'bracket');
    for (const l of bracket) {
      const r = rencontres.find((x) => x.id === `${l.round}${l.matchPosition}`);
      const p = r ? pointsBracketRencontre({ tour: l.round, position: l.matchPosition + 1, nation: l.nation, score: l.sets }, r) : null;
      bracketScore += p?.score ?? 0;
      bracketTotal += p?.total ?? 0;
    }
    out.set(stock, { pronos, bracketScore, bracketTotal, nbPronos: pronosMatch.length, nbBracket: bracket.length });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Les trois mini-tournois du Dashboard                               */
/* ------------------------------------------------------------------ */

export interface ClassementsDavisEntree {
  id: string | null;
  nom: string;
  /** Points Picks par pays (déjà calculés dans tn_picks). */
  picks: number;
  /** Points du bracket des nations d'après tn_bracket_round_picks (nations seules, barème 1/2/4), si connu. */
  bracketNationsSeules: number | null;
  /** Pronos lus sur Game Tracker pour ce stock, s'il y en a. */
  davis: PointsDavisStock | null;
}

export interface LigneClassementDavis {
  id: string | null;
  nom: string;
  /** null = pas encore importé. */
  bracket: number | null;
  /** Le bracket n'a que les nations (pas de score de sets) : points sous-estimés. */
  bracketSansScore: boolean;
  pronos: number | null;
  picks: number;
  total: number;
}

/**
 * Un tableau par stock avec les trois jeux. Bracket : pronos de Game Tracker (nation + score, 2/4/8 + 1/2/4) s'ils
 * sont importés, sinon les nations du pont de Thomas (barème 1/2/4 de scoreDuStock, doublé pour retrouver 2/4/8,
 * sans le bonus de score). Pronos : seulement ceux importés. Un jeu non importé compte 0 dans le total.
 */
export function classementsDavis(entrees: ClassementsDavisEntree[]): LigneClassementDavis[] {
  return entrees
    .map((e) => {
      const aBracketGT = !!e.davis && e.davis.nbBracket > 0;
      const bracket = aBracketGT ? e.davis!.bracketTotal : e.bracketNationsSeules !== null ? e.bracketNationsSeules * 2 : null;
      const pronos = e.davis && e.davis.nbPronos > 0 ? e.davis.pronos : null;
      return {
        id: e.id,
        nom: e.nom,
        bracket,
        bracketSansScore: !aBracketGT && bracket !== null,
        pronos,
        picks: e.picks,
        total: (bracket ?? 0) + (pronos ?? 0) + e.picks,
      };
    })
    .sort((a, b) => b.total - a.total);
}
