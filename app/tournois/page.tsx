import Link from 'next/link';
import { listTournaments } from '@/db/queries';
import { boutonPrimaire } from '../ui';
import { ListeTournois, separerTournois } from '../tournoisUi';

export const dynamic = 'force-dynamic';

export default async function PageTournois() {
  const tournois = await listTournaments();
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const { aSuivre, termines } = separerTournois(tournois);

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
        <>
          {aSuivre.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-sm font-semibold">En cours et à venir</h2>
              <ListeTournois tournois={aSuivre} aujourdHui={aujourdHui} />
            </section>
          )}
          {termines.length > 0 && (
            <details className="group space-y-2.5">
              <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-soustitre">
                <span aria-hidden="true" className="transition group-open:rotate-90">▸</span>
                Tournois terminés ({termines.length})
              </summary>
              <ListeTournois tournois={termines} aujourdHui={aujourdHui} />
            </details>
          )}
        </>
      )}
    </div>
  );
}
