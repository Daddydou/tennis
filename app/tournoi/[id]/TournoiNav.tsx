import Link from 'next/link';

type Onglet = 'tableau' | 'picks' | 'fantasy' | 'predictions' | 'resultats';

const ONGLETS: { key: Onglet; label: string; href: (id: string) => string }[] = [
  { key: 'tableau', label: 'Tableau', href: (id) => `/tournoi/${id}` },
  { key: 'picks', label: 'Picks', href: (id) => `/tournoi/${id}/picks` },
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
      <nav className="flex gap-1 border-b border-zinc-200 text-sm dark:border-zinc-800">
        {ONGLETS.map((o) => (
          <Link
            key={o.key}
            href={o.href(id)}
            className={`-mb-px border-b-2 px-3 py-1.5 ${
              o.key === active
                ? 'border-zinc-900 font-medium text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
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
