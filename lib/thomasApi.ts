/**
 * API BRACKET DE THOMAS — types, validation, recalcul des points.
 *
 * Module PUR : aucun import, aucun appel réseau (cf. externe/thomasClient.ts
 * pour le fetch, db/bracketExterneEcriture.ts pour le stockage).
 *
 * Source de vérité sur la forme : exemple-api-tennis-brackets.json (US Open
 * WTA 2026, terminé, 128 joueurs, 3 participants). Ce qu'il montre :
 *   - `position1`/`position2`/`vainqueur`/`pronostics[].position` sont des
 *     POSITIONS DE TABLEAU (1..drawSize), à tous les tours — jamais des index
 *     de slot ni des noms. Tout s'indexe par position.
 *   - `joueurAbsent` n'est présent que lorsqu'il vaut `true` : le pick datait
 *     d'avant l'élimination du joueur (bracket rempli à l'avance), le joueur
 *     n'est donc pas dans le match. Absent = false.
 *   - `pointsTotaux` = somme de 2^(tour-1) sur les pronostics corrects.
 *
 * Ce que l'exemple NE montre pas (tournoi terminé) et qu'on tolère donc :
 * matchs pas encore joués (`vainqueur`/`score` null, positions encore
 * inconnues), pronostic manquant (`position` null), et le tournoi non
 * verrouillé (`verrouille: false`, listes vides, `lockAt`).
 */

/* -------------------------------------------------------------------------- */
/*  Types — /api/v1/tennis/brackets?tournoi=<id>                              */
/* -------------------------------------------------------------------------- */

export type ResultatPronostic = 'correct' | 'rate' | 'en_attente' | 'sans_prono';
export const RESULTATS: readonly ResultatPronostic[] = ['correct', 'rate', 'en_attente', 'sans_prono'];

export interface TournoiThomas {
  id: string;
  nom: string;
  tour: 'ATP' | 'WTA';
  annee: number;
  /** Ex. 'GRAND_SLAM'. */
  type: string;
  /** Ex. 'HARD'. */
  surface: string;
  lieu: string;
  drawSize: number;
  /** Ex. 'COMPLETED'. */
  statut: string;
  /** Rien ne sort (participants, joueurs, tours) avant le verrouillage du tour 1. */
  verrouille: boolean;
  lockAt: string | null;
}

export interface ParticipantThomas {
  userId: string;
  pseudo: string;
  rempli: boolean;
  /** Calculé par Thomas : vérification croisée SEULEMENT, jamais la référence. */
  pointsTotaux: number | null;
}

export interface JoueurThomas {
  position: number;
  prenom: string;
  nom: string;
  tete: number | null;
  /** Ex. 'LL', 'Alt'. */
  statut: string | null;
  pays: string | null;
  classement: number | null;
  apiPlayerId: string | null;
}

export interface PronosticThomas {
  userId: string;
  /** Position de tableau pronostiquée ; null si pas de pronostic. */
  position: number | null;
  resultat: ResultatPronostic;
  /** Pick antérieur à l'élimination du joueur (absent du JSON = false). */
  joueurAbsent: boolean;
}

export interface MatchThomas {
  index: number;
  position1: number | null;
  position2: number | null;
  vainqueur: number | null;
  score: string | null;
  pronostics: PronosticThomas[];
}

export interface TourThomas {
  /** 1 = premier tour. */
  tour: number;
  nom: string;
  statut: string;
  matchs: MatchThomas[];
}

export interface BracketThomas {
  jeu: string;
  jeuTennis: string;
  tournoi: TournoiThomas;
  participants: ParticipantThomas[];
  joueurs: JoueurThomas[];
  tours: TourThomas[];
}

/* -------------------------------------------------------------------------- */
/*  Lecture structurelle                                                      */
/* -------------------------------------------------------------------------- */

/** Réponse dont la FORME ne correspond pas à ce qu'on attend. */
export class ErreurFormatThomas extends Error {
  constructor(chemin: string, attendu: string) {
    super(`Réponse de l'API Thomas inattendue : ${chemin} devrait être ${attendu}.`);
    this.name = 'ErreurFormatThomas';
  }
}

