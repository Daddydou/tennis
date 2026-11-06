/**
 * Plan de navigation globale : 4 entrées (Accueil, Tournois, Saison, Outils).
 * Module pur (ni React ni Next) : il décrit seulement quelle page appartient
 * à quel groupe. Les URLs ne changent pas, on regroupe seulement.
 */
export type CleGroupe = 'accueil' | 'tournois' | 'saison' | 'outils';

export type LienNav = { href: string; label: string };

export type GroupeNav = {
  cle: CleGroupe;
  label: string;
  /** Où mène un clic sur l'entrée principale. */
  href: string;
  /** Pages du groupe, affichées en sous-barre (vide = pas de sous-barre). */
  liens: LienNav[];
  actifSi: (pathname: string) => boolean;
};

const commence = (p: string, ...prefixes: string[]) =>
  prefixes.some((x) => p === x || p.startsWith(`${x}/`));

export const GROUPES: GroupeNav[] = [
  {
    cle: 'accueil',
    label: 'Accueil',
    href: '/',
    liens: [],
    actifSi: (p) => p === '/',
  },
  {
    cle: 'tournois',
    label: 'Tournois',
    href: '/tournois',
    liens: [],
    // /tournois (liste) et /tournoi/<id>/... (un tournoi)
    actifSi: (p) => commence(p, '/tournois', '/tournoi'),
  },
  {
    cle: 'saison',
    label: 'Saison',
    href: '/bilan',
    liens: [
      { href: '/bilan', label: 'Bilan' },
      { href: '/fantasy', label: 'Fantasy saison' },
      { href: '/face-a-face', label: 'Face-à-face' },
    ],
    actifSi: (p) => commence(p, '/bilan', '/fantasy', '/face-a-face'),
  },
  {
    cle: 'outils',
    label: 'Outils',
    href: '/import',
    liens: [
      { href: '/import', label: 'Importer' },
      { href: '/participants', label: 'Participants' },
      { href: '/calibration', label: 'Calibration' },
      { href: '/procedures', label: 'Procédures' },
    ],
    actifSi: (p) => commence(p, '/import', '/participants', '/calibration', '/procedures'),
  },
];

/** Groupe de la page en cours, ou null (ex. /login). */
export function groupeActif(pathname: string): GroupeNav | null {
  return GROUPES.find((g) => g.actifSi(pathname)) ?? null;
}

/** Le lien de sous-barre « en cours » (le plus précis qui correspond). */
export function lienActif(groupe: GroupeNav, pathname: string): string | null {
  return groupe.liens.find((l) => commence(pathname, l.href))?.href ?? null;
}
