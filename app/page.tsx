import Link from 'next/link';
import { listTournaments } from '@/supabase/queries';

export const dynamic = 'force-dynamic';

const SURFACE_LABEL: Record<string, string> = {
  hard: 'Dur',
  clay: 'Terre',
  grass: 'Gazon',
  carpet: 'Moquette',
};

const STATUT_LABEL: Record<string, string> = {
  upcoming: 'À venir',
  running: 'En cours',
  completed: 'Terminé',
};

export default async function Home() {
  const tournois = await listTournaments();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Tournois</h1>
        <Link
          href="/import"
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Importer un tableau
        </Link>
      </div>

      {tournois.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Aucun tournoi. Commence par{' '}
          <Link href="/import" className="underline">
            importer un tableau
          </Link>
          .
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
              <th className="py-2 pr-3 font-medium">Tournoi</th>
              <th className="py-2 pr-3 font-medium">Circuit</th>
              <th className="py-2 pr-3 font-medium">Surface</th>
              <th className="py-2 pr-3 font-medium">Statut</th>
              <th className="py-2 pr-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tournois.map((t) => (
              <tr
                key={t.id}
                className="border-b border-zinc-100 dark:border-zinc-900"
              >
                <td className="py-2 pr-3">
                  <Link
                    href={`/tournoi/${t.id}`}
                    className="font-medium hover:underline"
                  >
                    {t.name}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-zinc-500">{t.tour}</td>
                <td className="py-2 pr-3 text-zinc-500">
                  {t.surface ? SURFACE_LABEL[t.surface] ?? t.surface : '—'}
                </td>
                <td className="py-2 pr-3 text-zinc-500">
                  {STATUT_LABEL[t.status] ?? t.status}
                </td>
                <td className="py-2 pr-3">
                  <div className="flex gap-3 text-xs">
                    <Link href={`/tournoi/${t.id}`} className="text-zinc-600 hover:underline dark:text-zinc-400">
                      Tableau
                    </Link>
                    <Link href={`/tournoi/${t.id}/picks`} className="text-zinc-600 hover:underline dark:text-zinc-400">
                      Picks
                    </Link>
                    <Link href={`/tournoi/${t.id}/resultats`} className="text-zinc-600 hover:underline dark:text-zinc-400">
                      Résultats
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
