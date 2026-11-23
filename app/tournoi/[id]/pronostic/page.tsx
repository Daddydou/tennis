import { notFound, redirect } from 'next/navigation';
import { getTournament } from '@/db/queries';
import { estDavis } from '@/lib/davisRencontre';
import { estMasters } from '@/lib/masters';
import DavisConseils from '../DavisConseils';
import { MastersPronostic } from '../MastersEcrans';

export const dynamic = 'force-dynamic';

/**
 * Onglet « Pronostic » :
 *  - Masters : classement des poules, demi-finales, championne (saisie jusqu'au premier match, points ensuite) ;
 *  - Coupe Davis (onglet « Pronos ») : chances et conseils pour les picks, le bracket et les pronos des matchs.
 * Un tournoi à tableau n'a pas cet écran : retour au Dashboard.
 */
export default async function PronosticPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, recherche] = await Promise.all([params, searchParams]);
  const tournoi = await getTournament(id);
  if (!tournoi) notFound();
  if (estDavis(tournoi.rounds)) return <DavisConseils id={id} recherche={recherche} />;
  if (!estMasters(tournoi.rounds)) redirect(`/tournoi/${id}`);
  return <MastersPronostic id={id} tournoi={tournoi} />;
}
