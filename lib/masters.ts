/**
 * FORMAT « MASTERS » (ATP Finals, WTA Finals) — logique PURE : aucun import React / Next / Supabase.
 *
 * Règles du jeu (page « Règles » de l'app de Thomas, état du 06/11/2026) :
 *  - 8 joueurs en deux poules de 4 (A = « haut », B = « bas » dans l'app). Chacun joue les trois
 *    autres de sa poule, sur trois journées. Les deux premiers de chaque poule vont en demies
 *    croisées (1er A - 2e B, 1er B - 2e A), puis la finale.
 *  - Classement d'une poule : victoires, puis confrontation directe entre deux ex æquo ; à trois,
 *    pourcentage de sets puis de jeux gagnés.
 *  - Pronostic (à la place du bracket) : classer chaque poule du 1er au 4e, choisir le vainqueur des
 *    deux demies que ce classement dessine, puis le champion. Qualifié trouvé 4 pts, place exacte 2 pts,
 *    finaliste trouvé 8 pts, champion trouvé 16 pts : 64 au maximum.
 *  - Picks : un joueur par poule à chaque journée, un seul joueur en demie et en finale. Un joueur ne
 *    se pique qu'une fois PAR PHASE : trois joueurs différents par poule sur les trois journées, puis,
 *    en phase finale, on repart de zéro (deux joueurs différents en demie et en finale).
 *
 * Dans la base, un tournoi Masters est un tournoi dont les `rounds` valent ROUNDS_MASTERS ; la moitié
 * (`half`) d'un match de poule dit sa poule : 'top' = A, 'bottom' = B.
 */

export const ROUNDS_MASTERS = ['J1', 'J2', 'J3', 'SF', 'F'] as const;
export type RoundMasters = (typeof ROUNDS_MASTERS)[number];

export type Poule = 'A' | 'B';
export type Moitie = 'top' | 'bottom';

/** Un tournoi est un Masters si ses tours sont exactement J1, J2, J3, SF, F. */
export function estMasters(rounds: readonly string[] | null | undefined): boolean {
  return !!rounds && rounds.length === ROUNDS_MASTERS.length && ROUNDS_MASTERS.every((r, i) => rounds[i] === r);
}

export const pouleDeMoitie = (half: Moitie): Poule => (half === 'top' ? 'A' : 'B');
export const moitieDePoule = (p: Poule): Moitie => (p === 'A' ? 'top' : 'bottom');

export type PhaseMasters = 'poules' | 'finale';
export function phaseDuTour(round: string): PhaseMasters {
  return round === 'SF' || round === 'F' ? 'finale' : 'poules';
}

/** Libellé lisible d'un tour : « Journée 1 », « Demi-finales », « Finale ». */
export function libelleTourMasters(round: string): string {
  switch (round) {
    case 'J1': return 'Journée 1';
    case 'J2': return 'Journée 2';
    case 'J3': return 'Journée 3';
    case 'SF': return 'Demi-finales';
    case 'F': return 'Finale';
    default: return round;
  }
}

/* ------------------------------------------------------------------ */
/*  Classement d'une poule                                             */
/* ------------------------------------------------------------------ */

/** Un set : jeux du joueur 1 puis du joueur 2 du match (peu importe qui l'a gagné). */
export interface SetJeux {
  g1: number;
  g2: number;
}

/** Un match de poule JOUÉ ou non. `winnerId` null tant qu'il n'est pas tranché. */
export interface MatchPoule {
  player1Id: string;
  player2Id: string;
  winnerId: string | null;
  sets: SetJeux[];
}

export interface LigneClassement {
  playerId: string;
  /** 1 à 4. Les ex æquo non départagés partagent le même rang. */
  rang: number;
  joues: number;
  victoires: number;
  defaites: number;
  setsGagnes: number;
  setsPerdus: number;
  jeuxGagnes: number;
  jeuxPerdus: number;
  /** Vrai si le rang est partagé avec un autre joueur (égalité que les règles ne départagent pas). */
  egalite: boolean;
}

interface Cumul {
  joues: number;
  victoires: number;
  defaites: number;
  setsGagnes: number;
  setsPerdus: number;
  jeuxGagnes: number;
  jeuxPerdus: number;
}

