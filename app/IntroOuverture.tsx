'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * ÉCRAN D'OUVERTURE — façon guide Dark : le nom en capitales fines qui sort
 * du flou, une jauge d'un pixel qui se remplit, puis tout s'efface sur la
 * scène de l'accueil. Une fois par session, à la première arrivée sur
 * l'accueil ; un toucher le passe.
 *
 * Tout le minutage est en CSS (globals.css, « OUVERTURE ») : ce composant ne
 * fait que retenir qu'il a été vu (sessionStorage, lu avant l'affichage par le
 * script de layout.tsx) et poser `.intro-vue` sur <html> à la fin, pour qu'un
 * retour sur l'accueil ne le rejoue pas.
 */
export default function IntroOuverture({ annee }: { annee: number }) {
  const pathname = usePathname();
  const [passee, setPassee] = useState(false);

  useEffect(() => {
    if (pathname !== '/') return;
    try {
      sessionStorage.setItem('intro-vue', '1');
    } catch {
      /* navigation privée : l'ouverture se rejouera, sans gravité */
    }
  }, [pathname]);

  if (pathname !== '/' || passee) return null;

  const terminer = () => {
    document.documentElement.classList.add('intro-vue');
    setPassee(true);
  };

  return (
    <button
      type="button"
      aria-label="Passer l'ouverture"
      onClick={terminer}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) terminer();
      }}
      className="intro-ouverture fixed inset-0 z-50 flex cursor-default flex-col items-center justify-center gap-8 bg-background"
    >
      <span className="titre-espace animate-titre pl-[0.6em] text-xl tracking-[0.6em] text-zinc-950">Tennis</span>
      <span className="block h-px w-48 bg-white/15" aria-hidden="true">
        <span className="jauge block h-px w-full bg-zinc-800" />
      </span>
      <span className="titre-espace animate-fondu text-[0.65rem] text-zinc-600 [animation-delay:400ms]">Saison {annee}</span>
    </button>
  );
}
