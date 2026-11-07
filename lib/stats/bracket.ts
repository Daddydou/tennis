/**
 * STATISTIQUES — vue « Bracket » : la qualité des pronostics de tableau.
 *
 * Un pronostic de bracket = le vainqueur annoncé d'UNE case du tableau (tour + position),
 * indépendant des autres tours (cf. tn_bracket_round_picks). Il est juste quand le vainqueur
 * réel de cette case est le joueur annoncé. Le barème 2^(tour-1) vient de lib/bracketArbre.ts.
 */

import { pointsDuTour } from '../bracketArbre';
import {
  adversaireDe,
  cleStock,
  comparerTours,
  indexMatchsParCase,
  matchDecide,
  part,
  probaElo,
  probaMarche,
  type BracketPickStat,
  type DuelCotes,
  type EloDe,
  type MatchStat,
  type StockStat,
  type TournoiStat,
} from './commun';

export type EtatBracket = 'juste' | 'rate' | 'attente';

function etatDe(bp: BracketPickStat, caseDe: Map<string, MatchStat>): { etat: EtatBracket; match: MatchStat | null } {
  const m = caseDe.get(`${bp.tournament_id}|${bp.round}|${bp.position}`) ?? null;
  if (!m || !matchDecide(m)) return { etat: 'attente', match: m };
  return { etat: m.winner_id === bp.player_id ? 'juste' : 'rate', match: m };
}

/* -------------------------------------------------------------------------- */
/*  21 — précision par tour                                                    */
/* -------------------------------------------------------------------------- */

export interface PrecisionTour {
  round: string;
  parStock: Record<string, { n: number; justes: number; taux: number | null }>;
}

export function precisionParTour(
  bps: BracketPickStat[],
  matchs: MatchStat[],
  stocks: StockStat[],
): { total: PrecisionTour['parStock']; parTour: PrecisionTour[] } {
  const caseDe = indexMatchsParCase(matchs);
  const evalues = bps.map((bp) => ({ bp, ...etatDe(bp, caseDe) })).filter((x) => x.etat !== 'attente');
  const calcul = (liste: typeof evalues): PrecisionTour['parStock'] => {
    const out: PrecisionTour['parStock'] = {};
    for (const s of stocks) {
      const siens = liste.filter((x) => x.bp.participant_id === s.id);
      const justes = siens.filter((x) => x.etat === 'juste').length;
      out[cleStock(s.id)] = { n: siens.length, justes, taux: part(justes, siens.length) };
    }
    return out;
  };
  const rounds = [...new Set(evalues.map((x) => x.bp.round))].sort(comparerTours);
  return {
    total: calcul(evalues),
    parTour: rounds.map((round) => ({ round, parStock: calcul(evalues.filter((x) => x.bp.round === round)) })),
  };
}

/* -------------------------------------------------------------------------- */
/*  22 et 23 — champion et finalistes                                          */
/* -------------------------------------------------------------------------- */

export interface ResumeChampion {
  cle: string;
  nom: string;
  /** Tournois dont la finale est jouée ET où le stock a pronostiqué la finale. */
  champions: { evalues: number; trouves: number };
  /** Tournois dont la finale est connue ET où le stock a pronostiqué les deux demi-finales. */
  finalistes: { evalues: number; trouves: number; parfaits: number };
}

export function championsEtFinalistes(
  bps: BracketPickStat[],
  matchs: MatchStat[],
  tournois: TournoiStat[],
  stocks: StockStat[],
): ResumeChampion[] {
  const finales = new Map<string, MatchStat>();
  for (const m of matchs) if (m.round === 'F' && matchDecide(m)) finales.set(m.tournament_id, m);

  return stocks.map((s) => {
    const siens = bps.filter((b) => b.participant_id === s.id);
    const res: ResumeChampion = {
      cle: cleStock(s.id),
      nom: s.nom,
      champions: { evalues: 0, trouves: 0 },
      finalistes: { evalues: 0, trouves: 0, parfaits: 0 },
    };
    for (const t of tournois) {
      const finale = finales.get(t.id);
      if (!finale) continue;
      const deLui = siens.filter((b) => b.tournament_id === t.id);
      const pronoFinale = deLui.find((b) => b.round === 'F');
      if (pronoFinale) {
        res.champions.evalues++;
        if (pronoFinale.player_id === finale.winner_id) res.champions.trouves++;
      }
      const demis = deLui.filter((b) => b.round === 'SF');
      const nbDemisReels = new Set(
        matchs.filter((m) => m.tournament_id === t.id && m.round === 'SF').map((m) => m.position),
      ).size;
      if (demis.length > 0 && demis.length === nbDemisReels) {
        const annonces = new Set(demis.map((d) => d.player_id));
        const reels = [finale.player1_id, finale.player2_id].filter((x): x is string => x !== null);
        const trouves = reels.filter((r) => annonces.has(r)).length;
        res.finalistes.evalues++;
        res.finalistes.trouves += trouves;
        if (trouves === reels.length) res.finalistes.parfaits++;
      }
    }
    return res;
  });
}

