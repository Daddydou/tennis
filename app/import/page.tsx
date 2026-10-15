import Link from 'next/link';
import { sessionValide } from '@/auth/garde';
import ImportForm from './ImportForm';
import ImportsAuto from './ImportsAuto';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  // Les tables de l'import automatique sont privées : on ne les lit qu'avec
  // une session valide, sans compter sur la seule redirection du proxy.
  const connecte = await sessionValide();

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Importer un tableau</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Colle le JSON produit par le bookmarklet ATP ou WTA — le circuit est lu
          dans le champ <code>tour</code> de l&apos;extraction. Le même tournoi peut être
          réimporté après chaque tour : les données sont mises à jour (upsert),
          pas dupliquées.
        </p>
      </div>
      <ImportForm />
      <p className="text-sm text-zinc-500">
        Les Elo Tennis Abstract s&apos;importent de la même façon, par collage :{' '}
        <Link href="/import/elo" className="underline">
          importer les Elo
        </Link>
        .
      </p>
      {connecte && <ImportsAuto />}
    </div>
  );
}
