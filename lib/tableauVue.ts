/**
 * Vue du Tableau (onglet « Tableau » d'un tournoi) : matchs réels + pronostics
 * de bracket de chaque participant, prêts à afficher.
 *
 * Module PUR (ni Next ni Supabase) : les entrées sont des structures simples,
 * le composant d'affichage ne fait plus que dessiner. Les pronostics viennent
 * de tn_bracket_round_picks (participant_id null = moi), un par match
 * (round + position) : le vainqueur pronostiqué de CE match.
 */
import { STATUTS_DECIDES, type MatchStatus } from './types';

export interface SetEntree {
  g1: number | null;
  g2: number | null;
  tb1?: number | null;
  tb2?: number | null;
}

export interface MatchEntree {
  id: string;
  round: string;
  position: number | null;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  status: MatchStatus;
  sets: SetEntree[] | null;
}

export interface PickEntree {
  participant_id: string | null;
  round: string;
  position: number;
  player_id: string;
}

/** Pick du JEU de picks (tn_picks) : un joueur par moitié et par tour, jugé sur le match de ce tour où il joue. */
export interface PickJeuEntree {
  participant_id: string | null;
  round: string;
  player_id: string;
}

export interface StockEntree {
  id: string | null;
  nom: string;
}

/** Clé d'un participant dans les tables de la vue ('moi' pour participant_id null). */
export function cleStock(id: string | null): string {
  return id ?? 'moi';
}

/** juste / raté = match décidé ; attente = match pas encore décidé. */
export type Verdict = 'juste' | 'rate' | 'attente';

export interface CelluleSet {
  /** Jeux du joueur dans ce set ('' si inconnu). */
  jeux: string;
  /** Points du tie-break du joueur, seulement s'il a PERDU le set au tie-break. */
  tb: string | null;
}

export interface LigneVue {
  nom: string;
  gagnant: boolean;
  /** Match décidé et ce joueur n'en est pas le vainqueur. */
  perdant: boolean;
  bye: boolean;
  sets: CelluleSet[];
}

export interface PickVue {
  joueurNom: string;
  verdict: Verdict;
}

/** Pick du jeu d'un participant sur CE match (le joueur qu'il a pické y joue). */
export interface PickJeuVue {
  /** Clé du participant (cleStock). */
  cle: string;
  participantNom: string;
  joueurNom: string;
  verdict: Verdict;
}

export interface MatchVue {
  id: string;
  position: number;
  statut: MatchStatus;
  lignes: [LigneVue, LigneVue];
  vainqueurNom: string | null;
  /** Pronostic de chaque participant (clé = cleStock), null = rien de posé sur ce match. */
  picks: Record<string, PickVue | null>;
  /** Picks du jeu (tous participants) dont le joueur joue ce match, dans l'ordre des participants. */
  picksJeu: PickJeuVue[];
}

export interface BilanTour {
  /** Pronostics posés sur ce tour. */
  poses: number;
  /** Parmi eux, ceux dont le match est décidé. */
  decides: number;
  /** Parmi les décidés, les justes. */
  justes: number;
}

export interface TourVue {
  round: string;
  libelle: string;
  matchs: MatchVue[];
  bilans: Record<string, BilanTour>;
}

const LIBELLES: Record<string, string> = {
  R128: '1er tour',
  R64: '2e tour',
  R32: '3e tour',
  R16: 'Huitièmes',
  QF: 'Quarts',
  SF: 'Demi-finales',
  F: 'Finale',
};

/** Nom lisible d'un tour ; un code inconnu reste tel quel. */
export function libelleTour(round: string): string {
  return LIBELLES[round] ?? round;
}

/**
 * Sets vus du côté d'un joueur. Le tie-break d'un côté n'est montré que si ce
 * côté a perdu le set (convention du tennis : 7-6⁽³⁾ affiche les 3 points du
 * perdant, en exposant sur son score).
 */
export function cellulesSets(sets: SetEntree[] | null, cote: 1 | 2): CelluleSet[] {
  return (sets ?? []).map((s) => {
    const g = cote === 1 ? s.g1 : s.g2;
    const gAdv = cote === 1 ? s.g2 : s.g1;
    const tbPropre = cote === 1 ? s.tb1 : s.tb2;
    if (g === null) return { jeux: '', tb: null };
    const aPerdu = gAdv !== null && g < gAdv;
    return {
      jeux: `${g}`,
      tb: aPerdu && tbPropre !== null && tbPropre !== undefined ? `${tbPropre}` : null,
    };
  });
}