/* -------------------------------------------------------------------------- */
/*  24 — audace du bracket                                                     */
/* -------------------------------------------------------------------------- */

export interface Audace {
  cle: string;
  nom: string;
  /** Pronostics évaluables : le joueur annoncé est dans le match réel ET les deux Elo sont connus. */
  evaluables: number;
  outsiders: number;
  outsidersJustes: number;
  favorisJustes: number;
  favoris: number;
  /** Points de bracket (2^(tour-1)) gagnés grâce à des outsiders. */
  pointsViaOutsiders: number;
}

export function audaceDuBracket(
  bps: BracketPickStat[],
  matchs: MatchStat[],
  tournois: TournoiStat[],
  stocks: StockStat[],
  eloDe: EloDe,
): Audace[] {
  const caseDe = indexMatchsParCase(matchs);
  const tournoiDe = new Map(tournois.map((t) => [t.id, t]));
  return stocks.map((s) => {
    const a: Audace = {
      cle: cleStock(s.id),
      nom: s.nom,
      evaluables: 0,
      outsiders: 0,
      outsidersJustes: 0,
      favorisJustes: 0,
      favoris: 0,
      pointsViaOutsiders: 0,
    };
    for (const bp of bps.filter((b) => b.participant_id === s.id)) {
      const { etat, match } = etatDe(bp, caseDe);
      if (etat === 'attente' || !match) continue;
      const adv = adversaireDe(match, bp.player_id);
      if (adv === null) continue; // le joueur annoncé n'était plus dans ce match
      const t = tournoiDe.get(bp.tournament_id);
      const p = probaElo(bp.player_id, adv, t?.surface ?? null, eloDe);
      if (p === null || p === 0.5) continue;
      a.evaluables++;
      if (p < 0.5) {
        a.outsiders++;
        if (etat === 'juste') {
          a.outsidersJustes++;
          a.pointsViaOutsiders += pointsDuTour(t?.rounds ?? [], bp.round);
        }
      } else {
        a.favoris++;
        if (etat === 'juste') a.favorisJustes++;
      }
    }
    return a;
  });
}

/* -------------------------------------------------------------------------- */
/*  25 — bracket contre bookmakers                                             */
/* -------------------------------------------------------------------------- */

export interface ContreCotes {
  cle: string;
  nom: string;
  /** Pronostics décidés dont le duel a une cote. */
  n: number;
  justes: number;
  /** Sur ces mêmes duels : le favori du marché a-t-il gagné ? */
  favoriMarcheJustes: number;
}

export function bracketContreCotes(
  bps: BracketPickStat[],
  matchs: MatchStat[],
  cotes: Map<string, DuelCotes>,
  stocks: StockStat[],
): ContreCotes[] {
  const caseDe = indexMatchsParCase(matchs);
  return stocks.map((s) => {
    const r: ContreCotes = { cle: cleStock(s.id), nom: s.nom, n: 0, justes: 0, favoriMarcheJustes: 0 };
    for (const bp of bps.filter((b) => b.participant_id === s.id)) {
      const { etat, match } = etatDe(bp, caseDe);
      if (etat === 'attente' || !match || !match.player1_id || !match.player2_id) continue;
      const p1 = probaMarche(cotes, bp.tournament_id, match.player1_id, match.player2_id);
      if (p1 === null || p1 === 0.5) continue;
      r.n++;
      if (etat === 'juste') r.justes++;
      const favori = p1 > 0.5 ? match.player1_id : match.player2_id;
      if (favori === match.winner_id) r.favoriMarcheJustes++;
    }
    return r;
  });
}

