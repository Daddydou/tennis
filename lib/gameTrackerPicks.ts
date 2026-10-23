/**
 * API « PICKS TENNIS » DE GAME TRACKER — types, lecture validée des réponses,
 * traduction de NOS picks en positions de tableau, construction de l'envoi.
 *
 * Module PUR : aucun import Next/Supabase, aucun appel réseau (le fetch vit
 * dans externe/gameTrackerPicksClient.ts, la lecture de la base dans
 * db/gameTrackerPicks.ts).
 *
 * Ce que l'API impose (cf. docs/game-tracker-picks.md) :
 *   - les joueurs sont désignés par leur POSITION de tableau (1..drawSize),
 *     jamais par leur nom ; haut = 1..drawSize/2, bas = le reste ;
 *   - un seul tour est ouvert aux picks à la fois (`tourOuvert`) ;
 *   - le POST REMPLACE le pick du tour en entier : `haut` ET `bas` sont
 *     obligatoires, null vide le côté. D'où `preparerEnvoi` : un côté que nous
 *     n'avons pas posé est renvoyé tel que Game Tracker l'a déjà, jamais vidé
 *     par accident ;
 *   - en demi-finale et en finale : un seul pick, dans `haut`, `bas` = null.
 *
 * Même correspondance tour/position que le pont de Thomas
 * (lib/bracketExternePont.ts) : on la réutilise, on ne la réécrit pas.
 */
import {
  correspondanceTours,
  memeNom,
  type MatchInterne,
} from './bracketExternePont';

/* -------------------------------------------------------------------------- */
/*  Types — réponses de l'API                                                 */
/* -------------------------------------------------------------------------- */

export interface JoueurPoolGT {
  position: number;
  prenom: string | null;
  nom: string | null;
  /** Son match du tour précédent n'est pas joué : s'il perd, le pick est redirigé. */
  enAttente: boolean;
  /** Déjà pické par ce joueur à un autre tour : un tel pick sera refusé. */
  dejaPicke: boolean;
}

export interface PickGT {
  position: number;
  prenom: string | null;
  nom: string | null;
}

export interface TourOuvertGT {
  numero: number;
  nom: string;
  lockAt: string | null;
  picksAttendus: number;
  pool: { haut: JoueurPoolGT[]; bas: JoueurPoolGT[] };
  monPick: { haut: PickGT | null; bas: PickGT | null; etat: string };
}

export interface EtatGT {
  maintenant: string;
  tournoi: { id: string; nom: string; drawSize: number; statut: string };
  tourOuvert: TourOuvertGT | null;
  dejaPickes: PickGT[];
  classement: { pseudo: string; moi: boolean; points: number }[];
}

export interface TournoiPicksGT {
  id: string;
  nom: string;
  tour: string;
  annee: number;
  drawSize: number;
  statut: string;
  tourOuvert: { numero: number; nom: string; lockAt: string | null } | null;
}

export interface ReponsePostGT {
  enregistre: boolean;
  /** Raison du refus, telle que Game Tracker la donne. */
  erreur: string | null;
  tour: number | null;
  monPick: { haut: PickGT | null; bas: PickGT | null } | null;
}

/* -------------------------------------------------------------------------- */
/*  Lecture structurelle                                                      */
/* -------------------------------------------------------------------------- */

/** Réponse dont la FORME ne correspond pas à ce qu'on attend. */
export class ErreurFormatGT extends Error {
  constructor(chemin: string, attendu: string) {
    super(`Réponse Game Tracker inattendue : ${chemin} devrait être ${attendu}.`);
    this.name = 'ErreurFormatGT';
  }
}

type Objet = Record<string, unknown>;