type Objet = Record<string, unknown>;

function objet(v: unknown, chemin: string): Objet {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new ErreurFormatThomas(chemin, 'un objet');
  }
  return v as Objet;
}
function tableau(v: unknown, chemin: string): unknown[] {
  if (!Array.isArray(v)) throw new ErreurFormatThomas(chemin, 'un tableau');
  return v;
}
function texte(v: unknown, chemin: string): string {
  if (typeof v !== 'string') throw new ErreurFormatThomas(chemin, 'une chaîne');
  return v;
}
function texteOuNull(v: unknown, chemin: string): string | null {
  return v === null || v === undefined ? null : texte(v, chemin);
}
function entier(v: unknown, chemin: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new ErreurFormatThomas(chemin, 'un entier');
  }
  return v;
}
function entierOuNull(v: unknown, chemin: string): number | null {
  return v === null || v === undefined ? null : entier(v, chemin);
}
function booleen(v: unknown, chemin: string): boolean {
  if (typeof v !== 'boolean') throw new ErreurFormatThomas(chemin, 'un booléen');
  return v;
}

/**
 * Lit une réponse /brackets. Lève `ErreurFormatThomas` (avec le chemin
 * fautif) si la forme diffère ; les clés en trop sont ignorées. Ne juge pas
 * la COHÉRENCE des données : c'est le rôle de `validerBracket`.
 */
export function lireBracket(raw: unknown): BracketThomas {
  const r = objet(raw, '$');
  const t = objet(r.tournoi, '$.tournoi');
  const tour = texte(t.tour, '$.tournoi.tour');
  if (tour !== 'ATP' && tour !== 'WTA') throw new ErreurFormatThomas('$.tournoi.tour', "'ATP' ou 'WTA'");

  // Avant verrouillage, les listes peuvent manquer : on les lit comme vides.
  const liste = (v: unknown, chemin: string) => (v === undefined || v === null ? [] : tableau(v, chemin));

  return {
    jeu: texte(r.jeu, '$.jeu'),
    jeuTennis: texte(r.jeuTennis, '$.jeuTennis'),
    tournoi: {
      id: texte(t.id, '$.tournoi.id'),
      nom: texte(t.nom, '$.tournoi.nom'),
      tour,
      annee: entier(t.annee, '$.tournoi.annee'),
      type: texte(t.type, '$.tournoi.type'),
      surface: texte(t.surface, '$.tournoi.surface'),
      lieu: texte(t.lieu, '$.tournoi.lieu'),
      drawSize: entier(t.drawSize, '$.tournoi.drawSize'),
      statut: texte(t.statut, '$.tournoi.statut'),
      verrouille: booleen(t.verrouille, '$.tournoi.verrouille'),
      lockAt: texteOuNull(t.lockAt, '$.tournoi.lockAt'),
    },
    participants: liste(r.participants, '$.participants').map((p, i) => {
      const c = `$.participants[${i}]`;
      const o = objet(p, c);
      return {
        userId: texte(o.userId, `${c}.userId`),
        pseudo: texte(o.pseudo, `${c}.pseudo`),
        rempli: booleen(o.rempli, `${c}.rempli`),
        pointsTotaux: entierOuNull(o.pointsTotaux, `${c}.pointsTotaux`),
      };
    }),
    joueurs: liste(r.joueurs, '$.joueurs').map((j, i) => {
      const c = `$.joueurs[${i}]`;
      const o = objet(j, c);
      return {
        position: entier(o.position, `${c}.position`),
        prenom: texte(o.prenom, `${c}.prenom`),
        nom: texte(o.nom, `${c}.nom`),
        tete: entierOuNull(o.tete, `${c}.tete`),
        statut: texteOuNull(o.statut, `${c}.statut`),
        pays: texteOuNull(o.pays, `${c}.pays`),
        classement: entierOuNull(o.classement, `${c}.classement`),
        apiPlayerId: texteOuNull(o.apiPlayerId, `${c}.apiPlayerId`),
      };
    }),
    tours: liste(r.tours, '$.tours').map((tr, i) => {
      const c = `$.tours[${i}]`;
      const o = objet(tr, c);
      return {
        tour: entier(o.tour, `${c}.tour`),
        nom: texte(o.nom, `${c}.nom`),
        statut: texte(o.statut, `${c}.statut`),
        matchs: tableau(o.matchs, `${c}.matchs`).map((m, k) => {
          const cm = `${c}.matchs[${k}]`;
          const om = objet(m, cm);
          return {
            index: entier(om.index, `${cm}.index`),
            position1: entierOuNull(om.position1, `${cm}.position1`),
            position2: entierOuNull(om.position2, `${cm}.position2`),
            vainqueur: entierOuNull(om.vainqueur, `${cm}.vainqueur`),
            score: texteOuNull(om.score, `${cm}.score`),
            pronostics: tableau(om.pronostics ?? [], `${cm}.pronostics`).map((p, n) => {
              const cp = `${cm}.pronostics[${n}]`;
              const op = objet(p, cp);
              const resultat = texte(op.resultat, `${cp}.resultat`);
              if (!(RESULTATS as readonly string[]).includes(resultat)) {
                throw new ErreurFormatThomas(`${cp}.resultat`, RESULTATS.join(' | '));
              }
              return {
                userId: texte(op.userId, `${cp}.userId`),
                position: entierOuNull(op.position, `${cp}.position`),
                resultat: resultat as ResultatPronostic,
                joueurAbsent: op.joueurAbsent === undefined ? false : booleen(op.joueurAbsent, `${cp}.joueurAbsent`),
              };
            }),
          };
        }),
      };
    }),
  };
}