const vide = (): Cumul => ({ joues: 0, victoires: 0, defaites: 0, setsGagnes: 0, setsPerdus: 0, jeuxGagnes: 0, jeuxPerdus: 0 });

/** Cumuls des matchs JOUÉS (avec vainqueur) entre les joueurs de `ids`. Les sets d'un match sans score comptent pour rien. */
function cumuler(ids: string[], matchs: MatchPoule[]): Map<string, Cumul> {
  const garde = new Set(ids);
  const out = new Map(ids.map((id) => [id, vide()]));
  for (const m of matchs) {
    if (m.winnerId === null || !garde.has(m.player1Id) || !garde.has(m.player2Id)) continue;
    const a = out.get(m.player1Id)!;
    const b = out.get(m.player2Id)!;
    a.joues++;
    b.joues++;
    if (m.winnerId === m.player1Id) {
      a.victoires++;
      b.defaites++;
    } else {
      b.victoires++;
      a.defaites++;
    }
    for (const s of m.sets) {
      a.jeuxGagnes += s.g1;
      a.jeuxPerdus += s.g2;
      b.jeuxGagnes += s.g2;
      b.jeuxPerdus += s.g1;
      if (s.g1 > s.g2) {
        a.setsGagnes++;
        b.setsPerdus++;
      } else if (s.g2 > s.g1) {
        b.setsGagnes++;
        a.setsPerdus++;
      }
    }
  }
  return out;
}

const pct = (g: number, p: number) => (g + p === 0 ? 0 : g / (g + p));

/** Départage d'un bloc d'ex æquo (même nombre de victoires). Renvoie des sous-blocs ordonnés, du meilleur au moins bon. */
function departager(bloc: string[], matchs: MatchPoule[]): string[][] {
  if (bloc.length === 1) return [bloc];
  if (bloc.length === 2) {
    const [x, y] = bloc;
    const duel = matchs.find((m) => m.winnerId !== null && ((m.player1Id === x && m.player2Id === y) || (m.player1Id === y && m.player2Id === x)));
    if (!duel) return [bloc];
    return duel.winnerId === x ? [[x], [y]] : [[y], [x]];
  }
  // Trois (ou quatre) ex æquo : pourcentage de sets puis de jeux gagnés, sur leurs matchs entre eux.
  const c = cumuler(bloc, matchs);
  const cle = (id: string) => {
    const l = c.get(id)!;
    return `${pct(l.setsGagnes, l.setsPerdus).toFixed(9)}|${pct(l.jeuxGagnes, l.jeuxPerdus).toFixed(9)}`;
  };
  const tries = [...bloc].sort((a, b) => {
    const ca = c.get(a)!;
    const cb = c.get(b)!;
    return pct(cb.setsGagnes, cb.setsPerdus) - pct(ca.setsGagnes, ca.setsPerdus) || pct(cb.jeuxGagnes, cb.jeuxPerdus) - pct(ca.jeuxGagnes, ca.jeuxPerdus);
  });
  const sousBlocs: string[][] = [];
  for (const id of tries) {
    const dernier = sousBlocs[sousBlocs.length - 1];
    if (dernier && cle(dernier[0]) === cle(id)) dernier.push(id);
    else sousBlocs.push([id]);
  }
  // Si l'égalité à trois se réduit à deux joueurs, ils se départagent à la confrontation directe.
  return sousBlocs.flatMap((sb) => (sb.length === 2 && bloc.length > 2 ? departager(sb, matchs) : [sb]));
}

/**
 * Classement d'une poule à partir de ses matchs (joués ou non). Fonctionne en cours de poule :
 * le classement est alors PROVISOIRE (voir `pouleTerminee`).
 */
export function classementPoule(joueurs: string[], matchs: MatchPoule[]): LigneClassement[] {
  const cumul = cumuler(joueurs, matchs);
  const parVictoires = new Map<number, string[]>();
  for (const id of joueurs) {
    const v = cumul.get(id)!.victoires;
    parVictoires.set(v, [...(parVictoires.get(v) ?? []), id]);
  }
  const lignes: LigneClassement[] = [];
  let rang = 1;
  for (const v of [...parVictoires.keys()].sort((a, b) => b - a)) {
    for (const sousBloc of departager(parVictoires.get(v)!, matchs)) {
      for (const id of sousBloc) {
        const c = cumul.get(id)!;
        lignes.push({ playerId: id, rang, ...c, egalite: sousBloc.length > 1 });
      }
      rang += sousBloc.length;
    }
  }
  return lignes;
}

