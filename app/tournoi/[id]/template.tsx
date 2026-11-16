import Entonnoir from '@/app/Entonnoir';

/**
 * Transition entre les onglets d'un tournoi : seul le contenu de l'onglet
 * rejoue son arrivée ; le bandeau et la frise des onglets (layout) restent.
 * Après un clic sur un onglet, le contenu sort de son point (Entonnoir.tsx).
 */
export default function TemplateTournoi({ children }: { children: React.ReactNode }) {
  return <Entonnoir type="onglet">{children}</Entonnoir>;
}