/* -------------------------------------------------------------------------- */
/*  26 — consensus contre solo                                                 */
/* -------------------------------------------------------------------------- */

export interface Consensus {
  /** Cases où tout le monde (au moins 2) annonce le même vainqueur. */
  unanimes: { n: number; justes: number };
  /** Cases à 3 pronostiqueurs partagés 2 contre 1 : la majorité avait-elle raison ? */
  deuxContreUn: { n: number; majoriteJuste: number };
  /** Quand un stock est seul de son avis (tous les autres sont d'accord entre eux). */
  seul: Record<string, { nom: string; n: number; justes: number }>;
}

export function consensusDuGroupe(
  bps: BracketPickStat[],
  matchs: MatchStat[],
  stocks: StockStat[],
): Consensus {
  const caseDe = indexMatchsParCase(matchs);
  const parCase = new Map<string, BracketPickStat[]>();
  for (const bp of bps) {
    const cle = `${bp.tournament_id}|${bp.round}|${bp.position}`;
    parCase.set(cle, [...(parCase.get(cle) ?? []), bp]);
  }
  const res: Consensus = {
    unanimes: { n: 0, justes: 0 },
    deuxContreUn: { n: 0, majoriteJuste: 0 },
    seul: Object.fromEntries(stocks.map((s) => [cleStock(s.id), { nom: s.nom, n: 0, justes: 0 }])),
  };
  for (const [cle, liste] of parCase) {
    const m = caseDe.get(cle);
    if (liste.length < 2 || !m || !matchDecide(m)) continue;
    const votes = new Map<string, BracketPickStat[]>();
    for (const bp of liste) votes.set(bp.player_id, [...(votes.get(bp.player_id) ?? []), bp]);
    if (votes.size === 1) {
      res.unanimes.n++;
      if (m.winner_id === liste[0].player_id) res.unanimes.justes++;
      continue;
    }
    if (liste.length === 3 && votes.size === 2) {
      const groupes = [...votes].sort((a, b) => b[1].length - a[1].length);
      const [maj, min] = [groupes[0], groupes[1]];
      res.deuxContreUn.n++;
      if (m.winner_id === maj[0]) res.deuxContreUn.majoriteJuste++;
      const seul = res.seul[cleStock(min[1][0].participant_id)];
      if (seul) {
        seul.n++;
        if (m.winner_id === min[0]) seul.justes++;
      }
    }
  }
  return res;
}

/* -------------------------------------------------------------------------- */
/*  27 — bracket de Thomas : ses points contre les nôtres                      */
/* -------------------------------------------------------------------------- */

export interface ParticipantExterne {
  tournoi_id: string;
  pseudo: string;
  rempli: boolean;
  points_totaux_thomas: number | null;
  points_totaux_calcule: number | null;
}

export interface TournoiExterne {
  id: string;
  nom: string;
  tournament_id_interne: string | null;
}

export function ecartsBracketExterne(
  participants: ParticipantExterne[],
  tournois: TournoiExterne[],
): {
  lignes: { tournoi: string; pseudo: string; thomas: number; calcule: number; ecart: number }[];
  compares: number;
  identiques: number;
} {
  const nomDe = new Map(tournois.map((t) => [t.id, t.nom]));
  const lignes = participants
    .filter((p) => p.rempli && p.points_totaux_thomas !== null && p.points_totaux_calcule !== null)
    .map((p) => ({
      tournoi: nomDe.get(p.tournoi_id) ?? p.tournoi_id,
      pseudo: p.pseudo,
      thomas: p.points_totaux_thomas as number,
      calcule: p.points_totaux_calcule as number,
      ecart: (p.points_totaux_calcule as number) - (p.points_totaux_thomas as number),
    }));
  return {
    lignes: lignes.filter((l) => l.ecart !== 0).sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart)),
    compares: lignes.length,
    identiques: lignes.filter((l) => l.ecart === 0).length,
  };
}
