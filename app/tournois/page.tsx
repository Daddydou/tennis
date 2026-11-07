import Link from 'next/link';
import { listTournaments } from '@/db/queries';
import { boutonPrimaire } from '../ui';
import { ListeTournois } from '../tournoisUi';

export const dynamic = 'force-dynamic';

export default async function PageTournois() {
  const tournois = await listTournaments();
  const aujourdHui = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Tournois</h1>
        <Link href="/import" className={boutonPrimaire}>
          Importer un tableau
        </Link>
      </div>

      {tournois.length === 0 ? (
        <p className="text-sm text-zinc-600">
          Aucun tournoi. Commence par{' '}
          <Link href="/import" className="font-medium text-accent underline underline-offset-2">
            importer un tableau
          </Link>
          .
        </p>
      ) : (
        <ListeTournois tournois={tournois} aujourdHui={aujourdHui} />
      )}
    </div>
  );
}
