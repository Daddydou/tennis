/**
 * RÉSULTATS D'UN MASTERS depuis l'API tennis — logique PURE (aucun import React / Next / Supabase).
 *
 * L'API publie, pour les Finals, la liste des matchs de poule SANS jour (seulement les paires de joueuses
 * et, quand ils sont programmés, des horaires), puis les demies et la finale. On rattache donc chaque
 * match de l'API à NOS matchs par la PAIRE de joueuses (jamais par une position dans un tableau) :
 *   - poules : la paire désigne le match (chaque paire ne se rencontre qu'une fois) ;
 *   - journées 2 et 3 : leurs lignes sont CRÉÉES dès que la journée 1 est jouée (les vainqueurs se
 *     rencontrent, les perdantes aussi, puis les deux duels restants : lib/mastersSim.ts) ;
 *   - demies : placées dès que les deux poules sont terminées (1er A – 2e B, 1er B – 2e A) ;
 *   - finale : placée dès que les deux demies sont jouées.
 * La paire d'une finale peut avoir déjà joué en poule (1er A contre 2e A) : on distingue alors poule et
 * phase finale par l'identifiant de tour de l'API (`roundId`).
 *
 * L'API est la SOURCE : ce qu'elle dit remplace nos valeurs (résultat, statut, sets, horaire).
 */
import { lireScore } from './extract/matchstat';
import { demisFinales, pouleDeMoitie, qualifies, type MatchPoule, type Moitie, type Poule } from './masters';
import { duelsJournee2, duelsRestants } from './mastersSim';
import type { LigneMatchMasters } from './mastersVue';

/** Un match de l'API, avec NOS identifiants de joueuses. */
export interface ObservationApi {
  roundId: number;
  date: string | null;
  /** Joueuses dans l'ordre de la source (joueur 1, joueur 2). */
  p1: string;
  p2: string;
  /** Vainqueur, ou null (pas fini, ou pas encore commencé). */
  winnerId: string | null;
  live: boolean;
  /** Score tel que la source l'écrit, vainqueur d'abord (« 6-4 7-6(3) »). */
  result: string;
}

export interface SetStocke {
  g1: number;
  g2: number;
  tb1: number | null;
  tb2: number | null;
}

export interface MajMatch {
  round: string;
  position: number;
  winnerId: string | null;
  status: string;
  sets: SetStocke[];
  scheduledAt: string | null;
}

export interface CreationMatch {
  round: 'J2' | 'J3';
  position: number;
  half: Moitie;
  player1Id: string;
  player2Id: string;
}

export interface PlacementMatch {
  round: 'SF' | 'F';
  position: number;
  player1Id: string;
  player2Id: string;
}

export interface PlanResultats {
  maj: MajMatch[];
  creations: CreationMatch[];
  placements: PlacementMatch[];
  avertissements: string[];
  /** Statut du tournoi d'après les matchs : upcoming (rien commencé), running, completed (finale jouée). */
  tournoiStatut: 'upcoming' | 'running' | 'completed';
}

const cle = (a: string, b: string) => [a, b].sort().join('|');
const DECIDES = ['completed', 'walkover', 'retired'];

/** Sets de la source (vainqueur d'abord) -> sets orientés dans l'ordre de NOTRE match. */
export function setsPourLigne(
  sets: { v: number; p: number; tb: number | null }[],
  ligne: { player1Id: string | null },
  o: ObservationApi,
): SetStocke[] {
  // Vainqueur connu : v = ses jeux. Sinon (match en cours) : v = les jeux du joueur 1 de la source.
  const nous1EstV = o.winnerId !== null ? ligne.player1Id === o.winnerId : ligne.player1Id === o.p1;
  return sets.map((s) => {
    const g1 = nous1EstV ? s.v : s.p;
    const g2 = nous1EstV ? s.p : s.v;
    const perdant1 = g1 < g2;
    return {
      g1,
      g2,
      tb1: s.tb !== null && g1 !== g2 && perdant1 ? s.tb : null,
      tb2: s.tb !== null && g1 !== g2 && !perdant1 ? s.tb : null,
    };
  });
}

/** Statut d'un match de l'API : en cours, programmé, ou terminé (normal, abandon, forfait). */
export function statutObservation(o: ObservationApi): string {
  const score = lireScore(o.result);
  if (o.live && o.winnerId === null) return 'live';
  if (score.issue === 'aucune' || o.winnerId === null) return score.sets.length > 0 ? 'live' : 'scheduled';
  return score.issue;
}

