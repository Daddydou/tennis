'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { lireOrigine, oublierOrigine, rayonCouvrant, type TypeOrigine } from './origineEntonnoir';

/** Au-delà, on ouvre quand même (sur le squelette de chargement). */
const ATTENTE_MAX_MS = 6000;

/**
 * Enveloppe d'une page qui peut « sortir d'un point » (origineEntonnoir.ts).
 *
 * Sans point retenu pour son type : simple arrivée en fondu (`animate-page`).
 * Avec : la page reste fermée sur ce point tant que son contenu n'est pas là
 * (squelette de chargement = enfant direct `aria-busy`), puis s'ouvre depuis
 * lui : un cercle qui grandit, la page qui passe de toute petite et floue à
 * nette (globals.css, « ENTONNOIR »). Tout se fait avant l'affichage
 * (useLayoutEffect) : pas d'image de la page entière avant l'effet.
 */
export default function Entonnoir({
  type,
  fondu = true,
  className = '',
  children,
}: {
  type: TypeOrigine;
  /** Arrivée en fondu quand il n'y a pas de point (false : la page apparaît telle quelle). */
  fondu?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const depart = lireOrigine(type);
    if (!el || !depart) return;

    const placer = (o: { x: number; y: number }) => {
      const b = el.getBoundingClientRect();
      const ox = o.x - b.left;
      const oy = o.y - b.top;
      el.style.setProperty('--ox', `${ox}px`);
      el.style.setProperty('--oy', `${oy}px`);
      el.style.setProperty('--orayon', `${rayonCouvrant(ox, oy, b, { largeur: window.innerWidth, hauteur: window.innerHeight }) + 24}px`);
    };

    let ouvert = false;
    const pret = () => el.firstElementChild !== null && el.querySelector(':scope > [aria-busy="true"]') === null;
    const ouvrir = () => {
      if (ouvert) return;
      ouvert = true;
      observateur.disconnect();
      clearTimeout(minuterie);
      // Relu au dernier moment : un onglet a pu bouger si la page a défilé.
      placer(lireOrigine(type) ?? depart);
      oublierOrigine();
      el.dataset.entonnoir = 'ouvre';
    };
    const surFin = (e: AnimationEvent) => {
      if (e.target === el && e.animationName === 'entonnoir') el.dataset.entonnoir = 'fini';
    };

    placer(depart);
    el.dataset.entonnoir = 'attente';
    el.addEventListener('animationend', surFin);
    const observateur = new MutationObserver(() => {
      if (pret()) ouvrir();
    });
    const minuterie = setTimeout(ouvrir, ATTENTE_MAX_MS);
    if (pret()) ouvrir();
    else observateur.observe(el, { childList: true, subtree: true });

    return () => {
      observateur.disconnect();
      clearTimeout(minuterie);
      el.removeEventListener('animationend', surFin);
      // Démonté avant d'ouvrir (double passage du mode développement) : rien ne doit rester fermé.
      if (!ouvert) delete el.dataset.entonnoir;
    };
  }, [type]);

  return (
    <div ref={ref} className={`${fondu ? 'animate-page' : ''} ${className}`}>
      {children}
    </div>
  );
}
