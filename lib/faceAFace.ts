/**
 * FACE-À-FACE — bilan des rencontres entre deux joueurs.
 *
 * Module PUR : il ne connaît que les matchs qu'on lui passe, c'est-à-dire
 * ceux des tournois IMPORTÉS dans l'app (tn_matches). Ce n'est pas le
 * face-à-face de carrière : un affrontement joué dans un tournoi jamais
 * importé n'existe pas ici. L'écran le dit, ce module ne l'invente pas.
 *
 * Tout est exprimé du point de vue du joueur A : `vainqueur` vaut 'A' ou 'B',
 * et le score se lit « jeux de A – jeux de B ».
 */

import { STATUTS_DECIDES } from './types';
import type { MatchStatus, Surface } from './types';

/** Un match tel qu'il sort de la base, orienté joueur1/joueur2. */
export interface RencontreBrute {
  tournoi: string;
  date: string | null;
  surface: Surface | null;
  round: string;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  sets: { g1: number | null; g2: number | null; tb1?: number | null; tb2?: number | null }[] | null;
  status: MatchStatus;
}

/** Une rencontre, du point de vue de A. */
export interface Rencontre {
  tournoi: string;
  date: string | null;
  surface: Surface | null;
  round: string;
  /** null : match pas encore décidé. */
  vainqueur: 'A' | 'B' | null;
  /** « 6-4 3-6 7-6(5) », jeux de A d'abord. Vide sans score saisi. */
  score: string;
  status: MatchStatus;
}

export interface BilanFaceAFace {
  /** Du plus récent au plus ancien ; sans date, en dernier. */
  rencontres: Rencontre[];
  victoiresA: number;
  victoiresB: number;
  /** Victoires par surface, seulement pour les surfaces où ils se sont joués. */
  parSurface: Partial<Record<Surface | 'inconnue', { a: number; b: number }>>;
}

/**
 * Score du point de vue de A. Au tie-break, on note les points du perdant du
 * jeu décisif, comme sur les feuilles de match : 7-6(5).
 */
export function scoreDepuisA(
  sets: RencontreBrute['sets'],
  aEstJoueur1: boolean,
): string {
  return (sets ?? [])
    .filter((s) => s.g1 !== null || s.g2 !== null)
    .map((s) => {
      const ga = aEstJoueur1 ? s.g1 : s.g2;
      const gb = aEstJoueur1 ? s.g2 : s.g1;
      const tba = aEstJoueur1 ? s.tb1 : s.tb2;
      const tbb = aEstJoueur1 ? s.tb2 : s.tb1;
      const tb =
        tba != null && tbb != null ? `(${Math.min(tba, tbb)})` : '';
      return `${ga ?? '?'}-${gb ?? '?'}${tb}`;
    })
    .join(' ');
}

/**
 * Bilan des rencontres entre A et B. Les matchs qui n'opposent pas
 * exactement ces deux joueurs sont ignorés, ainsi que les byes (un bye n'est
 * pas une rencontre). Un match décidé sans vainqueur connu ne compte ni pour
 * l'un ni pour l'autre.
 */
export function bilanFaceAFace(
  idA: string,
  idB: string,
  brutes: RencontreBrute[],
): BilanFaceAFace {
  const rencontres: Rencontre[] = [];
  let victoiresA = 0;
  let victoiresB = 0;
  const parSurface: BilanFaceAFace['parSurface'] = {};

  for (const m of brutes) {
    if (m.status === 'bye') continue;
    const aEstJoueur1 = m.player1Id === idA && m.player2Id === idB;
    const aEstJoueur2 = m.player1Id === idB && m.player2Id === idA;
    if (!aEstJoueur1 && !aEstJoueur2) continue;

    const decide = STATUTS_DECIDES.includes(m.status);
    const vainqueur: Rencontre['vainqueur'] = !decide
      ? null
      : m.winnerId === idA
        ? 'A'
        : m.winnerId === idB
          ? 'B'
          : null;

    if (vainqueur) {
      if (vainqueur === 'A') victoiresA++;
      else victoiresB++;
      const cle = m.surface ?? 'inconnue';
      const s = (parSurface[cle] ??= { a: 0, b: 0 });
      if (vainqueur === 'A') s.a++;
      else s.b++;
    }

    rencontres.push({
      tournoi: m.tournoi,
      date: m.date,
      surface: m.surface,
      round: m.round,
      vainqueur,
      score: scoreDepuisA(m.sets, aEstJoueur1),
      status: m.status,
    });
  }

  rencontres.sort((x, y) => {
    if (x.date === y.date) return 0;
    if (x.date === null) return 1;
    if (y.date === null) return -1;
    return y.date.localeCompare(x.date);
  });

  return { rencontres, victoiresA, victoiresB, parSurface };
}
