import { notFound } from 'next/navigation';
import TournoiNav from './TournoiNav';
import { getTournament } from '@/db/queries';

/**
 * Cadre commun des écrans d'un tournoi : le nom et les onglets. Un layout
 * n'est pas re-rendu quand on passe d'un onglet à l'autre : pendant le
 * chargement d'un écran, seul le contenu passe au squelette (./loading.tsx),
 * le titre et la barre d'onglets restent en place.
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
  return (
    <div className="space-y-5">
      <TournoiNav id={id} nom={tournoi.name} />
      {children}
    </div>
  );
}
