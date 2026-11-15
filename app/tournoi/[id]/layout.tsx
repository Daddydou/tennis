import { notFound } from 'next/navigation';
import TournoiNav from './TournoiNav';
import CourtDessine from '@/app/CourtDessine';
import { categorie, formatDate, SURFACE_LABEL } from '@/app/tournoisUi';
import { getTournament } from '@/db/queries';
import { estMasters } from '@/lib/masters';

/**
 * Cadre commun des écrans d'un tournoi : un bandeau (le court du tournoi,
 * dessiné, sur toute la largeur) avec le nom, puis les onglets. Un layout
 * n'est pas re-rendu quand on passe d'un onglet à l'autre : pendant le
 * chargement d'un écran, seul le contenu passe au squelette (./loading.tsx),
 * le bandeau et les onglets restent en place.
 */
export default async function TournoiLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tournoi = await getTournament(id);
  if (!tournoi) notFound();
  const meta = [
    tournoi.tour,
    categorie(tournoi),
    tournoi.surface ? (SURFACE_LABEL[tournoi.surface] ?? tournoi.surface) : null,
    tournoi.start_date ? `depuis le ${formatDate(tournoi.start_date)}` : null,
  ]
    .filter((x) => x && x !== '—')
    .join(' · ');
  return (
    <div className="space-y-5">
      <header className="pleine-largeur relative -mt-[5.25rem] h-64 overflow-hidden sm:h-72">
        <div className="animate-fondu absolute inset-0">
          <CourtDessine surface={tournoi.surface} delai="200ms" />
        </div>
        <div className="absolute inset-0 bg-linear-to-t from-background via-background/45 to-background/70" aria-hidden="true" />
        <div className="relative mx-auto flex h-full max-w-6xl flex-col justify-end gap-2 px-4 pb-5">
          <p className="titre-espace animate-fondu text-[0.7rem] text-zinc-700 [animation-delay:300ms]">{meta}</p>
          <h1 className="animate-titre text-3xl leading-tight text-zinc-950 sm:text-4xl">{tournoi.name}</h1>
        </div>
      </header>
      <TournoiNav id={id} masters={estMasters(tournoi.rounds)} />
      {children}
    </div>
  );
}
