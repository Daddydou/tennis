import { redirect } from 'next/navigation';

/**
 * Ancien onglet « Bracket » (arbre pronostiqué à l'Elo) : fusionné dans
 * Prédictions → Tableau pronostiqué, pour que « Bracket » ne désigne plus que
 * le jeu. Redirection gardée pour les anciens liens et favoris.
 */
export default async function AncienBracketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ round?: string; moitie?: string }>;
}) {
  const { id } = await params;
  const { round, moitie } = await searchParams;
  const q = new URLSearchParams({ vue: 'tableau' });
  if (round) q.set('round', round);
  if (moitie) q.set('moitie', moitie);
  redirect(`/tournoi/${id}/predictions?${q.toString()}`);
}
