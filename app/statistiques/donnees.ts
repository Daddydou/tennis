import 'server-only';
import { listerHistorique } from '@/db/fantasy';
import {
  bracketPicksDesTournois,
  matchsDesTournois,
  picksDesTournois,
} from '@/db/bilan-saison';
import { chargerIndexElo, eloEffectifResolu, resoudreElos, type BaseElo, type ElosResolus } from '@/db/elo';
import {
  getParticipants,
  getPlayerRows,
  listTournaments,
  surfacePourElo,
  type MatchRow,
  type PlayerRow,
  type TournamentRow,
} from '@/db/queries';
import {
  bracketExterne,
  compterTables,
  cotesHistoriqueDesTournois,
  dernieresDates,
  dernierMatchMisAJour,
  journalImport,
  picksSimulesDesTournois,
  reservationsDesTournois,
} from '@/db/statistiques';
import { pointsBracketParStock, pointsPicksParStock, stocksDuGroupe } from '@/app/tournoi/[id]/pointsStock';
import { LIBELLE_CATEGORIE_COURT } from '@/lib/calendrier';
import {
  comparerTours,
  indexerCotesParDuel,
  type EloDe,
  type JoueurStat,
  type PointsTournoiStat,
  type StockStat,
  type TournoiStat,
} from '@/lib/stats/commun';
import * as appli from '@/lib/stats/appli';
import * as bracket from '@/lib/stats/bracket';
import * as circuit from '@/lib/stats/circuit';
import * as duel from '@/lib/stats/duel';
import * as fantasy from '@/lib/stats/fantasy';
import * as marche from '@/lib/stats/marche';
import * as picks from '@/lib/stats/picks';
import type { Surface } from '@/lib/types';

/**
 * ONGLET STATISTIQUES — assemblage. LECTURE SEULE : rien n'est écrit, rien n'est stocké, tout
 * est calculé à l'affichage à partir de ce qui est en base (comme le Bilan de saison).
 *
 * On ne lit que ce que la vue demandée consomme : l'onglet reste rapide même si certaines
 * vues (Circuit, Marché) manipulent plusieurs milliers de matchs.
 */

export const VUES = [
  { cle: 'duel', libelle: 'Duel', aide: 'Toi contre Laki et Thomas' },
  { cle: 'picks', libelle: 'Picks', aide: 'La qualité de tes choix' },
  { cle: 'bracket', libelle: 'Bracket', aide: 'Les pronostics de tableau' },
  { cle: 'fantasy', libelle: 'Fantasy', aide: 'Prévu contre réel' },
  { cle: 'circuit', libelle: 'Circuit', aide: 'Ce qui s’est passé sur les courts' },
  { cle: 'marche', libelle: 'Modèle & marché', aide: 'Elo, bookmakers, imports' },
  { cle: 'app', libelle: 'App', aide: 'Comptes et fraîcheur' },
] as const;

export type CleVue = (typeof VUES)[number]['cle'];
export type FiltreCircuit = 'tous' | 'ATP' | 'WTA';

export interface Filtres {
  vue: CleVue;
  annee: number | null;
  circuit: FiltreCircuit;
  /** 'moi' ou l'id d'un participant (vue Picks). */
  stock: string;
}

export function lireFiltres(p: { vue?: string; annee?: string; circuit?: string; stock?: string }): Filtres {
  const vue = VUES.some((v) => v.cle === p.vue) ? (p.vue as CleVue) : 'duel';
  const annee = p.annee && Number.isFinite(Number(p.annee)) ? Number(p.annee) : null;
  const circuit = p.circuit === 'ATP' || p.circuit === 'WTA' ? p.circuit : 'tous';
  return { vue, annee, circuit, stock: p.stock ?? 'moi' };
}

export const LIBELLE_SURFACE: Record<string, string> = {
  hard: 'Dur',
  clay: 'Terre battue',
  grass: 'Gazon',
  carpet: 'Moquette',
  inconnue: 'Surface inconnue',
};

/* -------------------------------------------------------------------------- */
/*  Outils                                                                     */
/* -------------------------------------------------------------------------- */

/** Lit les joueurs par paquets (une liste d'ids trop longue ferait une adresse trop longue). */
async function joueursParIds(ids: string[]): Promise<PlayerRow[]> {
  const uniques = [...new Set(ids)];
  const paquets: string[][] = [];
  for (let i = 0; i < uniques.length; i += 120) paquets.push(uniques.slice(i, i + 120));
  return (await Promise.all(paquets.map((p) => getPlayerRows(p)))).flat();
}