/** Un match est décidé quand son statut l'est ET qu'un vainqueur est connu. */
function estDecide(m: MatchEntree): boolean {
  return STATUTS_DECIDES.includes(m.status) && m.winner_id !== null;
}

export function construireTableau(args: {
  rounds: string[];
  matchs: MatchEntree[];
  picks: PickEntree[];
  /** Picks du jeu (tn_picks), tous participants : affichés sur le match où le joueur pické joue. */
  picksJeu?: PickJeuEntree[];
  stocks: StockEntree[];
  /** Nom d'un joueur par son id. */
  nomJoueur: (id: string) => string;
}): TourVue[] {
  const { rounds, matchs, picks, stocks, nomJoueur } = args;
  const picksJeu = args.picksJeu ?? [];

  const pickParStock = new Map<string, Map<string, string>>();
  for (const p of picks) {
    const cle = cleStock(p.participant_id);
    const carte = pickParStock.get(cle) ?? new Map<string, string>();
    carte.set(`${p.round}|${p.position}`, p.player_id);
    pickParStock.set(cle, carte);
  }

  const nom = (id: string | null): string => (id === null ? 'BYE' : nomJoueur(id));
  const tours: TourVue[] = [];

  for (const round of rounds) {
    const duTour = matchs
      .filter((m) => m.round === round)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    if (duTour.length === 0) continue;

    const bilans: Record<string, BilanTour> = {};
    for (const s of stocks) bilans[cleStock(s.id)] = { poses: 0, decides: 0, justes: 0 };

    const matchsVue: MatchVue[] = duTour.map((m, i) => {
      const position = m.position ?? i;
      const decide = estDecide(m);
      const ligne = (id: string | null, cote: 1 | 2): LigneVue => ({
        nom: nom(id),
        gagnant: decide && id !== null && id === m.winner_id,
        perdant: decide && id !== m.winner_id,
        bye: id === null,
        sets: cellulesSets(m.sets, cote),
      });

      const picksVue: Record<string, PickVue | null> = {};
      for (const s of stocks) {
        const cle = cleStock(s.id);
        const joueurId = pickParStock.get(cle)?.get(`${round}|${position}`) ?? null;
        if (joueurId === null) {
          picksVue[cle] = null;
          continue;
        }
        const verdict: Verdict = !decide ? 'attente' : joueurId === m.winner_id ? 'juste' : 'rate';
        picksVue[cle] = { joueurNom: nomJoueur(joueurId), verdict };
        const b = bilans[cle];
        b.poses += 1;
        if (decide) b.decides += 1;
        if (verdict === 'juste') b.justes += 1;
      }

      const picksJeuVue: PickJeuVue[] = [];
      for (const s of stocks) {
        const cle = cleStock(s.id);
        const pj = picksJeu.find(
          (p) =>
            cleStock(p.participant_id) === cle &&
            p.round === round &&
            (p.player_id === m.player1_id || p.player_id === m.player2_id),
        );
        if (!pj) continue;
        const verdict: Verdict = !decide ? 'attente' : pj.player_id === m.winner_id ? 'juste' : 'rate';
        picksJeuVue.push({ cle, participantNom: s.nom, joueurNom: nomJoueur(pj.player_id), verdict });
      }

      return {
        id: m.id,
        position,
        statut: m.status,
        lignes: [ligne(m.player1_id, 1), ligne(m.player2_id, 2)],
        vainqueurNom: decide && m.winner_id ? nomJoueur(m.winner_id) : null,
        picks: picksVue,
        picksJeu: picksJeuVue,
      };
    });

    tours.push({ round, libelle: libelleTour(round), matchs: matchsVue, bilans });
  }

  return tours;
}

/**
 * Le tableau peut se dessiner en arbre aligné (cartes centrées entre leurs
 * deux sources, traits de liaison) seulement s'il est régulier (chaque tour a
 * moitié moins de matchs que le précédent) et pas trop haut.
 */
export const MAX_MATCHS_ARBRE = 16;

export function arbreRegulier(tours: TourVue[]): boolean {
  if (tours.length === 0) return false;
  const n = tours[0].matchs.length;
  if (n > MAX_MATCHS_ARBRE) return false;
  return tours.every((t, i) => t.matchs.length * 2 ** i === n);
}