function objet(v: unknown, chemin: string): Objet {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new ErreurFormatGT(chemin, 'un objet');
  return v as Objet;
}
function tableau(v: unknown, chemin: string): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ErreurFormatGT(chemin, 'un tableau');
  return v;
}
function texte(v: unknown, chemin: string): string {
  if (typeof v !== 'string') throw new ErreurFormatGT(chemin, 'une chaîne');
  return v;
}
function texteOuNull(v: unknown, chemin: string): string | null {
  return v === undefined || v === null ? null : texte(v, chemin);
}
function entier(v: unknown, chemin: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new ErreurFormatGT(chemin, 'un entier');
  return v;
}
function entierOuNull(v: unknown, chemin: string): number | null {
  return v === undefined || v === null ? null : entier(v, chemin);
}

/** Un pick : `null`, ou { position, prenom, nom } (le POST peut aussi renvoyer la seule position). */
function lirePick(v: unknown, chemin: string): PickGT | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return { position: entier(v, chemin), prenom: null, nom: null };
  const o = objet(v, chemin);
  // Le pick d'un côté peut être enveloppé dans { joueur: { … } } (cf. `tours[].picks`).
  const j = o.joueur !== undefined && o.joueur !== null ? objet(o.joueur, `${chemin}.joueur`) : o;
  return {
    position: entier(j.position, `${chemin}.position`),
    prenom: texteOuNull(j.prenom, `${chemin}.prenom`),
    nom: texteOuNull(j.nom, `${chemin}.nom`),
  };
}

function lirePool(v: unknown, chemin: string): JoueurPoolGT[] {
  return tableau(v, chemin).map((j, i) => {
    const c = `${chemin}[${i}]`;
    const o = objet(j, c);
    return {
      position: entier(o.position, `${c}.position`),
      prenom: texteOuNull(o.prenom, `${c}.prenom`),
      nom: texteOuNull(o.nom, `${c}.nom`),
      enAttente: o.enAttente === true,
      dejaPicke: o.dejaPicke === true,
    };
  });
}

/** GET /picks/tournois. */
export function lireTournoisPicksGT(raw: unknown): TournoiPicksGT[] {
  const r = objet(raw, '$');
  return tableau(r.tournois, '$.tournois').map((t, i) => {
    const c = `$.tournois[${i}]`;
    const o = objet(t, c);
    const to = o.tourOuvert === undefined || o.tourOuvert === null ? null : objet(o.tourOuvert, `${c}.tourOuvert`);
    return {
      id: texte(o.id, `${c}.id`),
      nom: texte(o.nom, `${c}.nom`),
      tour: texte(o.tour, `${c}.tour`),
      annee: entier(o.annee, `${c}.annee`),
      drawSize: entier(o.drawSize, `${c}.drawSize`),
      statut: texte(o.statut, `${c}.statut`),
      tourOuvert: to
        ? { numero: entier(to.numero, `${c}.tourOuvert.numero`), nom: texte(to.nom, `${c}.tourOuvert.nom`), lockAt: texteOuNull(to.lockAt, `${c}.tourOuvert.lockAt`) }
        : null,
    };
  });
}

