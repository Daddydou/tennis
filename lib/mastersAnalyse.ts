/**
 * Analyse des matchs d'un Masters pour l'onglet Picks : pour chaque match dont
 * les deux joueuses sont connues (poules J1..J3, demies, finale), leur Elo, la
 * chance de gagner et QUI les a pickées (Moi, Laki, Thomas...).
 *
 * Module PUR (ni Next ni Supabase).
 */
import { pVictoire } from './elo';
import type { VueMasters } from './mastersVue';

export interface PickMastersAnalyse {
  /** Nom du participant (« Moi », « Laki »...). */
  participant: string;
  round: string;
  playerId: string;
}

export interface JoueuseAnalyseMasters {
  id: string;
  elo: number | null;
  /** Chance de gagner CE match (Elo), null si un Elo manque. */
  proba: number | null;
  /** Picks de cette joueuse, tous participants et tous tours confondus. */
  picks: { participant: string; round: string }[];
}

export interface MatchAnalyseMasters {
  round: string;
  /** « A » / « B » pour les poules, null en phase finale. */
  poule: 'A' | 'B' | null;
  etat: 'a_jouer' | 'en_cours' | 'termine';
  vainqueurId: string | null;
  joueuses: [JoueuseAnalyseMasters, JoueuseAnalyseMasters];
}

export function analyserMatchsMasters(args: {
  vue: VueMasters;
  elo: Record<string, number>;
  picks: PickMastersAnalyse[];
}): MatchAnalyseMasters[] {
  const { vue, elo, picks } = args;

  const joueuse = (id: string, adv: string): JoueuseAnalyseMasters => {
    const e = elo[id];
    const ea = elo[adv];
    return {
      id,
      elo: e === undefined ? null : Math.round(e),
      proba: e === undefined || ea === undefined ? null : pVictoire(e, ea),
      picks: picks.filter((p) => p.playerId === id).map((p) => ({ participant: p.participant, round: p.round })),
    };
  };

  const sortie: MatchAnalyseMasters[] = [];
  const ajouter = (
    poule: 'A' | 'B' | null,
    m: { round: string; player1Id: string | null; player2Id: string | null; winnerId: string | null; etat: MatchAnalyseMasters['etat'] },
  ) => {
    if (!m.player1Id || !m.player2Id) return;
    sortie.push({
      round: m.round,
      poule,
      etat: m.etat,
      vainqueurId: m.winnerId,
      joueuses: [joueuse(m.player1Id, m.player2Id), joueuse(m.player2Id, m.player1Id)],
    });
  };

  for (const p of ['A', 'B'] as const) {
    for (const j of vue.poules[p].journees) for (const m of j.matchs) ajouter(p, m);
  }
  for (const d of vue.demis) {
    ajouter(null, {
      round: 'SF',
      player1Id: d.player1Id,
      player2Id: d.player2Id,
      winnerId: d.match?.winnerId ?? null,
      etat: d.match?.etat ?? 'a_jouer',
    });
  }
  ajouter(null, {
    round: 'F',
    player1Id: vue.finale.player1Id,
    player2Id: vue.finale.player2Id,
    winnerId: vue.finale.match?.winnerId ?? null,
    etat: vue.finale.match?.etat ?? 'a_jouer',
  });
  return sortie;
}
