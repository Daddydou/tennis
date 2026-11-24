/**
 * VUES DE LA COUPE DAVIS : le bracket de chacun (onglet Bracket) et les pronos des matchs (onglet Tableau),
 * rencontre par rencontre, avec le verdict (juste / raté / en attente) et les points. Module PUR : il ne fait
 * que rapprocher les pronos lus sur Game Tracker (tn_davis_pronos) des résultats saisis (tn_matches), avec le
 * barème de lib/davis.ts (jamais réimplémenté ici).
 */
import {
  LIBELLE_MATCH,
  LIBELLE_TOUR_DAVIS,
  MULTIPLICATEUR_TOUR,
  ORDRES_MATCH,
  POINTS_BRACKET,
  TOURS_DAVIS,
  doublePossible,
  matchJoue,
  memeNation,
  nationGagnante,
  pointsBracketRencontre,
  pointsPronosRencontre,
  resultatRencontre,
  scoreEnSets,
  type OrdreMatch,
  type PronoMatch,
  type RencontreDavis,
  type ScoreSets,
  type TourDavis,
} from './davis';
import { rencontresDavis, type LigneProno, type LigneRencontreBase } from './davisPronos';
import type { PickEntree } from './tableauVue';

export interface StockDavis {
  id: string | null;
  nom: string;
}

/** Clé d'un participant dans les tables de la vue ('moi' pour participant_id null), comme lib/tableauVue. */
export const cleStockDavis = (id: string | null): string => id ?? 'moi';

export type Verdict = 'juste' | 'rate' | 'attente';

/* ------------------------------------------------------------------ */
/*  Bracket                                                            */
/* ------------------------------------------------------------------ */

export interface LigneBracketVue {
  cle: string;
  nom: string;
  /** Rien de pronostiqué par ce participant sur cette rencontre. */
  vide: boolean;
  nation: string | null;
  sets: ScoreSets | null;
  verdictNation: Verdict;
  verdictScore: Verdict;
  /** Points déjà gagnés (null tant que la rencontre n'est pas décidée). */
  points: number | null;
}

export interface RencontreBracketVue {
  id: string;
  position: number;
  nation1: string | null;
  nation2: string | null;
  vainqueur: string | null;
  score: ScoreSets | null;
  lignes: LigneBracketVue[];
}

export interface TourBracketVue {
  tour: TourDavis;
  libelle: string;
  rencontres: RencontreBracketVue[];
}

export interface TotauxBracket {
  /** Points déjà gagnés. */
  points: number;
  /** Points encore possibles (rencontres pas décidées dont la nation pronostiquée est encore en lice). */
  reste: number;
  /** Rencontres pronostiquées. */
  nb: number;
}

export interface BracketDavisVue {
  tours: TourBracketVue[];
  totaux: Record<string, TotauxBracket>;
}

const parTourPuisPosition = (a: RencontreDavis, b: RencontreDavis) =>
  TOURS_DAVIS.indexOf(a.tour) - TOURS_DAVIS.indexOf(b.tour) || a.position - b.position;

/** Nations battues dans une rencontre déjà décidée : elles ne peuvent plus rien gagner. */
function nationsEliminees(rencontres: RencontreDavis[]): Set<string> {
  const out = new Set<string>();
  for (const r of rencontres) {
    const g = nationGagnante(r);
    if (!g) continue;
    const perdant = memeNation(g, r.nation1) ? r.nation2 : r.nation1;
    if (perdant) out.add(perdant);
  }
  return out;
}

export function vueBracketDavis(rows: LigneRencontreBase[], lignes: LigneProno[], stocks: StockDavis[]): BracketDavisVue {
  const rencontres = rencontresDavis(rows).sort(parTourPuisPosition);
  const eliminees = nationsEliminees(rencontres);
  const totaux: Record<string, TotauxBracket> = Object.fromEntries(stocks.map((s) => [cleStockDavis(s.id), { points: 0, reste: 0, nb: 0 }]));

  const tours: TourBracketVue[] = TOURS_DAVIS.map((tour) => ({
    tour,
    libelle: LIBELLE_TOUR_DAVIS[tour],
    rencontres: rencontres
      .filter((r) => r.tour === tour)
      .map((r) => {
        const res = resultatRencontre(r);
        const vainqueur = nationGagnante(r);
        const decidee = vainqueur !== null;
        const lignesVue = stocks.map((s): LigneBracketVue => {
          const cle = cleStockDavis(s.id);
          const l = lignes.find((x) => x.jeu === 'bracket' && x.participantId === s.id && x.round === tour && x.matchPosition === r.position - 1);
          if (!l) return { cle, nom: s.nom, vide: true, nation: null, sets: null, verdictNation: 'attente', verdictScore: 'attente', points: null };
          const t = totaux[cle];
          t.nb += 1;
          const nationOk = decidee && memeNation(l.nation, vainqueur);
          const horsJeu = !decidee && eliminees.has(l.nation);
          const verdictNation: Verdict = decidee ? (nationOk ? 'juste' : 'rate') : horsJeu ? 'rate' : 'attente';
          const verdictScore: Verdict = decidee ? (nationOk && l.sets === res.score ? 'juste' : 'rate') : horsJeu ? 'rate' : 'attente';
          const p = pointsBracketRencontre({ tour, position: r.position, nation: l.nation, score: l.sets }, r);
          if (p) t.points += p.total;
          else if (!horsJeu) t.reste += POINTS_BRACKET[tour].nation + POINTS_BRACKET[tour].score;
          return { cle, nom: s.nom, vide: false, nation: l.nation, sets: l.sets, verdictNation, verdictScore, points: p ? p.total : null };
        });
        return { id: r.id, position: r.position, nation1: r.nation1, nation2: r.nation2, vainqueur, score: res.score, lignes: lignesVue };
      }),
  })).filter((t) => t.rencontres.length > 0);

  return { tours, totaux };
}

