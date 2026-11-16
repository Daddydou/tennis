/**
 * TRANSITION ENTRE LES ÉCRANS : un template (contrairement à un layout) est
 * recréé à chaque changement de page ; son contenu rejoue donc l'animation
 * d'arrivée (`animate-page` : un fondu qui monte de 10 px, globals.css).
 * La barre du haut et le menu, dans le layout, ne bougent pas.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page">{children}</div>;
}
