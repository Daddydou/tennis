/**
 * COURT DESSINÉ — le « fond photo » de l'app, sans photo.
 *
 * Un court de tennis tracé en traits fins, teinté selon la surface, dans
 * l'esprit du guide de la série Dark : sombre, un halo de projecteur, des
 * lignes blanches à peine appuyées. Aucun droit d'image, quelques centaines
 * d'octets, net à toutes les tailles.
 *
 * Deux variantes :
 *  - `perspective` : le court vu depuis le fond, en vraie perspective (les
 *    cotes réelles d'un court sont projetées, cf. `projeter`). Pour les
 *    bandeaux et l'accueil.
 *  - `plan` : le court vu de dessus. Pour les vignettes.
 *
 * Purement décoratif : `aria-hidden`, l'information (la surface) est toujours
 * écrite en toutes lettres à côté.
 *
 * Composant sans état ni hook : utilisable côté serveur comme côté client.
 */

export type Teinte = { ciel: string; abords: string; solHaut: string; solBas: string; lumiere: string };

/** Teintes désaturées, sombres : le court doit rester un fond, jamais une affiche. */
const TEINTES: Record<string, Teinte> = {
  hard: { ciel: '#070b11', abords: '#0d1a29', solHaut: '#15304d', solBas: '#1f4a75', lumiere: '#6f9fd6' },
  clay: { ciel: '#0b0705', abords: '#2a130a', solHaut: '#5a2612', solBas: '#8a3d1f', lumiere: '#e0a07a' },
  grass: { ciel: '#060a06', abords: '#122010', solHaut: '#22401e', solBas: '#355f2c', lumiere: '#a6d38a' },
  carpet: { ciel: '#08090b', abords: '#16191e', solHaut: '#262b33', solBas: '#373e48', lumiere: '#b8c2cf' },
};

export function teinteSurface(surface: string | null | undefined): Teinte {
  return (surface && TEINTES[surface]) || TEINTES.carpet;
}

/* ── Perspective ──────────────────────────────────────────────────────────
 * Repère : s = distance depuis la ligne de fond proche (0) jusqu'à la ligne
 * de fond lointaine (23,77 m) ; x = écart latéral au centre, en mètres.
 * Profondeur z = 1 (ligne proche) → 3,5 (ligne lointaine) ; projection
 * y = HORIZON + K / z, x = CX + x · ECHELLE / z. Les droites restent droites,
 * les lointains se resserrent : c'est ce qui donne la profondeur.
 */
const LONGUEUR = 23.77;
const Z_LOIN = 3.5;
const HORIZON = -40;
const K = 680;
const CX = 720;
const ECHELLE = 108.5;

function projeter(s: number, x: number): [number, number] {
  const z = 1 + (s * (Z_LOIN - 1)) / LONGUEUR;
  return [Math.round((CX + (x * ECHELLE) / z) * 10) / 10, Math.round((HORIZON + K / z) * 10) / 10];
}
const pt = (s: number, x: number) => projeter(s, x).join(',');
const ligne = (s1: number, x1: number, s2: number, x2: number) => {
  const [a, b] = projeter(s1, x1);
  const [c, d] = projeter(s2, x2);
  return { x1: a, y1: b, x2: c, y2: d };
};

const DOUBLE = 5.485; // demi-largeur double
const SIMPLE = 4.115; // demi-largeur simple
const SERVICE_PROCHE = 5.485; // 23,77/2 − 6,40
const FILET = LONGUEUR / 2;
const SERVICE_LOIN = LONGUEUR - SERVICE_PROCHE;

