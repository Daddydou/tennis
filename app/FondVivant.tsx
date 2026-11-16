'use client';

import { useEffect, useRef } from 'react';

/**
 * FOND VIVANT — les fibres et poussières qui dérivent derrière tout l'écran,
 * comme sur le guide de la série Dark.
 *
 * Un seul <canvas> fixe, derrière le contenu (au-dessus du fond du <body>),
 * sans aucun clic possible.
 * Quelques dizaines de traits fins, courbes, très pâles, qui glissent et
 * tournent lentement ; des grains de poussière qui clignotent. Ils suivent
 * un peu le pointeur (ordinateur) et le défilement (téléphone), chacun selon
 * sa « profondeur » : c'est ce qui donne l'impression d'un espace.
 *
 * Sobre pour la batterie : 30 images par seconde au plus, moins de traits
 * sur téléphone, pause quand l'onglet est caché. « Réduire les animations » :
 * une seule image, immobile.
 */

type Fibre = { x: number; y: number; long: number; angle: number; courbe: number; vx: number; vy: number; va: number; alpha: number; epaisseur: number; z: number };
type Grain = { x: number; y: number; r: number; vx: number; vy: number; alpha: number; phase: number; z: number };

const hasard = (a: number, b: number) => a + Math.random() * (b - a);

export default function FondVivant() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let largeur = 0;
    let hauteur = 0;
    let fibres: Fibre[] = [];
    let grains: Grain[] = [];
    const pointeur = { x: 0, y: 0, cx: 0, cy: 0 };

    const creer = () => {
      const telephone = largeur < 640;
      fibres = Array.from({ length: telephone ? 22 : 44 }, () => ({
        x: hasard(0, largeur),
        y: hasard(0, hauteur),
        long: hasard(18, telephone ? 60 : 90),
        angle: hasard(0, Math.PI * 2),
        courbe: hasard(-0.5, 0.5),
        vx: hasard(-0.08, 0.08),
        vy: hasard(-0.05, 0.12),
        va: hasard(-0.0015, 0.0015),
        alpha: hasard(0.04, 0.16),
        epaisseur: hasard(0.5, 1.4),
        z: hasard(0.2, 1),
      }));
      grains = Array.from({ length: telephone ? 30 : 70 }, () => ({
        x: hasard(0, largeur),
        y: hasard(0, hauteur),
        r: hasard(0.4, 1.3),
        vx: hasard(-0.05, 0.05),
        vy: hasard(-0.03, 0.06),
        alpha: hasard(0.08, 0.35),
        phase: hasard(0, Math.PI * 2),
        z: hasard(0.2, 1),
      }));
    };

    const dimensionner = () => {
      largeur = window.innerWidth;
      hauteur = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, largeur < 640 ? 1.5 : 2);
      canvas.width = Math.round(largeur * dpr);
      canvas.height = Math.round(hauteur * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      creer();
    };

    const dessiner = (t: number) => {
      ctx.clearRect(0, 0, largeur, hauteur);
      // Décalage commun : le pointeur (amorti) et le défilement, pondérés par la profondeur.
      pointeur.cx += (pointeur.x - pointeur.cx) * 0.04;
      pointeur.cy += (pointeur.y - pointeur.cy) * 0.04;
      const defile = window.scrollY;
      ctx.lineCap = 'round';
      for (const f of fibres) {
        const dx = pointeur.cx * 18 * f.z;
        const dy = pointeur.cy * 12 * f.z - ((defile * 0.08 * f.z) % hauteur);
        const x = (((f.x + dx) % largeur) + largeur) % largeur;
        const y = (((f.y + dy) % hauteur) + hauteur) % hauteur;
        const ex = Math.cos(f.angle) * f.long;
        const ey = Math.sin(f.angle) * f.long;
        ctx.strokeStyle = `rgba(205,214,228,${f.alpha})`;
        ctx.lineWidth = f.epaisseur;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + ex / 2 - ey * f.courbe, y + ey / 2 + ex * f.courbe, x + ex, y + ey);
        ctx.stroke();
      }
      for (const g of grains) {
        const dx = pointeur.cx * 10 * g.z;
        const dy = pointeur.cy * 8 * g.z - ((defile * 0.05 * g.z) % hauteur);
        const x = (((g.x + dx) % largeur) + largeur) % largeur;
        const y = (((g.y + dy) % hauteur) + hauteur) % hauteur;
        const a = g.alpha * (0.55 + 0.45 * Math.sin(t / 900 + g.phase));
        ctx.fillStyle = `rgba(225,232,242,${a})`;
        ctx.beginPath();
        ctx.arc(x, y, g.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const avancer = () => {
      for (const f of fibres) {
        f.x += f.vx;
        f.y += f.vy;
        f.angle += f.va;
      }
      for (const g of grains) {
        g.x += g.vx;
        g.y += g.vy;
      }
    };

    dimensionner();
    let image = 0;
    let derniere = 0;
    const boucle = (t: number) => {
      image = requestAnimationFrame(boucle);
      if (t - derniere < 33) return; // ~30 images/s
      derniere = t;
      avancer();
      dessiner(t);
    };

    const surPointeur = (e: PointerEvent) => {
      pointeur.x = e.clientX / largeur - 0.5;
      pointeur.y = e.clientY / hauteur - 0.5;
    };
    const surVisibilite = () => {
      cancelAnimationFrame(image);
      if (!document.hidden && !reduit) image = requestAnimationFrame(boucle);
    };

    window.addEventListener('resize', dimensionner);
    if (reduit) {
      dessiner(0);
    } else {
      window.addEventListener('pointermove', surPointeur, { passive: true });
      document.addEventListener('visibilitychange', surVisibilite);
      image = requestAnimationFrame(boucle);
    }
    return () => {
      cancelAnimationFrame(image);
      window.removeEventListener('resize', dimensionner);
      window.removeEventListener('pointermove', surPointeur);
      document.removeEventListener('visibilitychange', surVisibilite);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