function idsDesMatchs(matchs: Pick<MatchRow, 'player1_id' | 'player2_id' | 'winner_id'>[]): string[] {
  const ids = new Set<string>();
  for (const m of matchs) for (const id of [m.player1_id, m.player2_id, m.winner_id]) if (id) ids.add(id);
  return [...ids];
}

const statsJoueurs = (rows: PlayerRow[]): Map<string, JoueurStat> =>
  new Map(
    rows.map((p) => [p.id, { id: p.id, name: p.name, country: p.country, tour: p.tour, rank: p.rank }]),
  );

interface OutilsElo {
  eloDe: EloDe;
  /** Comme eloDe, mais seulement quand la ligne vient réellement de la source demandée. */
  eloStrict: EloDe;
  surfaces: (id: string) => { dur: number; terre: number; gazon: number } | null;
}

/** Elo des joueurs depuis l'index d'une source (par défaut celle de l'app). */
async function preparerElo(joueurs: PlayerRow[], base?: BaseElo): Promise<OutilsElo> {
  const tours = [...new Set(joueurs.map((j) => j.tour))];
  const index = new Map(await Promise.all(tours.map(async (t) => [t, await chargerIndexElo(t, base)] as const)));
  const resolus = new Map<string, ElosResolus>();
  for (const j of joueurs) resolus.set(j.id, resoudreElos(j, index.get(j.tour)));
  const valeur = (id: string, surface: string | null, strict: boolean): number | null => {
    const e = resolus.get(id);
    if (!e || e.source === 'defaut' || e.source === 'ambigu') return null;
    if (strict && e.source !== 'ta') return null;
    return eloEffectifResolu(e, surfacePourElo(surface as Surface | null));
  };
  return {
    eloDe: (id, s) => valeur(id, s, false),
    eloStrict: (id, s) => valeur(id, s, true),
    surfaces: (id) => {
      const e = resolus.get(id);
      if (!e || e.source !== 'ta') return null;
      return { dur: e.eloHard, terre: e.eloClay, gazon: e.eloGrass };
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Contexte commun                                                            */
/* -------------------------------------------------------------------------- */

export interface Contexte {
  filtres: Filtres & { annee: number };
  annees: number[];
  tournois: TournoiRowStat[];
  stocks: StockStat[];
}

type TournoiRowStat = TournoiStat & { year: number };

async function construireContexte(f: Filtres): Promise<{ contexte: Contexte; tous: TournamentRow[] }> {
  const [tous, participants] = await Promise.all([listTournaments(), getParticipants()]);
  const annees = [...new Set(tous.map((t) => t.year))].sort((a, b) => b - a);
  const annee = f.annee !== null && annees.includes(f.annee) ? f.annee : (annees[0] ?? new Date().getFullYear());
  const tournois = tous.filter((t) => t.year === annee && (f.circuit === 'tous' || t.tour === f.circuit));
  return {
    tous,
    contexte: {
      filtres: { ...f, annee },
      annees,
      tournois,
      stocks: stocksDuGroupe(participants),
    },
  };
}

const libelleCategorie = (t: TournoiStat) => LIBELLE_CATEGORIE_COURT[t.category ?? ''] ?? 'Autre';
const libelleSurface = (t: TournoiStat) => LIBELLE_SURFACE[t.surface ?? 'inconnue'] ?? 'Autre';

/* -------------------------------------------------------------------------- */
/*  Les vues                                                                   */
/* -------------------------------------------------------------------------- */

async function vueDuel(c: Contexte) {
  const ids = c.tournois.map((t) => t.id);
  const [matchs, lesPicks, lesBracket] = await Promise.all([
    matchsDesTournois(ids),
    picksDesTournois(ids),
    bracketPicksDesTournois(ids),
  ]);
  const lignes: PointsTournoiStat[] = [];
  for (const t of c.tournois) {
    const pp = pointsPicksParStock(lesPicks.filter((p) => p.tournament_id === t.id));
    const pb = pointsBracketParStock(
      matchs.filter((m) => m.tournament_id === t.id),
      t.rounds ?? [],
      lesBracket.filter((b) => b.tournament_id === t.id),
    );
    for (const s of c.stocks) {
      if (!pp.has(s.id) && !pb.has(s.id)) continue;
      lignes.push({ tournoiId: t.id, stockId: s.id, picks: pp.get(s.id) ?? 0, bracket: pb.has(s.id) ? pb.get(s.id)! : null });
    }
  }
  const tableau = duel.tableauDuel(c.tournois, lignes);
  return {
    vue: 'duel' as const,
    tableau,
    resume: duel.resumeParStock(tableau, c.stocks),
    cumuls: duel.cumuls(tableau, c.stocks),
    parSurface: duel.repartition(tableau, c.stocks, libelleSurface),
    parCategorie: duel.repartition(tableau, c.stocks, libelleCategorie),
    parCircuit: duel.repartition(tableau, c.stocks, (t) => t.tour),
    parTour: duel.picksParTour(lesPicks, c.stocks, comparerTours),
    matrice: duel.matriceDesDuels(tableau, c.stocks),
  };
}

async function vuePicks(c: Contexte) {
  const stockId = c.filtres.stock === 'moi' ? null : c.filtres.stock;
  const stock = c.stocks.find((s) => s.id === stockId) ?? c.stocks[0];
  const ids = c.tournois.map((t) => t.id);
  const [matchs, tousPicks, reservations, simules] = await Promise.all([
    matchsDesTournois(ids),
    picksDesTournois(ids),
    reservationsDesTournois(ids),
    picksSimulesDesTournois(ids),
  ]);
  const siens = tousPicks.filter((p) => p.participant_id === stock.id);
  const joueurs = await joueursParIds([...idsDesMatchs(matchs), ...siens.map((p) => p.player_id)]);
  const { eloDe } = await preparerElo(joueurs);
  const analyses = picks.analyserPicks(siens, matchs, c.tournois, eloDe);
  const sesReservations = reservations.filter((r) => r.participant_id === stock.id);
  return {
    vue: 'picks' as const,
    stock,
    noms: Object.fromEntries(joueurs.map((j) => [j.id, j.name])),
    nbPicks: siens.length,
    taux: picks.tauxJustesParTour(analyses),
    surete: picks.suretePicks(analyses),
    chance: picks.chanceContreTalent(analyses),
    extremes: picks.meilleursEtPires(analyses),
    decomposition: picks.decompositionPoints(analyses),
    perdus: picks.pointsPerdus(analyses),
    strategie: picks.strategieDeStock(analyses, eloDe),
    fetiches: picks.fetiches(analyses),
    betesNoires: picks.betesNoires(analyses),
    plan: picks.suiviDuPlan(sesReservations, siens),
    simulateur: picks.moiContreSimulateur(
      simules.filter((s) => s.participant_id === stock.id),
      siens,
      matchs,
    ),
  };
}

async function vueBracket(c: Contexte) {
  const ids = c.tournois.map((t) => t.id);
  const [matchs, bps, cotesLignes, externe] = await Promise.all([
    matchsDesTournois(ids),
    bracketPicksDesTournois(ids),
    cotesHistoriqueDesTournois(ids),
    bracketExterne(),
  ]);
  const joueurs = await joueursParIds(idsDesMatchs(matchs));
  const { eloDe } = await preparerElo(joueurs);
  const cotes = indexerCotesParDuel(cotesLignes);
  const interne = new Set(ids);
  return {
    vue: 'bracket' as const,
    noms: Object.fromEntries(joueurs.map((j) => [j.id, j.name])),
    nbPronostics: bps.length,
    precision: bracket.precisionParTour(bps, matchs, c.stocks),
    champions: bracket.championsEtFinalistes(bps, matchs, c.tournois, c.stocks),
    audace: bracket.audaceDuBracket(bps, matchs, c.tournois, c.stocks, eloDe),
    contreCotes: bracket.bracketContreCotes(bps, matchs, cotes, c.stocks),
    consensus: bracket.consensusDuGroupe(bps, matchs, c.stocks),
    externe: bracket.ecartsBracketExterne(
      externe.participants.filter((p) => {
        const t = externe.tournois.find((x) => x.id === p.tournoi_id);
        return !t?.tournament_id_interne || interne.has(t.tournament_id_interne);
      }),
      externe.tournois,
    ),
  };
}

async function vueFantasy(c: Contexte) {
  const histo = await listerHistorique();
  const lignes = fantasy.lignesFantasy(
    histo.map((h) => ({
      tournament_id: h.tournament_id,
      e_predit: h.e_predit === null ? null : Number(h.e_predit),
      score_reel: h.score_reel === null ? null : Number(h.score_reel),
      termine: h.termine,
      e_predit_anterieur: h.e_predit_anterieur === null ? null : Number(h.e_predit_anterieur),
      score_reel_anterieur: h.score_reel_anterieur === null ? null : Number(h.score_reel_anterieur),
      joueurs_sans_elo: h.joueurs_sans_elo,
    })),
    c.tournois,
  );
  return {
    vue: 'fantasy' as const,
    lignes,
    bilan: fantasy.bilanPrevuReel(lignes),
    calibration: fantasy.calibrationFantasy(lignes),
    sansElo: fantasy.impactSansElo(lignes),
    avantApres: fantasy.equipeAvantApres(lignes),
  };
}

async function vueCircuit(c: Contexte) {
  const ids = c.tournois.map((t) => t.id);
  const matchs = await matchsDesTournois(ids);
  const rows = await joueursParIds(idsDesMatchs(matchs));
  const joueurs = statsJoueurs(rows);
  const outils = await preparerElo(rows);
  return {
    vue: 'circuit' as const,
    nbMatchs: matchs.length,
    surprises: circuit.surprises(matchs, c.tournois, joueurs, outils.eloDe),
    favoris: circuit.sortieDesFavoris(matchs, c.tournois, joueurs, outils.eloDe),
    formatsCategorie: circuit.formatsDeMatchs(matchs, c.tournois, libelleCategorie),
    formatsSurface: circuit.formatsDeMatchs(matchs, c.tournois, libelleSurface),
    formatsCircuit: circuit.formatsDeMatchs(matchs, c.tournois, (t) => t.tour),
    tieBreaks: circuit.tieBreaks(matchs, joueurs),
    abandons: circuit.abandonsEtForfaits(matchs, c.tournois, joueurs),
    surfaces: circuit.profilsDeSurface(matchs, joueurs, outils.surfaces),
    pays: circuit.parPays(matchs, joueurs),
    parcours: circuit.parcoursLesPlusLongs(matchs, c.tournois, joueurs),
    remarquables: circuit.matchsRemarquables(matchs, c.tournois, joueurs),
  };
}

async function vueMarche(c: Contexte, connecte: boolean) {
  const ids = c.tournois.map((t) => t.id);
  const [matchs, cotesLignes] = await Promise.all([matchsDesTournois(ids), cotesHistoriqueDesTournois(ids)]);
  const rows = await joueursParIds(idsDesMatchs(matchs));
  const [courant, ta, maison, journal] = await Promise.all([
    preparerElo(rows),
    preparerElo(rows, 'ta'),
    preparerElo(rows, 'maison'),
    // Le journal d'import est privé : lu seulement avec une session valide.
    connecte ? journalImport() : Promise.resolve(null),
  ]);
  const cotes = indexerCotesParDuel(cotesLignes);
  return {
    vue: 'marche' as const,
    nbMatchs: matchs.length,
    sources: marche.comparerSourcesElo(matchs, c.tournois, ta.eloStrict, maison.eloStrict),
    contreElo: marche.bookmakersContreElo(matchs, c.tournois, cotes, courant.eloDe),
    mouvement: marche.mouvementDesCotes(matchs, c.tournois, cotes),
    nbDuelsCotes: cotes.size,
    sante: journal ? marche.santeDesImports(journal.logs, journal.surveillances, c.tournois) : null,
  };
}

async function vueApp(c: Contexte) {
  const maintenant = new Date();
  const enCours = c.tournois.filter((t) => t.status !== 'completed').slice(0, 4);
  const [compteurs, dates, matchsEnCours] = await Promise.all([
    compterTables(),
    dernieresDates(),
    Promise.all(enCours.map(async (t) => ({ libelle: `Matchs de ${t.name}`, dernier: await dernierMatchMisAJour(t.id) }))),
  ]);
  return {
    vue: 'app' as const,
    compteurs,
    fraicheurs: [...dates, ...matchsEnCours].map((d) => appli.fraicheurDe(d.libelle, d.dernier, maintenant)),
    nbTournoisParStatut: ['upcoming', 'running', 'completed'].map((s) => ({
      statut: s,
      n: c.tournois.filter((t) => t.status === s).length,
    })),
  };
}

export type DonneesVue = Awaited<
  ReturnType<
    | typeof vueDuel
    | typeof vuePicks
    | typeof vueBracket
    | typeof vueFantasy
    | typeof vueCircuit
    | typeof vueMarche
    | typeof vueApp
  >
>;

/**
 * `connecte` : la page a vérifié la session. Il autorise la lecture du journal d'import (privé) ;
 * sans lui, cette partie de la vue « Modèle & marché » reste vide.
 */
export async function chargerStatistiques(
  filtres: Filtres,
  connecte: boolean,
): Promise<{ contexte: Contexte; donnees: DonneesVue }> {
  const { contexte } = await construireContexte(filtres);
  const f = contexte.filtres.vue;
  const donnees =
    f === 'duel' ? await vueDuel(contexte)
    : f === 'picks' ? await vuePicks(contexte)
    : f === 'bracket' ? await vueBracket(contexte)
    : f === 'fantasy' ? await vueFantasy(contexte)
    : f === 'circuit' ? await vueCircuit(contexte)
    : f === 'marche' ? await vueMarche(contexte, connecte)
    : await vueApp(contexte);
  return { contexte, donnees };
}
