/**
 * ENTONNOIR — d'où sort la page qu'on ouvre.
 *
 * Au clic sur une vignette du menu (un tournoi) ou sur le point d'un onglet,
 * on retient ce point ; la page qui arrive s'ouvre ensuite depuis lui, comme
 * aspirée hors d'un entonnoir (Entonnoir.tsx, globals.css « ENTONNOIR »).
 *
 * Un seul point retenu à la fois, oublié dès qu'il a servi ou au bout de
 * quelques secondes (un clic qui ne mène nulle part ne doit rien laisser).
 */

export type TypeOrigine = 'tournoi' | 'onglet';

type Origine = { type: TypeOrigine; x: number; y: number; el: Element | null; t: number };

let derniere: Origine | null = null;
let minuterie: ReturnType<typeof setTimeout> | null = null;

/** Au-delà, un point retenu ne sert plus (navigation abandonnée, très lente...). */
export const DUREE_VIE_MS = 6000;

function centre(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * Retient le point de départ. `suivre` : l'élément reste à l'écran (point d'un
 * onglet) et sa position sera relue au moment d'ouvrir (la page a pu défiler).
 * Pour un tournoi, un point lumineux reste posé là, le temps que la page arrive.
 */
export function retenirOrigine(type: TypeOrigine, el: Element, suivre = false): void {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  effacerAttente();
  const { x, y } = centre(el);
  derniere = { type, x, y, el: suivre ? el : null, t: performance.now() };
  if (type === 'tournoi') {
    const point = document.createElement('span');
    point.className = 'point-entonnoir';
    point.setAttribute('aria-hidden', 'true');
    point.style.left = `${x}px`;
    point.style.top = `${y}px`;
    document.body.append(point);
    // Pendant l'attente, le squelette de chargement général s'efface : seul le point reste.
    document.documentElement.dataset.entonnoirAttente = '1';
  }
  minuterie = setTimeout(() => {
    derniere = null;
    effacerAttente();
  }, DUREE_VIE_MS);
}

/** Le point de départ, s'il est encore valable pour ce type de page (sans l'oublier). */
export function lireOrigine(type: TypeOrigine): { x: number; y: number } | null {
  if (!derniere || derniere.type !== type || performance.now() - derniere.t > DUREE_VIE_MS) return null;
  return derniere.el?.isConnected ? centre(derniere.el) : { x: derniere.x, y: derniere.y };
}

/** Le point a servi : on l'oublie, et le point lumineux disparaît. */
export function oublierOrigine(): void {
  derniere = null;
  effacerAttente();
}

function effacerAttente(): void {
  if (minuterie) clearTimeout(minuterie);
  minuterie = null;
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.point-entonnoir').forEach((p) => p.remove());
  delete document.documentElement.dataset.entonnoirAttente;
}

/**
 * Rayon (px) du cercle qui, centré sur le point (coordonnées dans l'élément),
 * couvre tout l'écran visible : distance au coin de l'écran le plus éloigné.
 * `boite` = position de l'élément dans l'écran (getBoundingClientRect).
 */
export function rayonCouvrant(
  ox: number,
  oy: number,
  boite: { left: number; top: number },
  ecran: { largeur: number; hauteur: number },
): number {
  const coins: [number, number][] = [
    [-boite.left, -boite.top],
    [ecran.largeur - boite.left, -boite.top],
    [-boite.left, ecran.hauteur - boite.top],
    [ecran.largeur - boite.left, ecran.hauteur - boite.top],
  ];
  return Math.ceil(Math.max(...coins.map(([x, y]) => Math.hypot(x - ox, y - oy))));
}