/* -------------------------------------------------------------------------- */
/*  Validation de cohérence                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Incohérences d'un bracket déjà lu. Liste vide = rien à redire. Toute
 * incohérence BLOQUE l'écriture en base (pas d'écriture partielle) : une
 * position hors tableau ou un userId inconnu, c'est un mapping faux.
 */
export function validerBracket(b: BracketThomas): string[] {
  const erreurs: string[] = [];
  const { drawSize, verrouille } = b.tournoi;
  const nbTours = Math.log2(drawSize);

  if (!Number.isInteger(nbTours) || drawSize < 2) {
    erreurs.push(`drawSize ${drawSize} n'est pas une puissance de 2.`);
    return erreurs;
  }

  if (!verrouille && (b.participants.length || b.joueurs.length || b.tours.length)) {
    erreurs.push('Tournoi non verrouillé mais listes non vides : rien ne devrait sortir avant le tour 1.');
  }

  const dansTableau = (p: number) => p >= 1 && p <= drawSize;
  const positions = new Set<number>();
  for (const j of b.joueurs) {
    if (!dansTableau(j.position)) erreurs.push(`Joueur ${j.nom} : position ${j.position} hors de 1..${drawSize}.`);
    if (positions.has(j.position)) erreurs.push(`Position ${j.position} attribuée à deux joueurs.`);
    positions.add(j.position);
  }

  const userIds = new Set<string>();
  for (const p of b.participants) {
    if (userIds.has(p.userId)) erreurs.push(`Participant ${p.userId} en double.`);
    userIds.add(p.userId);
  }

  const toursVus = new Set<number>();
  for (const t of b.tours) {
    const ou = `Tour ${t.tour}`;
    if (t.tour < 1 || t.tour > nbTours) erreurs.push(`${ou} : hors de 1..${nbTours}.`);
    if (toursVus.has(t.tour)) erreurs.push(`${ou} en double.`);
    toursVus.add(t.tour);

    const nbMatchs = drawSize / 2 ** t.tour;
    const indexVus = new Set<number>();
    for (const m of t.matchs) {
      const om = `${ou}, match ${m.index}`;
      if (m.index < 0 || m.index >= nbMatchs) erreurs.push(`${om} : index hors de 0..${nbMatchs - 1}.`);
      // Le match `index` du tour `t` ne réunit que des positions du bloc
      // [index·2^t + 1, (index+1)·2^t] : un décalage d'index se voit ici.
      const bloc = 2 ** t.tour;
      const horsBloc = (p: number) => Math.ceil(p / bloc) - 1 !== m.index;
      if (indexVus.has(m.index)) erreurs.push(`${om} en double.`);
      indexVus.add(m.index);

      for (const [nom, p] of [['position1', m.position1], ['position2', m.position2], ['vainqueur', m.vainqueur]] as const) {
        if (p !== null && !dansTableau(p)) erreurs.push(`${om} : ${nom} ${p} hors de 1..${drawSize}.`);
        if (p !== null && positions.size > 0 && !positions.has(p)) erreurs.push(`${om} : ${nom} ${p} ne correspond à aucun joueur.`);
        if (p !== null && dansTableau(p) && horsBloc(p)) erreurs.push(`${om} : ${nom} ${p} hors du bloc de ce match.`);
      }
      if (m.vainqueur !== null && m.vainqueur !== m.position1 && m.vainqueur !== m.position2) {
        erreurs.push(`${om} : vainqueur ${m.vainqueur} absent du match (${m.position1} / ${m.position2}).`);
      }

      const votants = new Set<string>();
      for (const p of m.pronostics) {
        if (!userIds.has(p.userId)) erreurs.push(`${om} : pronostic d'un userId inconnu (${p.userId}).`);
        if (votants.has(p.userId)) erreurs.push(`${om} : deux pronostics pour ${p.userId}.`);
        votants.add(p.userId);
        if (p.position !== null && !dansTableau(p.position)) {
          erreurs.push(`${om} : pronostic de ${p.userId} en position ${p.position}, hors de 1..${drawSize}.`);
        } else if (p.position !== null && horsBloc(p.position)) {
          erreurs.push(`${om} : pronostic de ${p.userId} en position ${p.position}, hors du bloc de ce match.`);
        }
      }
    }
  }
  return erreurs;
}

