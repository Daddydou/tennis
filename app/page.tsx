import Link from 'next/link';
import { listTournaments } from '@/supabase/queries';
import { LIBELLE_CATEGORIE_COURT } from '@/lib/calendrier';

export const dynamic = 'force-dynamic';

const SURFACE_LABEL: Record<string, string> = {
  hard: 'Dur',
  clay: 'Terre',
  grass: 'Gazon',
  carpet: 'Moquette',
};

/** Ocre pour la terre, bleu pour le dur, vert pour le gazon. */
const SURFACE_BADGE: Record<string, string> = {
  clay: 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  hard: 'border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
  grass:
    'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  carpet:
    'border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200',
};

const STATUT_LABEL: Record<string, string> = {
  upcoming: 'À venir',
  running: 'En cours',
  completed: 'Terminé',
};

function BadgeSurface({ surface }: { surface: string | null }) {
  if (!surface) return <span className="text-zinc-400">—</span>;
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${
        SURFACE_BADGE[surface] ??
        'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
      }`}
    >
      {SURFACE_LABEL[surface] ?? surface}
    </span>
  );
}

/** 'YYYY-MM-DD' → '3 mars 2026'. Pas de Date() : évite tout décalage de fuseau. */
const MOIS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, j] = iso.slice(0, 10).split('-');
  const mois = MOIS[Number(m) - 1];
  return mois ? `${Number(j)} ${mois} ${a}` : iso;
}

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
              <th className="py-2 pr-3 font-medium">Début</th>
              <th className="py-2 pr-3 font-medium">Tournoi</th>
              <th className="py-2 pr-3 font-medium">Circuit</th>
              <th className="py-2 pr-3 font-medium">Catégorie</th>
              <th className="py-2 pr-3 font-medium">Surface</th>
              <th className="py-2 pr-3 font-medium">Format</th>
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
                <td className="py-2 pr-3 whitespace-nowrap text-zinc-500 tabular-nums">
                  {formatDate(t.start_date)}
                </td>
                <td className="py-2 pr-3">
                  <Link
                    href={`/tournoi/${t.id}`}
                    className="font-medium hover:underline"
                  >
                    {t.name}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-zinc-500">{t.tour}</td>
                <td className="py-2 pr-3 whitespace-nowrap text-zinc-500">
                  {t.category
                    ? LIBELLE_CATEGORIE_COURT[t.category] ?? t.category
                    : '—'}
                </td>
                <td className="py-2 pr-3">
                  <BadgeSurface surface={t.surface} />
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-zinc-500">
                  {t.best_of ? `${t.best_of} sets` : '—'}
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