function Perspective({ t, id, cadrage }: { t: Teinte; id: string; cadrage: 'centre' | 'haut' }) {
  const court = [pt(0, -DOUBLE), pt(LONGUEUR, -DOUBLE), pt(LONGUEUR, DOUBLE), pt(0, DOUBLE)].join(' ');
  const abords = [pt(-6, -DOUBLE - 3.5), pt(LONGUEUR + 6, -DOUBLE - 3.5), pt(LONGUEUR + 6, DOUBLE + 3.5), pt(-6, DOUBLE + 3.5)].join(' ');
  const traits = [
    ligne(0, -SIMPLE, LONGUEUR, -SIMPLE),
    ligne(0, SIMPLE, LONGUEUR, SIMPLE),
    ligne(SERVICE_PROCHE, -SIMPLE, SERVICE_PROCHE, SIMPLE),
    ligne(SERVICE_LOIN, -SIMPLE, SERVICE_LOIN, SIMPLE),
    ligne(SERVICE_PROCHE, 0, SERVICE_LOIN, 0),
    ligne(LONGUEUR, 0, LONGUEUR - 0.3, 0),
  ];
  // Filet : poteaux à 0,914 m à l'extérieur du double ; hauteur 0,914 m.
  const [gx, gy] = projeter(FILET, -DOUBLE - 0.914);
  const [dx, dy] = projeter(FILET, DOUBLE + 0.914);
  const hauteur = (0.914 * ECHELLE) / (1 + (FILET * (Z_LOIN - 1)) / LONGUEUR);
  return (
    <svg viewBox="0 0 1440 480" preserveAspectRatio={cadrage === 'haut' ? 'xMidYMin slice' : 'xMidYMid slice'} className="h-full w-full" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-l`} cx="50%" cy="-5%" r="75%">
          <stop offset="0" stopColor={t.lumiere} stopOpacity="0.32" />
          <stop offset="0.55" stopColor={t.lumiere} stopOpacity="0.06" />
          <stop offset="1" stopColor={t.lumiere} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.solHaut} />
          <stop offset="1" stopColor={t.solBas} />
        </linearGradient>
      </defs>
      <rect width="1440" height="480" fill={t.ciel} />
      <polygon points={abords} fill={t.abords} />
      <polygon points={court} fill={`url(#${id}-s)`} />
      <g stroke="#fff" strokeOpacity="0.36" strokeWidth="1.4" fill="none">
        <polygon points={court} />
        {traits.map((l, i) => (
          <line key={i} {...l} />
        ))}
      </g>
      <polygon
        points={`${gx},${gy} ${dx},${dy} ${dx},${dy - hauteur} ${gx},${gy - hauteur}`}
        fill="#05070a"
        fillOpacity="0.35"
      />
      <line x1={gx} y1={gy - hauteur} x2={dx} y2={dy - hauteur} stroke="#fff" strokeOpacity="0.7" strokeWidth="2" />
      <rect width="1440" height="480" fill={`url(#${id}-l)`} />
    </svg>
  );
}

function Plan({ t, id }: { t: Teinte; id: string }) {
  const trait = { stroke: '#fff', strokeOpacity: 0.55, strokeWidth: 0.6 };
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-l`} cx="50%" cy="0%" r="90%">
          <stop offset="0" stopColor={t.lumiere} stopOpacity="0.3" />
          <stop offset="1" stopColor={t.lumiere} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.solHaut} />
          <stop offset="1" stopColor={t.solBas} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={t.abords} />
      <rect x="24" y="8" width="52" height="84" fill={`url(#${id}-s)`} {...trait} />
      <line x1="30.5" y1="8" x2="30.5" y2="92" {...trait} />
      <line x1="69.5" y1="8" x2="69.5" y2="92" {...trait} />
      <line x1="30.5" y1="27.4" x2="69.5" y2="27.4" {...trait} />
      <line x1="30.5" y1="72.6" x2="69.5" y2="72.6" {...trait} />
      <line x1="50" y1="27.4" x2="50" y2="72.6" {...trait} />
      <line x1="20" y1="50" x2="80" y2="50" stroke="#fff" strokeOpacity="0.85" strokeWidth="1" />
      <rect width="100" height="100" fill={`url(#${id}-l)`} />
    </svg>
  );
}

export default function CourtDessine({
  surface,
  variante = 'perspective',
  cadrage = 'centre',
}: {
  surface: string | null | undefined;
  variante?: 'perspective' | 'plan';
  /** Perspective : `haut` garde le fond du court et le ciel, coupe le premier plan. */
  cadrage?: 'centre' | 'haut';
}) {
  const t = teinteSurface(surface);
  // Identifiant des dégradés : le même pour une même surface et une même
  // variante (définitions identiques, un doublon dans la page est sans effet).
  const id = `court-${variante}-${surface ?? 'aucune'}`;
  return variante === 'plan' ? <Plan t={t} id={id} /> : <Perspective t={t} id={id} cadrage={cadrage} />;
}