/* ------------------------------------------------------------------ */
/*  Pronos des matchs                                                  */
/* ------------------------------------------------------------------ */

/**
 * complet = nation et score justes ; nation = nation juste, score raté ; rate ; attente = match pas encore joué ;
 * sans = double qui ne se joue pas (rencontre pliée à 2-0) ; vide = rien de pronostiqué.
 */
export type VerdictMatch = 'complet' | 'nation' | 'rate' | 'attente' | 'sans' | 'vide';

export interface LigneProno1Vue {
  cle: string;
  nom: string;
  nation: string | null;
  sets: ScoreSets | null;
  verdict: VerdictMatch;
}

export interface MatchPronoVue {
  ordre: OrdreMatch;
  libelle: string;
  joue: boolean;
  /** Nation vainqueur du match et score en sets (null sur forfait / abandon / pas joué). */
  vainqueur: string | null;
  score: ScoreSets | null;
  lignes: LigneProno1Vue[];
}

export interface RencontrePronosVue {
  id: string;
  tour: TourDavis;
  position: number;
  libelle: string;
  nation1: string;
  nation2: string;
  decidee: boolean;
  matchs: MatchPronoVue[];
  /** Points des pronos de chacun sur cette rencontre (multiplicateur du tour compris), clé = cleStockDavis. */
  points: Record<string, number>;
  /** Carton plein de chacun (+2 avant multiplicateur). */
  carton: Record<string, boolean>;
}

export function vuePronosDavis(rows: LigneRencontreBase[], lignes: LigneProno[], stocks: StockDavis[]): RencontrePronosVue[] {
  const out: RencontrePronosVue[] = [];
  for (const r of rencontresDavis(rows).sort(parTourPuisPosition)) {
    if (!r.nation1 || !r.nation2) continue;
    const pos0 = r.position - 1;
    const siennes = lignes.filter((l) => l.jeu === 'match' && l.round === r.tour && l.matchPosition === pos0);
    if (siennes.length === 0) continue;
    const decidee = nationGagnante(r) !== null;
    const matchs: MatchPronoVue[] = ORDRES_MATCH.map((ordre) => {
      const m = r.matchs.find((x) => x.ordre === ordre);
      const joue = !!m && matchJoue(m);
      const reelle = joue && m ? (m.gagnant === 1 ? r.nation1 : r.nation2) : null;
      const score = joue && m ? scoreEnSets(m) : null;
      const sansObjet = ordre === 3 && !joue && decidee && !doublePossible(r);
      return {
        ordre,
        libelle: LIBELLE_MATCH[ordre],
        joue,
        vainqueur: reelle,
        score,
        lignes: stocks.map((s): LigneProno1Vue => {
          const l = siennes.find((x) => x.participantId === s.id && x.ordre === ordre);
          const cle = cleStockDavis(s.id);
          if (!l) return { cle, nom: s.nom, nation: null, sets: null, verdict: sansObjet ? 'sans' : 'vide' };
          let verdict: VerdictMatch = 'attente';
          if (sansObjet) verdict = 'sans';
          else if (joue && m) {
            const nationOk = memeNation(l.nation, reelle);
            verdict = !nationOk ? 'rate' : m.statut !== 'termine' || l.sets === score ? 'complet' : 'nation';
          }
          return { cle, nom: s.nom, nation: l.nation, sets: l.sets, verdict };
        }),
      };
    });
    const points: Record<string, number> = {};
    const carton: Record<string, boolean> = {};
    for (const s of stocks) {
      const pronos: PronoMatch[] = siennes
        .filter((l) => l.participantId === s.id && l.ordre !== null)
        .map((l) => ({ rencontreId: r.id, ordre: l.ordre as OrdreMatch, nation: l.nation, sets: l.sets }));
      const p = pointsPronosRencontre(pronos, r);
      points[cleStockDavis(s.id)] = p.total;
      carton[cleStockDavis(s.id)] = p.carton;
    }
    out.push({
      id: r.id,
      tour: r.tour,
      position: r.position,
      libelle: r.tour === 'F' ? 'Finale' : `${r.tour === 'SF' ? 'Demi-finale' : 'Quart de finale'} ${r.position}`,
      nation1: r.nation1,
      nation2: r.nation2,
      decidee,
      matchs,
      points,
      carton,
    });
  }
  return out;
}

/** Multiplicateur du tour, pour l'affichage (« ×2 »). */
export const multiplicateurTour = (t: TourDavis): number => MULTIPLICATEUR_TOUR[t];

/* ------------------------------------------------------------------ */
/*  Pastilles du Tableau                                               */
/* ------------------------------------------------------------------ */

/**
 * Bracket de chaque participant pour le Tableau (pastilles sur la nation pronostiquée) : les pronos lus sur
 * Game Tracker (nation + score) remplacent, pour un participant, ceux du pont de Thomas (nations seules) ;
 * les autres participants gardent leurs picks existants.
 */
export function picksTableauDavis(existants: PickEntree[], lignes: LigneProno[]): PickEntree[] {
  const bracket = lignes.filter((l) => l.jeu === 'bracket');
  const importes = new Set(bracket.map((l) => l.participantId));
  return [
    ...existants.filter((p) => !importes.has(p.participant_id)),
    ...bracket.map((l) => ({ participant_id: l.participantId, round: l.round, position: l.matchPosition, player_id: `davis-${l.nation}` })),
  ];
}