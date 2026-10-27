/**
 * DONNÉES DE L'ÉCRAN PLAN — ce que le serveur envoie au navigateur pour que
 * l'écran Picks calcule TOUT localement (plan, agressivité, rivaux) sans
 * aller-retour réseau à chaque clic. Module PUR : `construireDonneesPlan`
 * transforme les lignes de la base en un objet sérialisable.
 *
 * Ce que contient l'objet, et pourquoi :
 *   - `joueurs`      : tous les joueurs du tableau, par indice (Elo effectif,
 *                      moitié, source de l'Elo pour l'affichage) ;
 *   - `ouverture`    : les participants à l'ouverture du PREMIER TOUR NON
 *                      TERMINÉ (`r0`) — le point de départ de tous les calculs ;
 *   - `fixes`        : les duels de ce tour déjà joués, avec leurs points réels
 *                      (le plan en tient compte : un duel joué n'est plus un pari) ;
 *   - `blend`        : les duels pour lesquels des cotes remplacent l'Elo seul,
 *                      comme dans la simulation de production ;
 *   - `participants` : les picks posés de chacun (moi, Laki, Thomas…).
 */

import { pVictoire, type ProbabiliteMatch } from './elo';
import { genererSlots } from './optimizerAffectation';
import { creerTableauDepuisSpec, specDepuisMatches } from './planTableau';
import { scorePlayerInMatch } from './scoring';
import { STATUTS_DECIDES, type Half, type Match, type MatchStatus, type Player, type Slot } from './types';

export type SourceElo = 'ta' | 'maison' | 'defaut' | 'ambigu';

export interface JoueurPlan {
  id: string;
  nom: string;
  rang: number | null;
  /** Elo effectif (pondéré surface) réellement utilisé par les calculs. */
  elo: number;
  moitie: Half;
  sourceElo: SourceElo;
  taName: string | null;
  candidatsElo: string[];
}

export interface DuelFixe {
  a: number;
  b: number;
  gagnantEstA: boolean;
  ptsA: number;
  ptsB: number;
}

export interface PickPose {
  round: string;
  half: Half | null;
  /** Indice dans `joueurs`. */
  joueur: number;
  points: number | null;
}

export interface ParticipantDonnees {
  /** null = moi. */
  id: string | null;
  nom: string;
  picks: PickPose[];
}

export interface DonneesPlan {
  tournoiId: string;
  nom: string;
  rounds: string[];
  bestOf: 3 | 5;
  /** Indice du premier tour non terminé ; `rounds.length` si le tournoi est fini. */
  r0: number;
  joueurs: JoueurPlan[];
  /** Positions du premier tour (indice, ou null pour un bye). */
  grille: (number | null)[];
  /** Participants à l'ouverture du tour r0, dans l'ordre du tableau. */
  ouverture: (number | null)[];
  /** [a, b, P(a bat b)] avec a < b, pour les duels où des cotes remplacent l'Elo. */
  blend: [number, number, number][];
  fixes: DuelFixe[];
  participants: ParticipantDonnees[];
  slots: Slot[];
}

export interface LigneMatch {
  round: string;
  position: number | null;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  status: MatchStatus;
}

export interface LignePick {
  participant_id: string | null;
  round: string;
  half: Half | null;
  player_id: string;
  points: number | null;
}

export interface EntreeDonnees {
  tournoiId: string;
  nom: string;
  rounds: string[];
  bestOf: 3 | 5;
  surface: 'hard' | 'clay' | 'grass';
  matches: Match[];
  matchRows: LigneMatch[];
  players: Record<string, Player>;
  /** Pour l'affichage : d'où vient l'Elo de chaque joueur. */
  infoElo: Record<string, { source: SourceElo; taName: string | null; candidats: string[] }>;
  probabiliteMatch?: ProbabiliteMatch;
  /** Poids de l'Elo de surface dans l'Elo effectif (celui du moteur de production). */
  poidsSurface?: number;
  /** Moi d'abord (id null), puis les participants configurés. */
  participants: { id: string | null; nom: string }[];
  picks: LignePick[];
}

