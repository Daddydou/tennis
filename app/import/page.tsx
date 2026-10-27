import Link from 'next/link';
import { sessionValide } from '@/auth/garde';
import ImportForm from './ImportForm';
import ImportsAuto from './ImportsAuto';
import TournoisApi from './TournoisApi';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  // Les tables de l'import automatique sont privées : on ne les lit qu'avec
  // une session valide, sans compter sur la seule redirection du proxy.
  const connecte = await sessionValide();

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-lg font-semibold">Importer un tableau</h1>

      {connecte && <TournoisApi />}

      {connecte && <ImportsAuto />}

      {connecte && (
        <p className="text-sm">
          <Link href="/import/thomas" className="font-medium underline">
            Synchroniser le bracket de Thomas
          </Link>{' '}
          <span className="text-zinc-500">— pronostics de Moi, Laki et Thomas vers le Simulateur.</span>
        </p>
      )}

      <details>
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-zinc-700">
          Import manuel par collage (secours : bookmarklet ATP ou WTA)
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-sm text-zinc-500">
            Colle le JSON produit par le bookmarklet ATP ou WTA — le circuit est lu
            dans le champ <code>tour</code> de l&apos;extraction. Le même tournoi peut être
            réimporté après chaque tour : les données sont mises à jour (upsert),
            pas dupliquées.
          </p>
          <ImportForm />
        </div>
      </details>

      <p className="text-sm text-zinc-500">
        Les Elo Tennis Abstract s&apos;importent par collage :{' '}
        <Link href="/import/elo" className="underline">
          importer les Elo
        </Link>
        .
      </p>
    </div>
  );
}
