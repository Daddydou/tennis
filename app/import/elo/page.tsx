import Link from 'next/link';
import ImportEloForm from './ImportEloForm';
import SnippetElo from './SnippetElo';
import EloRefreshButton from '@/app/EloRefreshButton';
import { URLS_RAPPORTS } from '@/lib/tennisabstract';

export const dynamic = 'force-dynamic';

export default function ImportEloPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Importer les Elo Tennis Abstract</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Tennis Abstract répond <strong>403</strong> aux requêtes venant des IP
          de datacenter : depuis Vercel, le serveur ne peut plus lire les
          rapports. La page, elle, s&apos;ouvre normalement dans un navigateur —
          on passe donc par le presse-papier, comme pour les tableaux.
        </p>
      </div>

      <ol className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        <li>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">1.</span>{' '}
          Ouvrir le rapport :{' '}
          <a
            href={URLS_RAPPORTS.atp}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Elo ATP
          </a>{' '}
          ·{' '}
          <a
            href={URLS_RAPPORTS.wta}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Elo WTA
          </a>
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              2.
            </span>{' '}
            Exécuter le snippet dans la console de cette page (F12 → Console) :
          </span>
          <SnippetElo />
        </li>
        <li>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">3.</span>{' '}
          Il copie le JSON dans le presse-papier : le coller ci-dessous et
          importer. Un circuit à la fois, ou les deux d&apos;un coup en collant{' '}
          <code>[extraitAtp, extraitWta]</code>.
        </li>
      </ol>

      <ImportEloForm />

      <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            Repli :
          </span>{' '}
          l&apos;ancienne récupération par fetch serveur (
          <code>POST /api/elo/refresh</code>) est conservée. Elle échoue tant que
          Tennis Abstract filtre les IP Vercel, mais fonctionne en local — et
          fonctionnera de nouveau si le filtre tombe.
        </p>
        <EloRefreshButton />
      </div>

      <p className="text-sm text-zinc-500">
        <Link href="/import" className="underline">
          Importer un tableau de tournoi
        </Link>
      </p>
    </div>
  );
}