/** Une poule de 4 est terminée quand ses 6 matchs sont joués. */
export function pouleTerminee(joueurs: string[], matchs: MatchPoule[]): boolean {
  const n = joueurs.length;
  const attendus = (n * (n - 1)) / 2;
  return matchs.filter((m) => m.winnerId !== null && joueurs.includes(m.player1Id) && joueurs.includes(m.player2Id)).length >= attendus;
}

/**
 * Les deux qualifiés d'une poule terminée, dans l'ordre (1er, 2e). Null si la poule n'est pas terminée ou
 * si une égalité que les règles ne départagent pas masque un qualifié (2e / 3e) ou l'ordre des deux premiers
 * (qui décide des demies croisées).
 */
export function qualifies(joueurs: string[], matchs: MatchPoule[]): [string, string] | null {
  if (!pouleTerminee(joueurs, matchs)) return null;
  const [p1, p2, p3] = classementPoule(joueurs, matchs);
  if (p1.rang === p2.rang || (p3 && p2.rang === p3.rang)) return null;
  return [p1.playerId, p2.playerId];
}

/** Demies croisées : 1er A contre 2e B, 1er B contre 2e A. */
export function demisFinales(a: [string, string], b: [string, string]): [[string, string], [string, string]] {
  return [
    [a[0], b[1]],
    [b[0], a[1]],
  ];
}

/* ------------------------------------------------------------------ */
/*  Pronostic (à la place du bracket)                                  */
/* ------------------------------------------------------------------ */

export const POINTS_PRONOSTIC = { qualifie: 4, placeExacte: 2, finaliste: 8, champion: 16 } as const;
/** 4 qualifiés x 4 + 8 places x 2 + 2 finalistes x 8 + champion 16. */
export const MAX_PRONOSTIC = 4 * 4 + 8 * 2 + 2 * 8 + 16;

export interface PronosticMasters {
  /** Les 4 joueurs de chaque poule, du 1er au 4e. */
  classementA: string[];
  classementB: string[];
  /** Vainqueur des deux demies dessinées par le classement : [1er A - 2e B, 1er B - 2e A]. */
  vainqueursDemis: [string, string];
  champion: string;
}

/** Ce qui s'est réellement passé, au fur et à mesure (null = pas encore connu). */
export interface ReelMasters {
  classementA: string[] | null;
  classementB: string[] | null;
  /** Les deux finalistes (vainqueurs des demies). */
  finalistes: string[] | null;
  champion: string | null;
}

export interface PointsPronostic {
  qualifies: number;
  places: number;
  finalistes: number;
  champion: number;
  total: number;
  /** Points encore atteignables au mieux, selon ce qui est déjà joué (total + non joué). */
  maxRestant: number;
}

/**
 * Valide la cohérence d'un pronostic : chaque classement est une permutation des 4 joueurs de la poule,
 * le vainqueur de chaque demie est l'un des deux joueurs de cette demie, le champion est l'un des deux
 * vainqueurs. Renvoie la liste des problèmes (vide si valide).
 */
export function validerPronostic(p: PronosticMasters, poules: { A: string[]; B: string[] }): string[] {
  const erreurs: string[] = [];
  const memes = (x: string[], y: string[]) => x.length === y.length && [...x].sort().join() === [...y].sort().join();
  if (!memes(p.classementA, poules.A)) erreurs.push('Le classement de la poule A doit contenir exactement ses 4 joueurs, une fois chacun.');
  if (!memes(p.classementB, poules.B)) erreurs.push('Le classement de la poule B doit contenir exactement ses 4 joueurs, une fois chacun.');
  if (erreurs.length) return erreurs;
  const [d1, d2] = demisFinales([p.classementA[0], p.classementA[1]], [p.classementB[0], p.classementB[1]]);
  if (!d1.includes(p.vainqueursDemis[0])) erreurs.push('Le vainqueur de la 1re demie doit être le 1er de A ou le 2e de B.');
  if (!d2.includes(p.vainqueursDemis[1])) erreurs.push('Le vainqueur de la 2e demie doit être le 1er de B ou le 2e de A.');
  if (!p.vainqueursDemis.includes(p.champion)) erreurs.push('Le champion doit être l\'un des deux finalistes que tu as choisis.');
  return erreurs;
}

