/**
 * COUPE DAVIS (phase finale à 8 nations) — logique PURE : aucun import React / Next / Supabase.
 *
 * Règles du jeu (page « Règles » de Thomas, état du 12/11/2026 ; détail dans le Project, doc
 * `claude/regles-coupe-davis.md`) :
 *  - 8 nations : quarts (4 rencontres), demies (2), finale (1). Une rencontre = deux simples, puis un
 *    double SEULEMENT si les nations sont à 1-1. Chaque match se joue en deux sets gagnants.
 *  - Trois jeux : picks par pays, bracket des nations, pronos des matchs.
 *
 *  PICKS PAR PAYS — en quart un pays dans chaque moitié du tableau, en demie un seul, en finale un seul ;
 *  un pays ne se pique qu'une fois sur la compétition ; chaque tour ferme à sa première rencontre.
 *    Pays vainqueur : 5 + 3 par match d'écart + écart de jeux de chacun de ses matchs gagnés.
 *    Pays battu     : écart de jeux de ses matchs gagnés.
 *    Écart de jeux = jeux gagnés − jeux perdus, plancher 0 MATCH PAR MATCH (confirmé par Daddy).
 *    Forfait : aucun jeu (écart 0) ; abandon : seuls les sets entièrement joués comptent. Même convention
 *    que le jeu des picks classique (lib/scoring.ts), confirmée par Daddy le 12/11/2026.
 *
 *  BRACKET DES NATIONS — avant le premier quart : nation gagnante + score (2-0 ou 2-1) de chaque
 *    rencontre. Nation juste 2 / 4 / 8 (quart / demie / finale), score juste en plus 1 / 2 / 4 ; le score
 *    ne compte qu'avec la bonne nation. 36 points au maximum.
 *
 *  PRONOS DES MATCHS — dès que les deux nations d'une rencontre sont connues : nation gagnante + score en
 *    sets de chacun des trois matchs. Bonne nation 2, bon score +1, carton plein (tous les matchs joués
 *    justes, sets compris) +2 ; le tout × 1 / 2 / 3 selon le tour. Un double pas joué ne compte pas ;
 *    sur un forfait ou un abandon seul le vainqueur compte.
 *
 * La Coupe Davis n'entre pas encore au palmarès ni dans la Race : ses mises restent à fixer.
 */

import { setTermine } from './scoring';

/* ------------------------------------------------------------------ */
/*  Vocabulaire                                                        */
/* ------------------------------------------------------------------ */

export const TOURS_DAVIS = ['QF', 'SF', 'F'] as const;
export type TourDavis = (typeof TOURS_DAVIS)[number];

export const LIBELLE_TOUR_DAVIS: Record<TourDavis, string> = { QF: 'Quarts', SF: 'Demi-finales', F: 'Finale' };
export const MULTIPLICATEUR_TOUR: Record<TourDavis, number> = { QF: 1, SF: 2, F: 3 };
export const NB_RENCONTRES: Record<TourDavis, number> = { QF: 4, SF: 2, F: 1 };

/** Côté d'une rencontre ou d'un match : 1 = nation1 (joueur1), 2 = nation2 (joueur2). */
export type Cote = 1 | 2;
/** Ordre d'un match dans la rencontre : simple 1, simple 2, double. */
export type OrdreMatch = 1 | 2 | 3;
export const ORDRES_MATCH: readonly OrdreMatch[] = [1, 2, 3];
export const LIBELLE_MATCH: Record<OrdreMatch, string> = { 1: 'Simple 1', 2: 'Simple 2', 3: 'Double' };

export type ScoreSets = '2-0' | '2-1';
export const SCORES_SETS: readonly ScoreSets[] = ['2-0', '2-1'];

export type StatutMatchDavis = 'a_venir' | 'en_cours' | 'termine' | 'forfait' | 'abandon' | 'non_joue';
export const STATUTS_MATCH_DAVIS: readonly StatutMatchDavis[] = ['a_venir', 'en_cours', 'termine', 'forfait', 'abandon', 'non_joue'];
export const LIBELLE_STATUT_MATCH: Record<StatutMatchDavis, string> = {
  a_venir: 'À venir',
  en_cours: 'En cours',
  termine: 'Terminé',
  forfait: 'Forfait',
  abandon: 'Abandon',
  non_joue: 'Non joué',
};