export function construireDonneesPlan(e: EntreeDonnees): DonneesPlan {
  const { rounds, matchRows } = e;
  const spec = specDepuisMatches(e.matches, e.players, rounds, e.bestOf, e.surface, e.poidsSurface);
  const t = creerTableauDepuisSpec(spec);
  const index = new Map(spec.ids.map((id, j) => [id, j]));

  const decide = (m: LigneMatch) => STATUTS_DECIDES.includes(m.status);
  let r0 = rounds.findIndex((r) => matchRows.some((m) => m.round === r && !decide(m)));
  if (r0 < 0) r0 = rounds.length;

  // Participants à l'ouverture du tour r0. Une case vide (adversaire pas encore
  // inscrit sur la ligne) est reconstruite depuis le vainqueur du duel du tour
  // précédent : la base peut avoir un temps de retard sur le résultat.
  let ouverture: (number | null)[] = [];
  if (r0 === 0) ouverture = [...t.grille];
  else if (r0 < rounds.length) {
    const duels = matchRows
      .filter((m) => m.round === rounds[r0])
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    duels.forEach((m, i) => {
      ([m.player1_id, m.player2_id] as (string | null)[]).forEach((id, cote) => {
        let pid = id;
        if (!pid) {
          const precedent = matchRows.find((x) => x.round === rounds[r0 - 1] && x.position === 2 * i + cote);
          pid = precedent?.winner_id ?? null;
        }
        ouverture.push(pid ? (index.get(pid) ?? null) : null);
      });
    });
  }

  // Cotes : seulement les duels du tour r0 (une cote n'existe que pour une
  // affiche connue). La fonction de production n'est pas sérialisable : on en
  // relève les valeurs.
  const blend: [number, number, number][] = [];
  if (e.probabiliteMatch) {
    for (let i = 0; i + 1 < ouverture.length; i += 2) {
      const a = ouverture[i];
      const b = ouverture[i + 1];
      if (a === null || b === null) continue;
      const pElo = pVictoire(spec.elo[a], spec.elo[b]);
      const p = e.probabiliteMatch(spec.ids[a], spec.ids[b], pElo);
      if (Math.abs(p - pElo) > 1e-9) blend.push(a < b ? [a, b, p] : [b, a, 1 - p]);
    }
  }

  // Duels de r0 déjà joués : issue et points réels.
  const fixes: DuelFixe[] = [];
  if (r0 < rounds.length) {
    for (const row of matchRows) {
      if (row.round !== rounds[r0] || !decide(row) || row.status === 'bye') continue;
      if (!row.player1_id || !row.player2_id || !row.winner_id) continue;
      const a = index.get(row.player1_id);
      const b = index.get(row.player2_id);
      if (a === undefined || b === undefined) continue;
      const m = e.matches.find((x) => x.round === row.round && x.position === (row.position ?? 0));
      if (!m) continue;
      fixes.push({
        a,
        b,
        gagnantEstA: row.winner_id === row.player1_id,
        ptsA: scorePlayerInMatch(m, row.player1_id, e.bestOf)?.total ?? 0,
        ptsB: scorePlayerInMatch(m, row.player2_id, e.bestOf)?.total ?? 0,
      });
    }
  }

  const joueurs: JoueurPlan[] = spec.ids.map((id, j) => {
    const info = e.infoElo[id];
    return {
      id,
      nom: e.players[id]?.name ?? id,
      rang: e.players[id]?.rank ?? null,
      elo: spec.elo[j],
      moitie: spec.moitie[j],
      sourceElo: info?.source ?? 'defaut',
      taName: info?.taName ?? null,
      candidatsElo: info?.candidats ?? [],
    };
  });

  const participants: ParticipantDonnees[] = e.participants.map((p) => ({
    id: p.id,
    nom: p.nom,
    picks: e.picks
      .filter((k) => (k.participant_id ?? null) === p.id && index.has(k.player_id))
      .map((k) => ({ round: k.round, half: k.half, joueur: index.get(k.player_id) as number, points: k.points })),
  }));

  return {
    tournoiId: e.tournoiId,
    nom: e.nom,
    rounds,
    bestOf: e.bestOf,
    r0,
    joueurs,
    grille: spec.grille,
    ouverture,
    blend,
    fixes,
    participants,
    slots: genererSlots(rounds),
  };
}