/**
 * Points d'un pronostic, calculés sur ce qui est DÉJÀ connu :
 *  - qualifié trouvé (4) : un des deux premiers prévus d'une poule est bien dans les deux premiers réels ;
 *  - place exacte (2) : le joueur est exactement à la place prévue ;
 *  - finaliste trouvé (8) : un finaliste réel figure parmi les deux vainqueurs de demie pronostiqués,
 *    quel que soit son parcours (même s'il gagne l'autre demie que celle de ton pronostic) ;
 *  - champion trouvé (16).
 */
export function pointsPronostic(p: PronosticMasters, reel: ReelMasters): PointsPronostic {
  let qualifiesPts = 0;
  let placesPts = 0;
  let maxRestant = 0;
  const poule = (prevu: string[], vrai: string[] | null) => {
    if (!vrai) {
      maxRestant += 2 * POINTS_PRONOSTIC.qualifie + 4 * POINTS_PRONOSTIC.placeExacte;
      return;
    }
    for (const id of prevu.slice(0, 2)) if (vrai.slice(0, 2).includes(id)) qualifiesPts += POINTS_PRONOSTIC.qualifie;
    prevu.forEach((id, i) => {
      if (vrai[i] === id) placesPts += POINTS_PRONOSTIC.placeExacte;
    });
  };
  poule(p.classementA, reel.classementA);
  poule(p.classementB, reel.classementB);

  let finalistesPts = 0;
  if (reel.finalistes) {
    for (const f of reel.finalistes) if (p.vainqueursDemis.includes(f)) finalistesPts += POINTS_PRONOSTIC.finaliste;
  } else {
    maxRestant += 2 * POINTS_PRONOSTIC.finaliste;
  }
  let championPts = 0;
  if (reel.champion !== null) {
    if (reel.champion === p.champion) championPts = POINTS_PRONOSTIC.champion;
  } else {
    maxRestant += POINTS_PRONOSTIC.champion;
  }
  const total = qualifiesPts + placesPts + finalistesPts + championPts;
  return { qualifies: qualifiesPts, places: placesPts, finalistes: finalistesPts, champion: championPts, total, maxRestant: total + maxRestant };
}

/* ------------------------------------------------------------------ */
/*  Picks : « une fois par phase »                                     */
/* ------------------------------------------------------------------ */

export interface PickMasters {
  round: string;
  half: Moitie | null;
  playerId: string;
}

/**
 * Joueurs que l'on ne peut PLUS piquer au tour `roundCible` : ceux déjà piqués dans la même phase
 * (trois journées de poules ; demie et finale). On repart de zéro en phase finale.
 */
export function joueursDejaPris(picks: PickMasters[], roundCible: string): Set<string> {
  const phase = phaseDuTour(roundCible);
  return new Set(picks.filter((p) => p.round !== roundCible && phaseDuTour(p.round) === phase).map((p) => p.playerId));
}

/** Problèmes d'un ensemble de picks (vide si tout est permis) : un joueur piqué deux fois dans la même phase. */
export function verifierPicksMasters(picks: PickMasters[]): string[] {
  const erreurs: string[] = [];
  for (const phase of ['poules', 'finale'] as const) {
    const vus = new Map<string, string>();
    for (const p of picks.filter((x) => phaseDuTour(x.round) === phase)) {
      const avant = vus.get(p.playerId);
      if (avant !== undefined && avant !== p.round) erreurs.push(`Un joueur ne se pique qu'une fois par phase : déjà pické en ${libelleTourMasters(avant)}, repiqué en ${libelleTourMasters(p.round)}.`);
      vus.set(p.playerId, p.round);
    }
  }
  return erreurs;
}