/** GET /picks?tournoi=<id>. */
export function lireEtatGT(raw: unknown): EtatGT {
  const r = objet(raw, '$');
  const t = objet(r.tournoi, '$.tournoi');
  const to = r.tourOuvert === undefined || r.tourOuvert === null ? null : objet(r.tourOuvert, '$.tourOuvert');
  let tourOuvert: TourOuvertGT | null = null;
  if (to) {
    const pool = to.pool === undefined || to.pool === null ? {} : objet(to.pool, '$.tourOuvert.pool');
    const mp = to.monPick === undefined || to.monPick === null ? {} : objet(to.monPick, '$.tourOuvert.monPick');
    tourOuvert = {
      numero: entier(to.numero, '$.tourOuvert.numero'),
      nom: texte(to.nom, '$.tourOuvert.nom'),
      lockAt: texteOuNull(to.lockAt, '$.tourOuvert.lockAt'),
      picksAttendus: entier(to.picksAttendus ?? 2, '$.tourOuvert.picksAttendus'),
      pool: {
        haut: lirePool(pool.haut, '$.tourOuvert.pool.haut'),
        bas: lirePool(pool.bas, '$.tourOuvert.pool.bas'),
      },
      monPick: {
        haut: lirePick(mp.haut, '$.tourOuvert.monPick.haut'),
        bas: lirePick(mp.bas, '$.tourOuvert.monPick.bas'),
        etat: typeof mp.etat === 'string' ? mp.etat : 'manquant',
      },
    };
  }
  return {
    maintenant: texte(r.maintenant, '$.maintenant'),
    tournoi: {
      id: texte(t.id, '$.tournoi.id'),
      nom: texte(t.nom, '$.tournoi.nom'),
      drawSize: entier(t.drawSize, '$.tournoi.drawSize'),
      statut: texte(t.statut, '$.tournoi.statut'),
    },
    tourOuvert,
    dejaPickes: tableau(r.dejaPickes, '$.dejaPickes').map((p, i) => {
      const pick = lirePick(p, `$.dejaPickes[${i}]`);
      if (!pick) throw new ErreurFormatGT(`$.dejaPickes[${i}]`, 'un joueur');
      return pick;
    }),
    classement: tableau(r.classement, '$.classement').map((c, i) => {
      const o = objet(c, `$.classement[${i}]`);
      return { pseudo: texte(o.pseudo, `$.classement[${i}].pseudo`), moi: o.moi === true, points: entier(o.points ?? 0, `$.classement[${i}].points`) };
    }),
  };
}

