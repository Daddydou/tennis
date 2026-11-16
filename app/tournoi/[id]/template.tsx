/**
 * Transition entre les onglets d'un tournoi : seul le contenu de l'onglet
 * rejoue son arrivée ; le bandeau et la frise des onglets (layout) restent.
 */
export default function TemplateTournoi({ children }: { children: React.ReactNode }) {
  return <div className="animate-page">{children}</div>;
}