/* -------------------------------------------------------------------------- */
/*  Recalcul des points — NOTRE logique, pas celle de Thomas                  */
/* -------------------------------------------------------------------------- */

/** Barème du bracket de Thomas : 1, 2, 4, 8… points du premier tour à la finale. */
export const BAREME_THOMAS = (tour: number): number => 2 ** (tour - 1);

/**
 * Est-ce que ce pronostic est correct, à NOTRE avis : la position
 * pronostiquée est le vainqueur du match. N'utilise PAS `resultat` (le
 * jugement de Thomas) — c'est ce qui rend la vérification croisée utile.
 */
export function pronosticCorrect(m: MatchThomas, p: PronosticThomas): boolean {
  return m.vainqueur !== null && p.position !== null && p.position === m.vainqueur;
}

/**
 * Points de chaque participant recalculés depuis les pronostics bruts.
 * Map userId → points ; un participant sans pronostic correct n'y figure pas
 * (lire avec `?? 0`).
 */
export function recalculerPointsTotaux(
  tours: TourThomas[],
  bareme: (tour: number) => number = BAREME_THOMAS,
): Map<string, number> {
  const points = new Map<string, number>();
  for (const t of tours) {
    for (const m of t.matchs) {
      for (const p of m.pronostics) {
        if (pronosticCorrect(m, p)) points.set(p.userId, (points.get(p.userId) ?? 0) + bareme(t.tour));
      }
    }
  }
  return points;
}

/**
 * Pronostics où le `resultat` de Thomas contredit notre propre jugement
 * (ex. « correct » alors que la position n'est pas le vainqueur). Les
 * pronostics `en_attente`/`sans_prono` d'un match sans vainqueur n'y entrent
 * pas. Tout élément ici est un signal d'erreur de mapping.
 */
