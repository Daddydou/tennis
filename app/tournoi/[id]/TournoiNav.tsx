'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Onglet = 'dashboard' | 'tableau' | 'picks' | 'simulateur' | 'fantasy' | 'predictions' | 'resultats';

/**
 * Un onglet par JEU (Picks, Bracket, Fantasy), encadrés par le tableau réel
 * et les outils de lecture. « Bracket » ne désigne que le jeu : l'arbre
 * pronostiqué à l'Elo vit dans Prédictions → Tableau pronostiqué, et l'ancien
 * onglet Plan est devenu l'écran Picks (anciennes URL redirigées).
 */
const ONGLETS: { key: Onglet; label: string; href: (id: string) => string }[] = [
  // Page d'atterrissage du tournoi : synthèse Bracket + Picks, avant le détail.
  { key: 'dashboard', label: 'Dashboard', href: (id) => `/tournoi/${id}` },
  { key: 'tableau', label: 'Tableau', href: (id) => `/tournoi/${id}/tableau` },
  // Picks intègre la saisie des participants (sélecteur Moi / Laki / Thomas).
  { key: 'picks', label: 'Picks', href: (id) => `/tournoi/${id}/picks` },
  // Le jeu Bracket (route historique /simulateur, qui garde aussi le
  // simulateur de picks).
  { key: 'simulateur', label: 'Bracket', href: (id) => `/tournoi/${id}/simulateur` },
  { key: 'fantasy', label: 'Fantasy', href: (id) => `/tournoi/${id}/fantasy` },
  { key: 'predictions', label: 'Prédictions', href: (id) => `/tournoi/${id}/predictions` },
  { key: 'resultats', label: 'Résultats', href: (id) => `/tournoi/${id}/resultats` },
];

/** Segment d'URL -> onglet actif (les anciennes routes pointent vers leur nouvel onglet). */
const PAR_SEGMENT: Record<string, Onglet> = {
  tableau: 'tableau',
  picks: 'picks',
  plan: 'picks',
  simulateur: 'simulateur',
  fantasy: 'fantasy',
  predictions: 'predictions',
  bracket: 'predictions',
  resultats: 'resultats',
};

/**
 * Titre et onglets du tournoi, rendus UNE fois par le layout du tournoi :
 * ils restent affichés pendant qu'un onglet se charge (seul le contenu passe
 * au squelette de ./loading.tsx). L'onglet actif se déduit de l'URL.
 */
export default function TournoiNav({ id, nom }: { id: string; nom: string }) {
  const segment = usePathname().split('/')[3] ?? '';
  const active: Onglet = PAR_SEGMENT[segment] ?? 'dashboard';
  return (
    <div className="space-y-2">
      <h1 className="text-lg font-semibold">{nom}</h1>
      {/* Sept onglets ne tiennent pas dans la largeur d'un téléphone : la barre
          défile horizontalement plutôt que de passer à la ligne, ce qui garde
          l'onglet actif et ses voisins à portée de pouce. */}
      <nav aria-label="Onglets du tournoi" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-zinc-200 text-sm">
        {ONGLETS.map((o) => (
          <Link
            key={o.key}
            href={o.href(id)}
            aria-current={o.key === active ? 'page' : undefined}
            className={`-mb-px flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 transition active:scale-[0.97] ${
              o.key === active
                ? 'border-blue-600 font-semibold text-blue-600'
                : 'border-transparent text-zinc-600 hover:text-zinc-900'
            }`}
          >
            {o.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
