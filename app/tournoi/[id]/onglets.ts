/**
 * Plan des onglets d'un tournoi (module pur : ni React ni Next).
 *
 * Cinq onglets, un par JEU ou par lecture : Dashboard, Tableau, Picks, Bracket,
 * Fantasy. « Bracket » ne désigne que le jeu. Résultats est une vue de Tableau
 * (le tableau réel, puis les points marqués) et Prédictions une vue de Bracket
 * (les chances de chacun, puis l'arbre pronostiqué à l'Elo). Les URLs de
 * chaque écran sont inchangées : seul leur regroupement change.
 */
export type Onglet = 'dashboard' | 'tableau' | 'picks' | 'bracket' | 'fantasy' | 'pronostic';

export type Vue = { segment: string; label: string };

export type DefOnglet = {
  key: Onglet;
  label: string;
  href: (id: string) => string;
  /** Écrans regroupés dans l'onglet (vide = écran unique, pas de sous-barre). */
  vues: Vue[];
};

export const ONGLETS: DefOnglet[] = [
  // Page d'atterrissage du tournoi : synthèse Bracket + Picks, avant le détail.
  { key: 'dashboard', label: 'Dashboard', href: (id) => `/tournoi/${id}`, vues: [] },
  {
    key: 'tableau',
    label: 'Tableau',
    href: (id) => `/tournoi/${id}/tableau`,
    vues: [
      { segment: 'tableau', label: 'Tableau' },
      { segment: 'resultats', label: 'Résultats' },
    ],
  },
  // Picks intègre la saisie des participants (sélecteur Moi / Laki / Thomas).
  { key: 'picks', label: 'Picks', href: (id) => `/tournoi/${id}/picks`, vues: [] },
  {
    key: 'bracket',
    label: 'Bracket',
    // Le jeu Bracket garde sa route historique /simulateur (qui porte aussi le
    // simulateur de picks).
    href: (id) => `/tournoi/${id}/simulateur`,
    vues: [
      { segment: 'simulateur', label: 'Le jeu' },
      { segment: 'predictions', label: 'Prédictions' },
    ],
  },
  { key: 'fantasy', label: 'Fantasy', href: (id) => `/tournoi/${id}/fantasy`, vues: [] },
];

/**
 * Onglets d'un tournoi au format Masters (poules + phase finale, pas de tableau à élimination directe) :
 * Dashboard, Tableau (poules, demies, finale), Picks et Pronostic. Pas de sous-vues, ni de Bracket ni de Fantasy.
 */
export const ONGLETS_MASTERS: DefOnglet[] = [
  { key: 'dashboard', label: 'Dashboard', href: (id) => `/tournoi/${id}`, vues: [] },
  { key: 'tableau', label: 'Tableau', href: (id) => `/tournoi/${id}/tableau`, vues: [] },
  { key: 'picks', label: 'Picks', href: (id) => `/tournoi/${id}/picks`, vues: [] },
  { key: 'pronostic', label: 'Pronostic', href: (id) => `/tournoi/${id}/pronostic`, vues: [] },
];

/** Segment d'URL (le 3e : /tournoi/<id>/<segment>) -> onglet actif. */
const PAR_SEGMENT: Record<string, Onglet> = {
  tableau: 'tableau',
  resultats: 'tableau',
  picks: 'picks',
  simulateur: 'bracket',
  predictions: 'bracket',
  fantasy: 'fantasy',
  pronostic: 'pronostic',
};

export function ongletDe(segment: string): Onglet {
  return PAR_SEGMENT[segment] ?? 'dashboard';
}

/** Vue active d'un onglet à plusieurs vues = le segment lui-même. */
export function vueDe(segment: string): string {
  return segment;
}
