import { redirect } from 'next/navigation';

/**
 * Ancien onglet « Plan » : il EST désormais l'écran Picks (une seule réponse
 * au tour ouvert). Redirection gardée pour les anciens liens et favoris.
 */
export default async function AncienPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ participant?: string }>;
}) {
  const { id } = await params;
  const { participant } = await searchParams;
  redirect(`/tournoi/${id}/picks${participant ? `?participant=${encodeURIComponent(participant)}` : ''}`);
}
