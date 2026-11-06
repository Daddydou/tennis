/**
 * PICKS D'UN MASTERS <-> GAME TRACKER — logique PURE (aucun import React / Next / Supabase).
 *
 * Game Tracker décrit un Masters en 5 tours : 1, 2, 3 = journées de poules (deux picks : `haut` = poule A,
 * `bas` = poule B), 4 = demies, 5 = finale (UN pick : `haut`). Les « positions » des joueuses (1 à 8) sont
 * celles de ses pools. Le rapprochement avec nos joueuses se fait par le NOM (jamais par une position de
 * tableau, qui n'existe pas ici).
 *
 * Le code du tableau à élimination directe (lib/gameTrackerPicks.ts : preparerEnvoi, alignement) ne
 * s'applique pas : il suppose des positions de premier tour. On réutilise seulement ses types de lecture.
 */
import { tourPickable, type EtatGT, type PickGT, type TourOuvertGT } from './gameTrackerPicks';
import { phaseDuTour, ROUNDS_MASTERS, type Moitie, type RoundMasters } from './masters';
import { trouverJoueur, type JoueurBase } from './mastersImport';

export function roundDeTourGT(numero: number): RoundMasters | null {
  return ROUNDS_MASTERS[numero - 1] ?? null;
}

export function tourGTDeRound(round: string): number | null {
  const i = (ROUNDS_MASTERS as readonly string[]).indexOf(round);
  return i < 0 ? null : i + 1;
}

/** Valeur de la colonne `tn_picks.phase` pour un tour de Masters. */
export const phaseDeRound = phaseDuTour;

/* ------------------------------------------------------------------ */
/*  Positions Game Tracker <-> nos joueuses                            */
/* ------------------------------------------------------------------ */

export interface PositionsGT {
  /** Position Game Tracker (1 à 8) de chacune de nos joueuses. */
  parId: Map<string, number>;
  parPosition: Map<number, string>;
  erreurs: string[];
}

/**
 * Lit les positions dans tout ce que Game Tracker donne : pools des tours à piquer, picks déjà posés,
 * picks des tours verrouillés. Une même position pour deux joueuses différentes est une erreur.
 */
export function positionsGT(etat: EtatGT, joueurs: JoueurBase[]): PositionsGT {
  const parId = new Map<string, number>();
  const parPosition = new Map<number, string>();
  const erreurs: string[] = [];
  const noter = (position: number, prenom: string | null, nom: string | null) => {
    const r = trouverJoueur(prenom, nom, joueurs);
    if (!r.ok) {
      if (!erreurs.includes(r.erreur)) erreurs.push(r.erreur);
      return;
    }
    const deja = parPosition.get(position);
    if (deja !== undefined && deja !== r.id) {
      erreurs.push(`Position ${position} : deux joueuses différentes (${deja} et ${r.id}).`);
      return;
    }
    parPosition.set(position, r.id);
    parId.set(r.id, position);
  };
  const tours = [etat.tourOuvert, ...etat.toursAVenir].filter((t): t is TourOuvertGT => t !== null);
  for (const t of tours) {
    for (const j of [...t.pool.haut, ...t.pool.bas]) noter(j.position, j.prenom, j.nom);
    for (const p of [t.monPick.haut, t.monPick.bas]) if (p) noter(p.position, p.prenom, p.nom);
  }
  for (const p of etat.dejaPickes) noter(p.position, p.prenom, p.nom);
  for (const t of etat.tours) for (const pk of t.picks) for (const p of [pk.haut, pk.bas]) if (p) noter(p.position, p.prenom, p.nom);
  return { parId, parPosition, erreurs };
}

/* ------------------------------------------------------------------ */
/*  Lire les picks de Game Tracker                                     */
/* ------------------------------------------------------------------ */

export interface PickLuGT {
  /** Pseudo chez Game Tracker ; `moi` = le joueur de la clé. */
  pseudo: string;
  moi: boolean;
  round: RoundMasters;
  half: Moitie | null;
  playerId: string;
  /** Vient d'un tour verrouillé (Game Tracker fait foi) ou d'un tour encore modifiable. */
  verrouille: boolean;
}

/**
 * Tous les picks que Game Tracker montre : les miens sur les tours à piquer, et ceux de tous sur les tours
 * verrouillés. Haut = poule A (`top`), bas = poule B (`bottom`) ; demie et finale : un seul pick, sans moitié.
 */
export function picksDepuisGT(etat: EtatGT, positions: PositionsGT, joueurs: JoueurBase[]): { picks: PickLuGT[]; erreurs: string[] } {
  const picks: PickLuGT[] = [];
  const erreurs: string[] = [];
  const idDe = (p: PickGT): string | null => {
    const id = positions.parPosition.get(p.position);
    if (id) return id;
    const r = trouverJoueur(p.prenom, p.nom, joueurs);
    if (r.ok) return r.id;
    if (!erreurs.includes(r.erreur)) erreurs.push(r.erreur);
    return null;
  };
  const ajouter = (pseudo: string, moi: boolean, numero: number, haut: PickGT | null, bas: PickGT | null, verrouille: boolean) => {
    const round = roundDeTourGT(numero);
    if (!round) return;
    const unique = round === 'SF' || round === 'F';
    for (const [pick, half] of [[haut, unique ? null : 'top'], [bas, 'bottom']] as [PickGT | null, Moitie | null][]) {
      if (!pick || (unique && half === 'bottom')) continue;
      const playerId = idDe(pick);
      if (playerId) picks.push({ pseudo, moi, round, half, playerId, verrouille });
    }
  };
  for (const t of [etat.tourOuvert, ...etat.toursAVenir]) {
    if (t) ajouter('moi', true, t.numero, t.monPick.haut, t.monPick.bas, false);
  }
  for (const t of etat.tours) for (const pk of t.picks) ajouter(pk.pseudo, pk.moi, t.numero, pk.haut, pk.bas, true);
  return { picks, erreurs };
}