interface LigneEff extends LigneMatchMasters {
  scheduledAt?: string | null;
}

export function planResultatsMasters(rows: LigneMatchMasters[], observations: ObservationApi[]): PlanResultats {
  const eff: LigneEff[] = rows.map((r) => ({ ...r, sets: r.sets ? r.sets.map((s) => ({ ...s })) : [] }));
  const maj = new Map<string, MajMatch>();
  const creations: CreationMatch[] = [];
  const placements: PlacementMatch[] = [];
  const avertissements: string[] = [];

  const parPaire = new Map<string, ObservationApi[]>();
  for (const o of observations) parPaire.set(cle(o.p1, o.p2), [...(parPaire.get(cle(o.p1, o.p2)) ?? []), o]);

  const estPoule = (r: LigneEff) => r.round === 'J1' || r.round === 'J2' || r.round === 'J3';
  const lignesPoule = () => eff.filter((r) => estPoule(r) && r.player1Id && r.player2Id);
  const decide = (r: LigneEff) => DECIDES.includes(r.status) && r.winnerId !== null;

  // Identifiant de tour de l'API pour les poules : celui des matchs de la journée 1 déjà connus.
  const roundIdsPoule = new Set<number>();
  for (const r of eff.filter((x) => x.round === 'J1' && x.player1Id && x.player2Id)) {
    for (const o of parPaire.get(cle(r.player1Id!, r.player2Id!)) ?? []) roundIdsPoule.add(o.roundId);
  }
  const estObservationPoule = (o: ObservationApi) => roundIdsPoule.size === 0 || roundIdsPoule.has(o.roundId);

  /** Applique une observation à une ligne ; enregistre une mise à jour si quelque chose change. */
  const appliquer = (r: LigneEff, o: ObservationApi) => {
    const score = lireScore(o.result);
    const status = statutObservation(o);
    const sets = status === 'walkover' || status === 'scheduled' ? [] : setsPourLigne(score.sets, r, o);
    const winnerId = DECIDES.includes(status) ? o.winnerId : null;
    const scheduledAt = o.date;
    const memes =
      r.winnerId === winnerId &&
      r.status === status &&
      JSON.stringify((r.sets ?? []).map((s) => [s.g1, s.g2, s.tb1 ?? null, s.tb2 ?? null])) === JSON.stringify(sets.map((s) => [s.g1, s.g2, s.tb1, s.tb2])) &&
      (r.scheduledAt ?? null) === scheduledAt;
    r.winnerId = winnerId;
    r.status = status;
    r.sets = sets;
    r.scheduledAt = scheduledAt;
    if (!memes) maj.set(`${r.round}|${r.position ?? 0}`, { round: r.round, position: r.position ?? 0, winnerId, status, sets, scheduledAt });
  };

  const appliquerPoules = (rounds: string[]) => {
    for (const r of lignesPoule().filter((x) => rounds.includes(x.round))) {
      const o = (parPaire.get(cle(r.player1Id!, r.player2Id!)) ?? []).find(estObservationPoule);
      if (o) appliquer(r, o);
    }
  };

  // 1. Journée 1.
  appliquerPoules(['J1']);

  // 2. Journées 2 et 3 : créées dès que la journée 1 d'une poule est jouée.
  for (const poule of ['A', 'B'] as Poule[]) {
    const half: Moitie = poule === 'A' ? 'top' : 'bottom';
    const offset = poule === 'A' ? 0 : 2;
    const duJour = (round: string) => eff.filter((r) => r.round === round && r.half === half && r.player1Id && r.player2Id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const j1 = duJour('J1');
    const ids = [...new Set(eff.filter((r) => estPoule(r) && r.half === half).flatMap((r) => [r.player1Id, r.player2Id]).filter((x): x is string => x !== null))];
    if (j1.length !== 2 || !j1.every(decide) || ids.length !== 4) continue;
    const gagnant = (r: LigneEff) => r.winnerId!;
    const perdant = (r: LigneEff) => (r.winnerId === r.player1Id ? r.player2Id! : r.player1Id!);
    const creer = (round: 'J2' | 'J3', paires: [string, string][]) =>
      paires.forEach(([a, b], k) => {
        const c: CreationMatch = { round, position: offset + k, half, player1Id: a, player2Id: b };
        creations.push(c);
        eff.push({ round, position: c.position, half, player1Id: a, player2Id: b, winnerId: null, status: 'scheduled', sets: [], scheduledAt: null });
      });
    let j2 = duJour('J2');
    if (j2.length === 0) {
      creer('J2', duelsJournee2(gagnant(j1[0]), gagnant(j1[1]), perdant(j1[0]), perdant(j1[1])));
      j2 = duJour('J2');
    }
    if (duJour('J3').length === 0 && j2.length === 2) {
      creer('J3', duelsRestants(ids, [...j1, ...j2].map((r): [string, string] => [r.player1Id!, r.player2Id!])));
    }
  }
  appliquerPoules(['J2', 'J3']);

  // Avertissement : si l'API date les duels des journées 2 et 3 dans un ordre qui contredit notre déduction.
  for (const half of ['top', 'bottom'] as Moitie[]) {
    const dates = (round: string) =>
      eff
        .filter((r) => r.round === round && r.half === half && r.scheduledAt)
        .map((r) => new Date(r.scheduledAt!).getTime());
    const d2 = dates('J2');
    const d3 = dates('J3');
    if (d2.length === 2 && d3.length === 2 && Math.max(...d2) > Math.min(...d3)) {
      avertissements.push(`Poule ${pouleDeMoitie(half)} : l'API programme un duel de ce que nous avons déduit en journée 3 avant un duel de la journée 2 : la déduction (vainqueurs entre eux, perdants entre eux) est peut-être fausse.`);
    }
  }

  // 3. Phase finale : demies puis finale.
  const matchsPoule = (poule: Poule): { ids: string[]; matchs: MatchPoule[] } => {
    const half: Moitie = poule === 'A' ? 'top' : 'bottom';
    const lignes = eff.filter((r) => estPoule(r) && r.half === half && r.player1Id && r.player2Id);
    const ids = [...new Set(lignes.flatMap((r) => [r.player1Id!, r.player2Id!]))];
    return {
      ids,
      matchs: lignes.map((r) => ({ player1Id: r.player1Id!, player2Id: r.player2Id!, winnerId: decide(r) ? r.winnerId : null, sets: (r.sets ?? []).map((s) => ({ g1: s.g1 ?? 0, g2: s.g2 ?? 0 })) })),
    };
  };
  const qa = (() => { const p = matchsPoule('A'); return p.ids.length === 4 ? qualifies(p.ids, p.matchs) : null; })();
  const qb = (() => { const p = matchsPoule('B'); return p.ids.length === 4 ? qualifies(p.ids, p.matchs) : null; })();

  // Match de phase finale pour cette paire : tour d'API différent de celui des poules (ou, faute de repère,
  // paire qui n'est pas un duel de poule).
  const pairesDePoule = new Set(lignesPoule().map((r) => cle(r.player1Id!, r.player2Id!)));
  const observationPhaseFinale = (a: string, b: string) =>
    (parPaire.get(cle(a, b)) ?? []).find((o) => (roundIdsPoule.size > 0 ? !roundIdsPoule.has(o.roundId) : !pairesDePoule.has(cle(a, b))));
  const placer = (r: LigneEff, a: string, b: string, round: 'SF' | 'F') => {
    if (decide(r)) return;
    if (r.player1Id === a && r.player2Id === b) return;
    r.player1Id = a;
    r.player2Id = b;
    placements.push({ round, position: r.position ?? 0, player1Id: a, player2Id: b });
  };
  const ligne = (round: 'SF' | 'F', position: number) => eff.find((r) => r.round === round && (r.position ?? 0) === position);

  if (qa && qb) {
    const paires = demisFinales(qa, qb);
    paires.forEach(([a, b], i) => {
      const r = ligne('SF', i);
      if (!r) return;
      placer(r, a, b, 'SF');
      const o = observationPhaseFinale(a, b);
      if (o) appliquer(r, o);
    });
    const demis = [ligne('SF', 0), ligne('SF', 1)];
    if (demis.every((r) => r && decide(r))) {
      const rf = ligne('F', 0);
      if (rf) {
        const [f1, f2] = [demis[0]!.winnerId!, demis[1]!.winnerId!];
        placer(rf, f1, f2, 'F');
        const o = observationPhaseFinale(f1, f2);
        if (o) appliquer(rf, o);
      }
    }
  }

  const finale = ligne('F', 0);
  const tournoiStatut: PlanResultats['tournoiStatut'] = finale && decide(finale) ? 'completed' : eff.some((r) => r.status !== 'scheduled') ? 'running' : 'upcoming';
  return { maj: [...maj.values()], creations, placements, avertissements, tournoiStatut };
}