/** Réponse d'un POST /picks (200, ou refus 4xx avec `enregistre: false`). */
export function lireReponsePostGT(raw: unknown): ReponsePostGT {
  const r = objet(raw, '$');
  const mp = r.monPick === undefined || r.monPick === null ? null : objet(r.monPick, '$.monPick');
  return {
    enregistre: r.enregistre === true,
    erreur: typeof r.erreur === 'string' ? r.erreur : typeof r.error === 'string' ? r.error : null,
    tour: entierOuNull(r.tour, '$.tour'),
    monPick: mp ? { haut: lirePick(mp.haut, '$.monPick.haut'), bas: lirePick(mp.bas, '$.monPick.bas') } : null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Nos picks -> positions de tableau                                         */
/* -------------------------------------------------------------------------- */

/** Un de NOS picks (tn_picks, stock « moi »), réduit à ce dont l'envoi a besoin. */
export interface PickLocal {
  round: string;
  half: 'top' | 'bottom' | null;
  playerId: string;
}

/**
 * Position de tableau (1..drawSize) d'un joueur interne : le joueur du PREMIER
 * tour, match `m`, est player1 (position 2m+1) ou player2 (2m+2). Même
 * convention que `joueurDePosition` (lib/bracketExternePont.ts), dans l'autre
 * sens. null si le joueur n'est pas au premier tour du tableau.
 */
export function positionDeJoueur(playerId: string, premierTour: MatchInterne[]): number | null {
  for (const m of premierTour) {
    if (m.player1Id === playerId) return 2 * m.position + 1;
    if (m.player2Id === playerId) return 2 * m.position + 2;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Construction de l'envoi                                                   */
/* -------------------------------------------------------------------------- */

export type Cote = 'haut' | 'bas';

export interface LigneEnvoi {
  cote: Cote;
  /** local = notre pick ; conserve = pick déjà chez Game Tracker, renvoyé tel quel ; vide = rien. */
  origine: 'local' | 'conserve' | 'vide';
  position: number | null;
  nom: string | null;
  /** Son match du tour précédent n'est pas joué : le pick pourra être redirigé. */
  enAttente: boolean;
}

export type PreparationEnvoi =
  | {
      ok: true;
      /** Numéro du tour ouvert chez Game Tracker (celui du POST). */
      tour: number;
      /** Code de NOTRE tour correspondant (R16, QF…). */
      roundLocal: string;
      haut: number | null;
      bas: number | null;
      lignes: LigneEnvoi[];
      /** Game Tracker a déjà exactement ces picks : rien à envoyer. */
      dejaAJour: boolean;
      avertissements: string[];
    }
  | { ok: false; raisons: string[] };

export interface ParametresEnvoi {
  etat: EtatGT;
  /** tn_tournaments.rounds. */
  rounds: string[];
  /** Matchs du PREMIER tour du tableau interne. */
  matchsPremierTour: MatchInterne[];
  /** player_id -> nom interne. */
  noms: Map<string, string>;
  /** Nos picks (stock « moi ») de ce tournoi, tous tours confondus. */
  picksLocaux: PickLocal[];
  maintenant: Date;
}

const nomAffiche = (prenom: string | null, nom: string | null): string =>
  [prenom, nom].filter(Boolean).join(' ') || '?';

/**
 * Ce qu'on enverrait à Game Tracker pour le tour ouvert, ou les raisons de ne
 * RIEN envoyer. Principe : au moindre doute (mapping, pool, verrou), on
 * refuse en bloc — mieux vaut ne rien poser que poser le mauvais joueur.
 */
export function preparerEnvoi(p: ParametresEnvoi): PreparationEnvoi {
  const { etat, rounds, matchsPremierTour, noms, picksLocaux, maintenant } = p;
  const to = etat.tourOuvert;
  if (!to) return { ok: false, raisons: ['Aucun tour n’est ouvert aux picks chez Game Tracker.'] };

  if (to.lockAt) {
    const verrou = Date.parse(to.lockAt);
    if (Number.isFinite(verrou) && maintenant.getTime() >= verrou) {
      return { ok: false, raisons: [`Le tour « ${to.nom} » est verrouillé depuis ${to.lockAt}.`] };
    }
  }

  const { drawSize } = etat.tournoi;
  const tours = correspondanceTours(drawSize, rounds);
  if (!tours.ok) return { ok: false, raisons: [tours.erreur] };
  const roundLocal = tours.roundDuTour(to.numero);
  if (!roundLocal) {
    return { ok: false, raisons: [`Le tour ${to.numero} de Game Tracker n’existe pas dans notre tableau (${rounds.join(', ')}).`] };
  }

  const unSeulPick = to.picksAttendus === 1;
  const premierTour = matchsPremierTour.filter((m) => m.round === tours.premierRound);
  const demiTableau = drawSize / 2;
  const pool = [...to.pool.haut, ...to.pool.bas];
  const raisons: string[] = [];
  const avertissements: string[] = [];

  const locaux = picksLocaux.filter((l) => l.round === roundLocal);
  const localHaut = unSeulPick ? locaux[0] : locaux.find((l) => l.half === 'top');
  const localBas = unSeulPick ? undefined : locaux.find((l) => l.half === 'bottom');
  if (!localHaut && !localBas) {
    return { ok: false, raisons: [`Aucun pick posé chez nous pour ce tour (${roundLocal}) : rien à envoyer.`] };
  }

  /** Résout un de nos picks en ligne d'envoi, ou ajoute des raisons de refus. */
  function resoudre(cote: Cote, l: PickLocal): LigneEnvoi | null {
    const nomInterne = noms.get(l.playerId) ?? l.playerId;
    const position = positionDeJoueur(l.playerId, premierTour);
    if (position === null) {
      raisons.push(`${nomInterne} : introuvable au premier tour de notre tableau.`);
      return null;
    }
    // Côté du tableau : en demi-finale / finale, `haut` accepte n'importe quelle moitié.
    if (!unSeulPick) {
      const bonCote = cote === 'haut' ? position <= demiTableau : position > demiTableau;
      if (!bonCote) {
        raisons.push(`${nomInterne} (position ${position}) n’est pas dans le ${cote} du tableau.`);
        return null;
      }
    }
    const entree = pool.find((j) => j.position === position);
    if (!entree) {
      const deja = etat.dejaPickes.find((j) => j.position === position);
      raisons.push(
        deja
          ? `${nomInterne} est déjà pické chez Game Tracker à un autre tour.`
          : `${nomInterne} (position ${position}) n’est pas dans ton pool Game Tracker pour ce tour.`,
      );
      return null;
    }
    // Recoupement par le nom : la position ne doit jamais désigner quelqu’un d’autre.
    if (!memeNom(entree.prenom, entree.nom, nomInterne)) {
      raisons.push(
        `Position ${position} : ${nomAffiche(entree.prenom, entree.nom)} chez Game Tracker, ${nomInterne} chez nous. Tableaux non superposables.`,
      );
      return null;
    }
    if (entree.dejaPicke) {
      raisons.push(`${nomInterne} est déjà pické chez Game Tracker à un autre tour : il serait refusé.`);
      return null;
    }
    if (entree.enAttente) {
      avertissements.push(
        `${nomInterne} n’a pas encore joué son match du tour précédent : s’il le perd, Game Tracker redirigera ton pick vers le vainqueur (ou le videra).`,
      );
    }
    return { cote, origine: 'local', position, nom: nomInterne, enAttente: entree.enAttente };
  }

  const resoluHaut = localHaut ? resoudre('haut', localHaut) : null;
  const resoluBas = localBas ? resoudre('bas', localBas) : null;
  if (raisons.length) return { ok: false, raisons };

  /** Côté pas posé chez nous : on garde ce que Game Tracker a déjà (jamais vidé par accident). */
  function conserve(cote: Cote): LigneEnvoi {
    const actuel = cote === 'haut' ? to!.monPick.haut : to!.monPick.bas;
    if (!actuel) return { cote, origine: 'vide', position: null, nom: null, enAttente: false };
    avertissements.push(
      `Côté ${cote} : pas de pick chez nous, on garde celui de Game Tracker (${nomAffiche(actuel.prenom, actuel.nom)}).`,
    );
    return {
      cote,
      origine: 'conserve',
      position: actuel.position,
      nom: nomAffiche(actuel.prenom, actuel.nom),
      enAttente: false,
    };
  }

  const ligneHaut = resoluHaut ?? conserve('haut');
  const ligneBas = unSeulPick ? { cote: 'bas' as const, origine: 'vide' as const, position: null, nom: null, enAttente: false } : (resoluBas ?? conserve('bas'));

  const haut = ligneHaut.position;
  const bas = ligneBas.position;
  const dejaAJour =
    (to.monPick.haut?.position ?? null) === haut && (unSeulPick ? true : (to.monPick.bas?.position ?? null) === bas);

  if (to.lockAt === null) {
    avertissements.push('L’heure de verrouillage n’est pas encore connue chez Game Tracker : ne pas attendre le dernier moment.');
  }

  return {
    ok: true,
    tour: to.numero,
    roundLocal,
    haut,
    bas,
    lignes: unSeulPick ? [ligneHaut] : [ligneHaut, ligneBas],
    dejaAJour,
    avertissements,
  };
}

/* -------------------------------------------------------------------------- */
/*  Vérification après envoi                                                  */
/* -------------------------------------------------------------------------- */

export interface EcartApresEnvoi {
  cote: Cote;
  envoye: number | null;
  reel: number | null;
}

/**
 * Game Tracker peut modifier un pick après coup (joueur en attente éliminé,
 * remplacement dans le tableau) : on compare ce qu'on a envoyé au pick RÉEL
 * relu. Liste vide = identique.
 */
export function ecartsApresEnvoi(
  envoye: { haut: number | null; bas: number | null },
  reel: { haut: PickGT | null; bas: PickGT | null },
  unSeulPick: boolean,
): EcartApresEnvoi[] {
  const out: EcartApresEnvoi[] = [];
  if (envoye.haut !== (reel.haut?.position ?? null)) out.push({ cote: 'haut', envoye: envoye.haut, reel: reel.haut?.position ?? null });
  if (!unSeulPick && envoye.bas !== (reel.bas?.position ?? null)) out.push({ cote: 'bas', envoye: envoye.bas, reel: reel.bas?.position ?? null });
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Lien tournoi interne <-> tournoi Game Tracker                             */
/* -------------------------------------------------------------------------- */

/** Ce qu'on sait de NOTRE tournoi pour le rapprocher de celui de Game Tracker. */
export interface TournoiInterneGT {
  name: string;
  tour: string;
  year: number | null;
  drawSize: number | null;
}

export interface CandidatLienGT {
  id: string;
  nom: string;
  tour: string;
  statut: string;
  /** Le nom de Game Tracker contient la ville du nôtre : proposé en premier, JAMAIS relié sans clic. */
  suggere: boolean;
}

const sansAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** « Lyon 2026 » -> « lyon ». */
const villeDe = (name: string) =>
  sansAccents(name)
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/[^a-z]+/g, ' ')
    .trim();

/**
 * Tournois de Game Tracker qui PEUVENT correspondre au nôtre : même circuit,
 * même année, même taille de tableau. Sert à choisir le lien depuis l'écran
 * picks quand le tournoi n'est pas dans l'API bracket de Thomas (cas de Lyon :
 * présent côté picks, absent de /import/thomas). Le choix reste à l'utilisateur.
 */
export function candidatsLienGT(interne: TournoiInterneGT, liste: TournoiPicksGT[]): CandidatLienGT[] {
  const ville = villeDe(interne.name);
  return liste
    .filter(
      (t) =>
        t.tour.toUpperCase() === interne.tour.toUpperCase() &&
        (interne.year === null || t.annee === interne.year) &&
        (interne.drawSize === null || t.drawSize === interne.drawSize),
    )
    .map((t) => ({ id: t.id, nom: t.nom, tour: t.tour, statut: t.statut, suggere: ville !== '' && sansAccents(t.nom).includes(ville) }))
    .sort((a, b) => Number(b.suggere) - Number(a.suggere));
}
/* -------------------------------------------------------------------------- */
/*  Pool Game Tracker vu depuis NOS joueurs (repères sur l'écran picks)        */
/* -------------------------------------------------------------------------- */

export interface PoolLocalGT {
  /** Code de NOTRE tour correspondant au tour ouvert chez Game Tracker (R16, QF…). */
  roundLocal: string;
  /** Candidats du pool, par player_id interne ; un joueur absent d'ici est HORS pool. */
  parJoueur: Record<string, { enAttente: boolean; dejaPicke: boolean }>;
}

/**
 * Le pool du tour ouvert chez Game Tracker, traduit en NOS player_id, pour
 * signaler sur l'écran picks les joueurs qui seraient refusés à l'envoi.
 * null si aucun tour n'est ouvert ou si les tableaux ne se superposent pas.
 *
 * INDICATIF : le recoupement par le nom se fait à l'envoi (`preparerEnvoi`),
 * qui reste la seule garde avant d'écrire chez Game Tracker.
 */
export function poolParJoueur(etat: EtatGT, rounds: string[], matchsPremierTour: MatchInterne[]): PoolLocalGT | null {
  const to = etat.tourOuvert;
  if (!to) return null;
  const tours = correspondanceTours(etat.tournoi.drawSize, rounds);
  if (!tours.ok) return null;
  const roundLocal = tours.roundDuTour(to.numero);
  if (!roundLocal) return null;

  const idDePosition = new Map<number, string>();
  for (const m of matchsPremierTour.filter((x) => x.round === tours.premierRound)) {
    if (m.player1Id) idDePosition.set(2 * m.position + 1, m.player1Id);
    if (m.player2Id) idDePosition.set(2 * m.position + 2, m.player2Id);
  }
  const parJoueur: PoolLocalGT['parJoueur'] = {};
  for (const j of [...to.pool.haut, ...to.pool.bas]) {
    const id = idDePosition.get(j.position);
    if (id) parJoueur[id] = { enAttente: j.enAttente, dejaPicke: j.dejaPicke };
  }
  return { roundLocal, parJoueur };
}