/* ------------------------------------------------------------------ */
/*  Préparer l'envoi d'un tour                                         */
/* ------------------------------------------------------------------ */

export interface Souhait {
  half: Moitie | null;
  playerId: string;
}

export interface LigneEnvoiMasters {
  cote: 'haut' | 'bas';
  /** `souhait` : posé d'après notre choix ; `conserve` : on garde ce que Game Tracker a ; `vide`. */
  origine: 'souhait' | 'conserve' | 'vide';
  position: number | null;
  nom: string | null;
  /** Sa journée n'est pas encore jouée : le pick pourra être redirigé. */
  enAttente: boolean;
}

export type PreparationEnvoiMasters =
  | {
      ok: true;
      tour: number;
      round: RoundMasters;
      nomTour: string;
      haut: number | null;
      bas: number | null;
      lignes: LigneEnvoiMasters[];
      /** Game Tracker a déjà exactement ces picks : rien à envoyer. */
      dejaAJour: boolean;
    }
  | { ok: false; raisons: string[] };

export interface ParametresEnvoiMasters {
  etat: EtatGT;
  numeroTour: number;
  /** Ce qu'on veut poser pour ce tour (un par moitié ; un seul, sans moitié, en demie et en finale). */
  souhaits: Souhait[];
  positions: PositionsGT;
  nomDe: (playerId: string) => string;
}

/**
 * Prépare le POST d'un tour. Refus (liste de raisons) si le tour n'est pas piquable ou verrouillé, si une
 * joueuse n'est pas dans la bonne poule, ou si Game Tracker la déclare déjà piquée dans la phase.
 * Un côté sans souhait garde ce que Game Tracker a déjà (l'envoi remplace le pick du tour en entier).
 */
export function preparerEnvoiMasters(p: ParametresEnvoiMasters): PreparationEnvoiMasters {
  const round = roundDeTourGT(p.numeroTour);
  if (!round) return { ok: false, raisons: [`Tour ${p.numeroTour} inconnu pour un Masters.`] };
  const to = tourPickable(p.etat, p.numeroTour);
  if (!to) return { ok: false, raisons: [`Le tour « ${p.numeroTour} » n'est pas (ou plus) ouvert aux picks chez Game Tracker.`] };
  if (to.lockAt !== null && new Date(to.lockAt).getTime() <= new Date(p.etat.maintenant).getTime()) {
    return { ok: false, raisons: [`${to.nom} : verrouillé depuis ${to.lockAt}.`] };
  }

  const unique = to.picksAttendus === 1;
  const raisons: string[] = [];
  const lignes: LigneEnvoiMasters[] = [];

  const resoudre = (cote: 'haut' | 'bas', souhait: Souhait | undefined): number | null => {
    // Demie et finale : un seul pick, pris dans n'importe quelle moitié (les deux côtés du pool).
    const pool = unique ? [...to.pool.haut, ...to.pool.bas] : to.pool[cote];
    const actuel = to.monPick[cote]?.position ?? null;
    if (!souhait) {
      lignes.push({ cote, origine: actuel === null ? 'vide' : 'conserve', position: actuel, nom: to.monPick[cote] ? (p.nomDe(p.positions.parPosition.get(actuel!) ?? '') || null) : null, enAttente: false });
      return actuel;
    }
    const position = p.positions.parId.get(souhait.playerId);
    const entree = position === undefined ? undefined : pool.find((j) => j.position === position);
    const nom = p.nomDe(souhait.playerId);
    if (!entree) {
      raisons.push(`${nom} n'est pas dans la liste proposée par Game Tracker pour ${to.nom}${unique ? '' : ` (${cote === 'haut' ? 'poule A' : 'poule B'})`}.`);
      return null;
    }
    if (entree.dejaPicke) raisons.push(`${nom} est déjà pickée dans cette phase : Game Tracker refuserait.`);
    lignes.push({ cote, origine: 'souhait', position: entree.position, nom, enAttente: entree.enAttente });
    return entree.position;
  };

  const souhaitHaut = unique ? p.souhaits[0] : p.souhaits.find((s) => s.half === 'top');
  const souhaitBas = unique ? undefined : p.souhaits.find((s) => s.half === 'bottom');
  const haut = resoudre('haut', souhaitHaut);
  const bas = unique ? null : resoudre('bas', souhaitBas);
  if (raisons.length) return { ok: false, raisons };
  if (unique && souhaitHaut === undefined && haut === null) return { ok: false, raisons: [`Aucun pick à poser pour ${to.nom}.`] };

  const dejaAJour = (to.monPick.haut?.position ?? null) === haut && (unique ? true : (to.monPick.bas?.position ?? null) === bas);
  return { ok: true, tour: p.numeroTour, round, nomTour: to.nom, haut, bas, lignes: unique ? lignes.filter((l) => l.cote === 'haut') : lignes, dejaAJour };
}