/** Un set : jeux du côté 1 puis du côté 2 (peu importe qui l'a gagné). */
export interface SetJeux {
  g1: number;
  g2: number;
}

export interface MatchDavis {
  ordre: OrdreMatch;
  joueur1: string | null;
  joueur2: string | null;
  statut: StatutMatchDavis;
  /** Côté vainqueur ; null tant que le match n'est pas tranché. */
  gagnant: Cote | null;
  sets: SetJeux[];
}

export interface RencontreDavis {
  id: string;
  tour: TourDavis;
  /** 1 à 4 en quart, 1 à 2 en demie, 1 en finale. */
  position: number;
  nation1: string | null;
  nation2: string | null;
  /** Début de la rencontre (ISO) ; null = inconnu. */
  debut: string | null;
  matchs: MatchDavis[];
}

/** Comparaison de noms de nations : insensible à la casse et aux espaces autour. */
export function memeNation(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/* ------------------------------------------------------------------ */
/*  Un match, une rencontre                                            */
/* ------------------------------------------------------------------ */

const STATUTS_JOUES: readonly StatutMatchDavis[] = ['termine', 'forfait', 'abandon'];

/** Un match est joué (au sens des points) s'il est tranché : terminé, forfait ou abandon, avec un vainqueur. */
export function matchJoue(m: MatchDavis): boolean {
  return STATUTS_JOUES.includes(m.statut) && m.gagnant !== null;
}

/**
 * Score en sets d'un match terminé normalement, vu du vainqueur. Null sur un forfait, un abandon ou un
 * match sans sets exploitables (seul le vainqueur compte alors).
 */
export function scoreEnSets(m: MatchDavis): ScoreSets | null {
  if (m.statut !== 'termine' || m.gagnant === null) return null;
  let gagnes = 0;
  let perdus = 0;
  for (const s of m.sets) {
    const pour = m.gagnant === 1 ? s.g1 : s.g2;
    const contre = m.gagnant === 1 ? s.g2 : s.g1;
    if (pour > contre) gagnes += 1;
    else if (contre > pour) perdus += 1;
  }
  if (gagnes === 2 && perdus === 0) return '2-0';
  if (gagnes === 2 && perdus === 1) return '2-1';
  return null;
}

/**
 * Écart de jeux du VAINQUEUR d'un match (jeux gagnés − jeux perdus, plancher 0). Forfait : 0 (le match n'a
 * pas eu lieu). Abandon : seuls les sets entièrement joués comptent (le set interrompu est écarté).
 */
export function ecartJeux(m: MatchDavis): number {
  if (!matchJoue(m) || m.statut === 'forfait' || m.gagnant === null) return 0;
  let ecart = 0;
  for (const s of m.sets) {
    if (m.statut === 'abandon' && !setTermine(s.g1, s.g2)) continue;
    ecart += m.gagnant === 1 ? s.g1 - s.g2 : s.g2 - s.g1;
  }
  return Math.max(0, ecart);
}

export interface ResultatRencontre {
  /** Matchs gagnés par chaque côté. */
  victoires: [number, number];
  /** Côté vainqueur de la rencontre (2 matchs gagnés) ; null tant qu'elle n'est pas décidée. */
  gagnant: Cote | null;
  /** 2-0 ou 2-1, une fois la rencontre décidée. */
  score: ScoreSets | null;
}

export function resultatRencontre(r: RencontreDavis): ResultatRencontre {
  const victoires: [number, number] = [0, 0];
  for (const m of r.matchs) {
    if (!matchJoue(m)) continue;
    if (m.gagnant === 1) victoires[0] += 1;
    else victoires[1] += 1;
  }
  const gagnant: Cote | null = victoires[0] >= 2 ? 1 : victoires[1] >= 2 ? 2 : null;
  const score: ScoreSets | null = gagnant === null ? null : victoires[gagnant === 1 ? 1 : 0] === 0 ? '2-0' : '2-1';
  return { victoires, gagnant, score };
}

/** Nation vainqueur d'une rencontre décidée (null sinon, ou si les nations ne sont pas posées). */
export function nationGagnante(r: RencontreDavis): string | null {
  const { gagnant } = resultatRencontre(r);
  if (gagnant === null) return null;
  return gagnant === 1 ? r.nation1 : r.nation2;
}

/** Le double ne se joue que si les nations sont à 1-1 après les deux simples. */
export function doublePossible(r: RencontreDavis): boolean {
  const simples = r.matchs.filter((m) => m.ordre !== 3);
  if (simples.length < 2 || !simples.every(matchJoue)) return false;
  return simples[0].gagnant !== simples[1].gagnant;
}

/* ------------------------------------------------------------------ */
/*  Saisie d'un score                                                  */
/* ------------------------------------------------------------------ */

/**
 * Lit « 6-4 3-6 7-6(5) » en liste de sets (premier nombre = premier côté de la paire, tie-break ignoré).
 * Texte vide : liste vide. Format invalide : null.
 */
export function parserScore(texte: string): SetJeux[] | null {
  const morceaux = texte.trim().split(/[\s,;]+/).filter(Boolean);
  const sets: SetJeux[] = [];
  for (const morceau of morceaux) {
    const m = /^(\d{1,2})-(\d{1,2})(?:\(\d{1,2}\))?$/.exec(morceau);
    if (!m) return null;
    sets.push({ g1: Number(m[1]), g2: Number(m[2]) });
  }
  return sets;
}

/** Sets écrits du point de vue du vainqueur (« 6-4 3-6 6-3 ») -> sets du côté 1 contre le côté 2. */
export function orienterSets(setsDuVainqueur: SetJeux[], gagnant: Cote): SetJeux[] {
  return gagnant === 1 ? setsDuVainqueur : setsDuVainqueur.map((s) => ({ g1: s.g2, g2: s.g1 }));
}

/**
 * Erreurs d'un résultat de match saisi. `setsDuVainqueur` : sets écrits du point de vue du vainqueur.
 * Liste vide = résultat acceptable.
 */
export function validerResultatMatch(statut: StatutMatchDavis, gagnant: Cote | null, setsDuVainqueur: SetJeux[]): string[] {
  const erreurs: string[] = [];
  if (statut === 'a_venir' || statut === 'en_cours' || statut === 'non_joue') {
    if (gagnant !== null) erreurs.push('Un match à venir, en cours ou non joué n’a pas de vainqueur.');
    if (statut !== 'en_cours' && setsDuVainqueur.length > 0) erreurs.push('Un match à venir ou non joué n’a pas de score.');
    return erreurs;
  }
  if (gagnant === null) {
    erreurs.push('Choisis le vainqueur du match.');
    return erreurs;
  }
  if (statut === 'forfait') {
    if (setsDuVainqueur.length > 0) erreurs.push('Un forfait n’a pas de score.');
    return erreurs;
  }
  if (statut === 'abandon') return erreurs;
  // Terminé : deux sets gagnants, donc 2-0 ou 2-1 pour le vainqueur, aucun set à égalité.
  let gagnes = 0;
  let perdus = 0;
  for (const s of setsDuVainqueur) {
    if (s.g1 > s.g2) gagnes += 1;
    else if (s.g2 > s.g1) perdus += 1;
    else erreurs.push('Un set ne peut pas finir à égalité.');
  }
  if (gagnes !== 2 || perdus > 1) erreurs.push('Un match terminé se joue en deux sets gagnants : écris le score du vainqueur (6-4 3-6 6-3).');
  return erreurs;
}

/* ------------------------------------------------------------------ */
/*  Tableau : moitiés, propagation des vainqueurs                      */
/* ------------------------------------------------------------------ */

export type Moitie = 'top' | 'bottom';

/** Moitié du tableau d'une rencontre : quarts 1-2 / 3-4, demies 1 / 2 ; la finale n'en a pas. */
export function moitieDeRencontre(r: Pick<RencontreDavis, 'tour' | 'position'>): Moitie | null {
  if (r.tour === 'QF') return r.position <= 2 ? 'top' : 'bottom';
  if (r.tour === 'SF') return r.position === 1 ? 'top' : 'bottom';
  return null;
}

/**
 * Nations que les tours suivants devraient afficher d'après les rencontres déjà décidées : demie p =
 * vainqueurs des quarts 2p-1 et 2p ; finale = vainqueurs des deux demies. Sert à remplir le tableau après
 * chaque résultat. Clé « SF-1 », « SF-2 », « F-1 ».
 */
export function nationsAttendues(rencontres: RencontreDavis[]): Record<string, { nation1: string | null; nation2: string | null }> {
  const trouver = (tour: TourDavis, position: number) => rencontres.find((r) => r.tour === tour && r.position === position);
  const gagnantDe = (tour: TourDavis, position: number): string | null => {
    const r = trouver(tour, position);
    return r ? nationGagnante(r) : null;
  };
  return {
    'SF-1': { nation1: gagnantDe('QF', 1), nation2: gagnantDe('QF', 2) },
    'SF-2': { nation1: gagnantDe('QF', 3), nation2: gagnantDe('QF', 4) },
    'F-1': { nation1: gagnantDe('SF', 1), nation2: gagnantDe('SF', 2) },
  };
}

/* ------------------------------------------------------------------ */
/*  Fermetures                                                         */
/* ------------------------------------------------------------------ */

/** Une rencontre a commencé si son heure de début est passée ou si l'un de ses matchs n'est plus « à venir ». */
export function rencontreCommencee(r: RencontreDavis, maintenant: Date): boolean {
  if (r.debut && new Date(r.debut).getTime() <= maintenant.getTime()) return true;
  return r.matchs.some((m) => m.statut !== 'a_venir');
}

/** Un tour a commencé dès que sa première rencontre commence. */
export function tourCommence(rencontres: RencontreDavis[], tour: TourDavis, maintenant: Date): boolean {
  return rencontres.some((r) => r.tour === tour && rencontreCommencee(r, maintenant));
}

/** Le bracket ferme au premier quart. */
export function bracketFerme(rencontres: RencontreDavis[], maintenant: Date): boolean {
  return tourCommence(rencontres, 'QF', maintenant);
}

/** Les pronos d'une rencontre ferment à son début. */
export function pronosFermes(r: RencontreDavis, maintenant: Date): boolean {
  return rencontreCommencee(r, maintenant);
}

/* ------------------------------------------------------------------ */
/*  Picks par pays                                                     */
/* ------------------------------------------------------------------ */

export const SLOTS_PICK = ['QF-top', 'QF-bottom', 'SF', 'F'] as const;
export type SlotPick = (typeof SLOTS_PICK)[number];

export const LIBELLE_SLOT_PICK: Record<SlotPick, string> = {
  'QF-top': 'Quarts · moitié haute',
  'QF-bottom': 'Quarts · moitié basse',
  SF: 'Demi-finales',
  F: 'Finale',
};

export const tourDuSlot = (s: SlotPick): TourDavis => (s === 'SF' ? 'SF' : s === 'F' ? 'F' : 'QF');

export interface PickPays {
  slot: SlotPick;
  nation: string;
}

/** Rencontres où un pick de ce slot peut tomber. */
export function rencontresDuSlot(rencontres: RencontreDavis[], slot: SlotPick): RencontreDavis[] {
  const tour = tourDuSlot(slot);
  return rencontres.filter((r) => {
    if (r.tour !== tour) return false;
    if (slot === 'QF-top') return moitieDeRencontre(r) === 'top';
    if (slot === 'QF-bottom') return moitieDeRencontre(r) === 'bottom';
    return true;
  });
}

/** Nations qu'on peut piquer dans ce slot (celles des rencontres du slot, une fois connues). */
export function nationsPickables(rencontres: RencontreDavis[], slot: SlotPick): string[] {
  const noms: string[] = [];
  for (const r of rencontresDuSlot(rencontres, slot)) {
    if (r.nation1) noms.push(r.nation1);
    if (r.nation2) noms.push(r.nation2);
  }
  return noms;
}

/** Rencontre où une nation joue dans ce slot. */
export function rencontreDuPick(rencontres: RencontreDavis[], p: PickPays): RencontreDavis | undefined {
  return rencontresDuSlot(rencontres, p.slot).find((r) => memeNation(r.nation1, p.nation) || memeNation(r.nation2, p.nation));
}

/**
 * Erreurs d'un pick : la nation doit jouer dans le slot, et ne pas avoir déjà été piquée par ce participant
 * dans un AUTRE slot (un pays ne se pique qu'une fois sur la compétition). Liste vide = pick valide.
 */
export function validerPick(rencontres: RencontreDavis[], p: PickPays, autresPicks: PickPays[]): string[] {
  const erreurs: string[] = [];
  if (!rencontreDuPick(rencontres, p)) erreurs.push(`${p.nation} ne joue pas dans « ${LIBELLE_SLOT_PICK[p.slot]} ».`);
  if (autresPicks.some((a) => a.slot !== p.slot && memeNation(a.nation, p.nation))) {
    erreurs.push(`${p.nation} est déjà piqué dans un autre tour : un pays ne se pique qu’une fois.`);
  }
  return erreurs;
}

/** Points d'un côté d'une rencontre au jeu des picks ; null tant que la rencontre n'est pas décidée. */
export function pointsPickCote(r: RencontreDavis, cote: Cote): number | null {
  const res = resultatRencontre(r);
  if (res.gagnant === null) return null;
  let jeux = 0;
  for (const m of r.matchs) {
    if (matchJoue(m) && m.gagnant === cote) jeux += ecartJeux(m);
  }
  if (res.gagnant !== cote) return jeux;
  const ecartMatchs = res.victoires[cote - 1] - res.victoires[cote === 1 ? 1 : 0];
  return POINTS_VICTOIRE_RENCONTRE + POINTS_PAR_MATCH_ECART * ecartMatchs + jeux;
}

export const POINTS_VICTOIRE_RENCONTRE = 5;
export const POINTS_PAR_MATCH_ECART = 3;

/** Points d'un pick ; null tant que sa rencontre n'est pas décidée (ou introuvable). */
export function pointsPick(rencontres: RencontreDavis[], p: PickPays): number | null {
  const r = rencontreDuPick(rencontres, p);
  if (!r) return null;
  return pointsPickCote(r, memeNation(r.nation1, p.nation) ? 1 : 2);
}

/* ------------------------------------------------------------------ */
/*  Bracket des nations                                                */
/* ------------------------------------------------------------------ */

export interface PronoBracket {
  tour: TourDavis;
  position: number;
  nation: string;
  score: ScoreSets;
}

export const POINTS_BRACKET: Record<TourDavis, { nation: number; score: number }> = {
  QF: { nation: 2, score: 1 },
  SF: { nation: 4, score: 2 },
  F: { nation: 8, score: 4 },
};

/** Maximum du bracket : 4 × (2+1) + 2 × (4+2) + 1 × (8+4) = 36. */
export const MAX_BRACKET = TOURS_DAVIS.reduce(
  (somme, t) => somme + NB_RENCONTRES[t] * (POINTS_BRACKET[t].nation + POINTS_BRACKET[t].score),
  0,
);

export interface PointsBracketRencontre {
  nation: number;
  score: number;
  total: number;
}

/** Points d'un pronostic de bracket sur sa rencontre ; null tant qu'elle n'est pas décidée. */
export function pointsBracketRencontre(p: PronoBracket, r: RencontreDavis): PointsBracketRencontre | null {
  const res = resultatRencontre(r);
  if (res.gagnant === null) return null;
  const nationOk = memeNation(p.nation, nationGagnante(r));
  const nation = nationOk ? POINTS_BRACKET[p.tour].nation : 0;
  const score = nationOk && p.score === res.score ? POINTS_BRACKET[p.tour].score : 0;
  return { nation, score, total: nation + score };
}

/* ------------------------------------------------------------------ */
/*  Pronos des matchs                                                  */
/* ------------------------------------------------------------------ */

export interface PronoMatch {
  rencontreId: string;
  ordre: OrdreMatch;
  nation: string;
  sets: ScoreSets;
}

export const POINTS_PRONO_NATION = 2;
export const POINTS_PRONO_SETS = 1;
export const POINTS_PRONO_CARTON = 2;

export interface DetailPronoMatch {
  ordre: OrdreMatch;
  nationJuste: boolean;
  setsJustes: boolean;
  points: number;
}

export interface PointsPronosRencontre {
  details: DetailPronoMatch[];
  carton: boolean;
  /** Avant multiplication par le tour. */
  brut: number;
  /** Après multiplication par le tour : ce qui compte au classement. */
  total: number;
}

/**
 * Points des pronos d'un participant sur une rencontre. Seuls les matchs JOUÉS comptent (un double pas joué
 * est ignoré). Sur un forfait ou un abandon seul le vainqueur compte (pas de bonus de score). Le carton plein
 * (+2) exige la rencontre décidée et tous ses matchs joués justes, sets compris.
 */
export function pointsPronosRencontre(pronos: PronoMatch[], r: RencontreDavis): PointsPronosRencontre {
  const details: DetailPronoMatch[] = [];
  let toutJuste = true;
  let nbJoues = 0;
  for (const m of r.matchs) {
    if (!matchJoue(m)) continue;
    nbJoues += 1;
    const p = pronos.find((x) => x.rencontreId === r.id && x.ordre === m.ordre);
    const reelle = m.gagnant === 1 ? r.nation1 : r.nation2;
    const nationJuste = !!p && memeNation(p.nation, reelle);
    const setsJustes = nationJuste && m.statut === 'termine' && p !== undefined && p.sets === scoreEnSets(m);
    const complet = nationJuste && (m.statut !== 'termine' || setsJustes);
    if (!complet) toutJuste = false;
    details.push({
      ordre: m.ordre,
      nationJuste,
      setsJustes,
      points: (nationJuste ? POINTS_PRONO_NATION : 0) + (setsJustes ? POINTS_PRONO_SETS : 0),
    });
  }
  const decidee = resultatRencontre(r).gagnant !== null;
  const carton = decidee && nbJoues >= 2 && toutJuste;
  const brut = details.reduce((s, d) => s + d.points, 0) + (carton ? POINTS_PRONO_CARTON : 0);
  return { details, carton, brut, total: brut * MULTIPLICATEUR_TOUR[r.tour] };
}

/* ------------------------------------------------------------------ */
/*  Classement du tournoi                                              */
/* ------------------------------------------------------------------ */

export interface PointsParticipantDavis {
  picks: number;
  bracket: number;
  pronos: number;
  total: number;
}

/** Total d'un participant : picks + bracket + pronos (ce que chaque jeu a déjà rapporté). */
export function pointsParticipant(
  rencontres: RencontreDavis[],
  picks: PickPays[],
  bracket: PronoBracket[],
  pronos: PronoMatch[],
): PointsParticipantDavis {
  const pPicks = picks.reduce((s, p) => s + (pointsPick(rencontres, p) ?? 0), 0);
  const pBracket = bracket.reduce((s, p) => {
    const r = rencontres.find((x) => x.tour === p.tour && x.position === p.position);
    return s + (r ? (pointsBracketRencontre(p, r)?.total ?? 0) : 0);
  }, 0);
  const pPronos = rencontres.reduce((s, r) => s + pointsPronosRencontre(pronos, r).total, 0);
  return { picks: pPicks, bracket: pBracket, pronos: pPronos, total: pPicks + pBracket + pPronos };
}

/* ------------------------------------------------------------------ */
/*  Bracket : cohérence de la saisie                                   */
/* ------------------------------------------------------------------ */

/**
 * Erreurs d'un bracket saisi (liste de rencontres pronostiquées, toutes ou une partie). Quart : la nation doit
 * jouer ce quart. Demie : l'une des deux nations choisies vainqueurs des quarts qui l'alimentent. Finale :
 * l'une des deux nations choisies vainqueurs des demies. Liste vide = bracket cohérent.
 */
export function validerBracket(rencontres: RencontreDavis[], lignes: PronoBracket[]): string[] {
  const erreurs: string[] = [];
  const trouver = (tour: TourDavis, position: number) => lignes.find((l) => l.tour === tour && l.position === position);
  const libelle = (l: PronoBracket) => `${LIBELLE_TOUR_DAVIS[l.tour]} ${l.position}`;
  for (const l of lignes) {
    if (!SCORES_SETS.includes(l.score)) erreurs.push(`${libelle(l)} : score invalide.`);
    if (l.tour === 'QF') {
      const r = rencontres.find((x) => x.tour === 'QF' && x.position === l.position);
      if (!r || !(memeNation(r.nation1, l.nation) || memeNation(r.nation2, l.nation))) {
        erreurs.push(`${libelle(l)} : ${l.nation} ne joue pas ce quart.`);
      }
      continue;
    }
    const sources =
      l.tour === 'SF'
        ? [trouver('QF', 2 * l.position - 1), trouver('QF', 2 * l.position)]
        : [trouver('SF', 1), trouver('SF', 2)];
    const permises = sources.filter((s): s is PronoBracket => !!s).map((s) => s.nation);
    if (permises.length < 2) {
      erreurs.push(`${libelle(l)} : choisis d’abord les vainqueurs du tour précédent.`);
    } else if (!permises.some((n) => memeNation(n, l.nation))) {
      erreurs.push(`${libelle(l)} : ${l.nation} n’est pas un de tes deux vainqueurs du tour précédent.`);
    }
  }
  return erreurs;
}
