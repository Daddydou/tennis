import Link from 'next/link';

type Onglet =
  | 'dashboard'
  | 'tableau'
  | 'bracket'
  | 'picks'
  | 'simulateur'
  | 'fantasy'
  | 'predictions'
  | 'resultats';

const ONGLETS: { key: Onglet; label: string; href: (id: string) => string }[] = [
  // Page d'atterrissage du tournoi : synthèse Bracket + Picks, avant le détail.
  { key: 'dashboard', label: 'Dashboard', href: (id) => `/tournoi/${id}` },
  { key: 'tableau', label: 'Tableau', href: (id) => `/tournoi/${id}/tableau` },
  // Juste après le tableau réel : c'est le même arbre, mais pronostiqué.
  { key: 'bracket', label: 'Bracket', href: (id) => `/tournoi/${id}/bracket` },
  // Picks intègre aussi la saisie/consultation des participants (sélecteur
  // Moi / Laki / Thomas en haut de l'écran) — plus d'onglet dédié ici.
  { key: 'picks', label: 'Picks', href: (id) => `/tournoi/${id}/picks` },
  {
    key: 'simulateur',
    label: 'Simulateur',
    href: (id) => `/tournoi/${id}/simulateur`,
  },
  { key: 'fantasy', label: 'Fantasy', href: (id) => `/tournoi/${id}/fantasy` },
  {
    key: 'predictions',
    label: 'Prédictions',
    href: (id) => `/tournoi/${id}/predictions`,
  },
  { key: 'resultats', label: 'Résultats', href: (id) => `/tournoi/${id}/resultats` },
];

export default function TournoiNav({
  id,
  nom,
  active,
}: {
  id: string;
  nom: string;
  active: Onglet;
}) {
  return (
    <div className="space-y-2">
      <h1 className="text-lg font-semibold">{nom}</h1>
      {/* Six onglets ne tiennent pas dans la largeur d'un téléphone : la barre
          défile horizontalement plutôt que de passer à la ligne, ce qui garde
          l'onglet actif et ses voisins à portée de pouce. */}
      <nav className="flex gap-1 overflow-x-auto border-b border-zinc-200 text-sm dark:border-zinc-800">
        {ONGLETS.map((o) => (
          <Link
            key={o.key}
            href={o.href(id)}
            className={`-mb-px flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 transition active:scale-[0.97] ${
              o.key === active
                ? 'border-lime-500 font-semibold text-lime-700 dark:border-lime-400 dark:text-lime-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            {o.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
