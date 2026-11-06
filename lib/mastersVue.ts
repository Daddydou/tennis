/**
 * VUE D'UN TOURNOI MASTERS — transforme les matchs de la base en poules, classements, demies et finale.
 * Module PUR (voir lib/masters.ts pour les règles).
 *
 * Dans la base : tours J1, J2, J3 (poules), SF, F. Un match de poule porte sa poule dans `half`
 * ('top' = A, 'bottom' = B). Les demies et la finale n'ont leurs joueurs qu'une fois les poules
 * jouées : tant qu'ils manquent, on les DÉDUIT du classement quand il est sûr, sinon on affiche
 * l'étiquette de la place (« 1er A », « 2e B »...).
 */
import {
  classementPoule,
  demisFinales,
  pouleDeMoitie,
  pouleTerminee,
  qualifies,
  type LigneClassement,
  type MatchPoule,
  type Moitie,
  type Poule,
  type SetJeux,
} from './masters';

export interface LigneMatchMasters {
  round: string;
  position: number | null;
  half: Moitie | null;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  status: string;
  /** Jeux d'un set ; null tant que le set n'est pas commencé (même forme que tn_matches.sets). */
  sets: { g1: number | null; g2: number | null; tb1?: number | null; tb2?: number | null }[] | null;
  /** Horaire programmé (tn_matches.scheduled_at), si connu. */
  scheduledAt?: string | null;
}

export type EtatMatch = 'a_jouer' | 'en_cours' | 'termine';

export interface MatchVue {
  round: string;
  position: number;
  player1Id: string | null;
  player2Id: string | null;
  /** Vainqueur, seulement si le match est tranché. */
  winnerId: string | null;
  sets: SetJeux[];
  etat: EtatMatch;
  /** « w/o » ou « ab. » : le score est incomplet. */
  speciale: 'forfait' | 'abandon' | null;
}

export interface PouleVue {
  poule: Poule;
  joueurs: string[];
  classement: LigneClassement[];
  terminee: boolean;
  /** Les deux qualifiés (1er, 2e) quand la poule est terminée et que le classement est sans ambiguïté. */
  qualifies: [string, string] | null;
  journees: { round: 'J1' | 'J2' | 'J3'; matchs: MatchVue[] }[];
}

export interface DemiVue {
  position: number;
  player1Id: string | null;
  player2Id: string | null;
  /** Joueurs déduits du classement des poules (pas encore enregistrés sur le match). */
  deduit: boolean;
  /** Ce que désigne chaque place tant que le joueur n'est pas connu. */
  etiquettes: [string, string];
  match: MatchVue | null;
}

export interface FinaleVue {
  player1Id: string | null;
  player2Id: string | null;
  etiquettes: [string, string];
  match: MatchVue | null;
}

export interface VueMasters {
  poules: Record<Poule, PouleVue>;
  demis: [DemiVue, DemiVue];
  finale: FinaleVue;
  championId: string | null;
}

const DECIDES = ['completed', 'walkover', 'retired'];

function versMatch(r: LigneMatchMasters): MatchVue {
  const decide = DECIDES.includes(r.status) && r.winnerId !== null;
  return {
    round: r.round,
    position: r.position ?? 0,
    player1Id: r.player1Id,
    player2Id: r.player2Id,
    winnerId: decide ? r.winnerId : null,
    sets: (r.sets ?? []).map((s) => ({ g1: s.g1 ?? 0, g2: s.g2 ?? 0 })),
    etat: decide ? 'termine' : r.status === 'live' || r.status === 'in_progress' ? 'en_cours' : 'a_jouer',
    speciale: r.status === 'walkover' ? 'forfait' : r.status === 'retired' ? 'abandon' : null,
  };
}

export function vueMasters(rows: LigneMatchMasters[]): VueMasters {
  const matchsDe = (round: string) => rows.filter((r) => r.round === round).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const poule = (p: Poule): PouleVue => {
    const matchs: LigneMatchMasters[] = rows.filter(
      (r) => (r.round === 'J1' || r.round === 'J2' || r.round === 'J3') && r.half !== null && pouleDeMoitie(r.half) === p,
    );
    const joueurs = [...new Set(matchs.flatMap((m) => [m.player1Id, m.player2Id]).filter((x): x is string => x !== null))];
    const pour: MatchPoule[] = matchs
      .filter((m): m is LigneMatchMasters & { player1Id: string; player2Id: string } => m.player1Id !== null && m.player2Id !== null)
      .map((m) => {
        const v = versMatch(m);
        return { player1Id: m.player1Id, player2Id: m.player2Id, winnerId: v.winnerId, sets: v.sets };
      });
    return {
      poule: p,
      joueurs,
      classement: classementPoule(joueurs, pour),
      terminee: joueurs.length >= 2 && pouleTerminee(joueurs, pour),
      qualifies: qualifies(joueurs, pour),
      journees: (['J1', 'J2', 'J3'] as const).map((round) => ({
        round,
        matchs: matchs.filter((m) => m.round === round).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(versMatch),
      })),
    };
  };

  const A = poule('A');
  const B = poule('B');
  const sf = matchsDe('SF');
  const deduits = A.qualifies && B.qualifies ? demisFinales(A.qualifies, B.qualifies) : null;
  const etiquettes: [[string, string], [string, string]] = [['1er A', '2e B'], ['1er B', '2e A']];

  const demi = (i: 0 | 1): DemiVue => {
    const ligne = sf.find((r) => r.position === i) ?? sf[i];
    const match = ligne ? versMatch(ligne) : null;
    const connus = match && match.player1Id && match.player2Id;
    return {
      position: i,
      player1Id: connus ? match.player1Id : (deduits?.[i][0] ?? null),
      player2Id: connus ? match.player2Id : (deduits?.[i][1] ?? null),
      deduit: !connus && deduits !== null,
      etiquettes: etiquettes[i],
      match,
    };
  };
  const demis: [DemiVue, DemiVue] = [demi(0), demi(1)];

  const ligneF = matchsDe('F')[0];
  const matchF = ligneF ? versMatch(ligneF) : null;
  const gagnantDemi = (d: DemiVue) => d.match?.winnerId ?? null;
  const finale: FinaleVue = {
    player1Id: matchF?.player1Id ?? gagnantDemi(demis[0]),
    player2Id: matchF?.player2Id ?? gagnantDemi(demis[1]),
    etiquettes: ['Vainqueur demie 1', 'Vainqueur demie 2'],
    match: matchF,
  };

  return { poules: { A, B }, demis, finale, championId: matchF?.winnerId ?? null };
}