export function desaccordsResultat(
  tours: TourThomas[],
): { tour: number; index: number; userId: string; thomas: ResultatPronostic; nous: 'correct' | 'rate' }[] {
  const out: { tour: number; index: number; userId: string; thomas: ResultatPronostic; nous: 'correct' | 'rate' }[] = [];
  for (const t of tours) {
    for (const m of t.matchs) {
      if (m.vainqueur === null) continue;
      for (const p of m.pronostics) {
        if (p.position === null) continue;
        const nous = pronosticCorrect(m, p) ? 'correct' : 'rate';
        if (p.resultat !== nous) out.push({ tour: t.tour, index: m.index, userId: p.userId, thomas: p.resultat, nous });
      }
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Statistiques — joueurAbsent mis à part                                    */
/* -------------------------------------------------------------------------- */

export interface StatsPronostics {
  correct: number;
  /** Ratés « classiques » : le joueur pronostiqué a joué ce match et l'a perdu. */
  rate: number;
  /**
   * Ratés parce que le joueur pronostiqué était déjà éliminé (pick fait à
   * l'avance). Comptés À PART, jamais dans `rate` ni dans `tauxClassique`.
   */
  rateJoueurAbsent: number;
  enAttente: number;
  sansProno: number;
  /** correct / (correct + rate) ; null sans match jugé. joueurAbsent EXCLU. */
  tauxClassique: number | null;
}

/** Statistiques par participant, depuis les pronostics bruts (notre jugement). */
export function statistiquesPronostics(tours: TourThomas[]): Map<string, StatsPronostics> {
  const stats = new Map<string, StatsPronostics>();
  const de = (u: string) => {
    let s = stats.get(u);
    if (!s) {
      s = { correct: 0, rate: 0, rateJoueurAbsent: 0, enAttente: 0, sansProno: 0, tauxClassique: null };
      stats.set(u, s);
    }
    return s;
  };
  for (const t of tours) {
    for (const m of t.matchs) {
      for (const p of m.pronostics) {
        const s = de(p.userId);
        if (p.position === null) s.sansProno++;
        else if (p.joueurAbsent) s.rateJoueurAbsent++;
        else if (m.vainqueur === null) s.enAttente++;
        else if (pronosticCorrect(m, p)) s.correct++;
        else s.rate++;
      }
    }
  }
  for (const s of stats.values()) {
    const juges = s.correct + s.rate;
    s.tauxClassique = juges > 0 ? s.correct / juges : null;
  }
  return stats;
}

/* -------------------------------------------------------------------------- */
/*  /tournaments et /ids — FORME À CONFIRMER                                  */
/* -------------------------------------------------------------------------- */

/*
 * Aucun exemple réel de ces deux routes n'était disponible à l'écriture
 * (seulement /brackets). Lecture volontairement tolérante — tableau nu, ou
 * objet portant un seul tableau — mais qui échoue clairement sur toute autre
 * forme. À resserrer dès qu'une vraie réponse a été vue.
 */

export interface ResumeTournoiThomas {
  id: string;
  nom: string | null;
  /** Date de dernière modification côté Thomas, si l'API la fournit. */
  updatedAt: string | null;
}

function tableauRacine(raw: unknown, route: string, cles: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  const o = objet(raw, `${route} $`);
  for (const c of cles) if (Array.isArray(o[c])) return o[c] as unknown[];
  const tableaux = Object.keys(o).filter((k) => Array.isArray(o[k]));
  if (tableaux.length === 1) return o[tableaux[0]] as unknown[];
  throw new ErreurFormatThomas(`${route} $`, `un tableau, ou un objet portant un seul tableau (clés reçues : ${Object.keys(o).join(', ') || 'aucune'})`);
}

export function lireTournois(raw: unknown): ResumeTournoiThomas[] {
  return tableauRacine(raw, '/tournaments', ['tournois', 'tournaments', 'data']).map((t, i) => {
    const c = `/tournaments $[${i}]`;
    const o = objet(t, c);
    return {
      id: texte(o.id, `${c}.id`),
      nom: texteOuNull(o.nom, `${c}.nom`),
      updatedAt: texteOuNull(o.updatedAt ?? o.updated_at, `${c}.updatedAt`),
    };
  });
}

export function lireIds(raw: unknown): string[] {
  return tableauRacine(raw, '/ids', ['ids', 'tournois', 'data']).map((v, i) =>
    typeof v === 'string' ? v : texte(objet(v, `/ids $[${i}]`).id, `/ids $[${i}].id`),
  );
}
