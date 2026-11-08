import { notFound, redirect } from 'next/navigation';
import { getTournament } from '@/db/queries';
import { estMasters } from '@/lib/masters';
import { MastersPronostic } from '../MastersEcrans';

export const dynamic = 'force-dynamic';

/**
 * Onglet « Pronostic » d'un tournoi au format Masters : classement des poules, demi-finales, championne
 * (saisie jusqu'au premier match, points ensuite). Un tournoi à tableau n'a pas cet écran : retour au Dashboard.
 */
export default async function PronosticPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournoi = await getTournament(id);
  if (!tournoi) notFound();
  if (!estMasters(tournoi.rounds)) redirect(`/tournoi/${id}`);
  return <MastersPronostic id={id} tournoi={tournoi} />;
}
