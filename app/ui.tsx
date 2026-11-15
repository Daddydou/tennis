/**
 * SYSTÈME DE DESIGN — jetons partagés, pour toute l'app.
 *
 * Thème sombre « esprit Dark » : fond presque noir granuleux, titres en
 * capitales fines très espacées, séparations par filets d'un pixel. Couleurs
 * et contrastes : bloc de commentaire en tête de app/globals.css.
 *
 * Principes :
 *   - Accent jaune « balle de tennis » réservé à l'action principale et à
 *     l'élément actif. Le texte posé sur l'accent est `text-encre` (presque
 *     noir) : du blanc sur ce jaune serait illisible.
 *   - Les actions principales sont des cadres fins à libellé espacé, pas des
 *     aplats : c'est la grammaire du style Dark. L'aplat jaune n'apparaît
 *     qu'au survol et sur la sélection.
 *   - Chaque élément interactif presse visuellement au clic
 *     (`active:scale-[0.97]`).
 *   - Zones cliquables d'au moins 44px de haut (`min-h-11`) — usage
 *     principalement au téléphone.
 */

/**
 * Bouton principal : l'action la plus importante d'un écran ou d'un bloc.
 * Cadre jaune fin, libellé en capitales espacées ; plein jaune au survol.
 */
export const boutonPrimaire =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-accent px-5 font-titre text-xs font-normal uppercase tracking-[0.24em] text-accent transition active:scale-[0.97] active:bg-accent-actif hover:bg-accent hover:text-encre disabled:pointer-events-none disabled:border-zinc-300 disabled:text-zinc-500';

/** Bouton secondaire : une action possible, jamais LA priorité de l'écran. */
export const boutonSecondaire =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-white/15 px-4 text-sm font-medium text-zinc-900 transition active:scale-[0.97] hover:border-white/40 hover:bg-white/5 disabled:pointer-events-none disabled:text-zinc-500';

/** Bouton d'action destructrice — même geste, texte rouge, jamais de fond agressif. */
export const boutonDanger =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium text-red-700 transition active:scale-[0.97] hover:bg-red-50 disabled:pointer-events-none disabled:text-zinc-500';

/** Lien discret habillé en action (mêmes zones tactiles) — pour naviguer, pas pour valider. */
export const lienBouton =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-white/12 px-3.5 text-sm font-medium text-accent transition active:scale-[0.97] hover:border-accent/60 hover:bg-white/5';

/**
 * Agrandit la zone cliquable d'un lien texte SANS le transformer en bouton
 * (nav secondaire, liste d'actions denses) — juste assez de hauteur pour
 * rester tapable au pouce.
 */
export const zoneTactile = 'inline-flex min-h-11 items-center';

/**
 * Pastille de sélection (participant, tour, onglet) : actif ou non. Piste
 * sombre, sélection pleine en jaune balle.
 */
export function pilleSelecteur(actif: boolean): string {
  return `inline-flex min-h-11 items-center justify-center rounded-full px-3.5 text-sm font-medium transition active:scale-[0.97] ${
    actif ? 'bg-accent text-encre' : 'bg-zinc-100 text-zinc-600 ring-1 ring-white/8 hover:bg-zinc-200 hover:text-zinc-900'
  }`;
}

/**
 * Sélecteur de SECOND niveau (filtre, sous-vue sous une rangée de
 * `pilleSelecteur`) : la sélection est un simple cadre clair, jamais le jaune
 * plein — deux rangées jaunes l'une sous l'autre ne diraient plus laquelle
 * commande l'autre.
 */
export function filtreSecondaire(actif: boolean): string {
  return `inline-flex min-h-11 items-center justify-center rounded-full px-3.5 text-sm transition active:scale-[0.97] ${
    actif ? 'font-semibold text-zinc-950 ring-1 ring-white/45' : 'text-zinc-600 hover:bg-white/5 hover:text-zinc-900'
  }`;
}

/**
 * Carte de contenu : surface sombre légèrement translucide (le grain du fond
 * transparaît), filet d'un pixel au lieu d'une ombre (`shadow-card`).
 */
export const carte = 'rounded-lg bg-surface/85 shadow-card backdrop-blur-sm';

/**
 * Champ de saisie texte : fond sombre, filet clair au focus et anneau jaune.
 */
export const champTexte =
  'min-h-11 rounded-md border border-white/10 bg-zinc-100 px-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-500 focus:border-transparent focus:bg-zinc-50 focus:ring-2 focus:ring-accent';

/**
 * Note d'information neutre (méthode, contexte, mode d'emploi) : gris sombre,
 * JAMAIS une teinte sémantique (cf. DESIGN.md, « La règle des teintes prises »).
 */
export const noteInfo = 'rounded-md bg-zinc-100 px-3 py-2 text-xs leading-relaxed text-zinc-700 ring-1 ring-white/6';

/**
 * Badge court dans une ligne (gagné, perdu, en attente…) : 12px minimum, la
 * plus petite taille lisible au soleil. La couleur s'ajoute à côté
 * (`badgeNeutre` ou une teinte sémantique -100/-800).
 */
export const badge = 'inline-flex shrink-0 items-center rounded-md px-1.5 text-xs font-medium';
export const badgeNeutre = `${badge} bg-zinc-100 text-zinc-700`;

/**
 * Couleur des points d'un pick : sarcelle quand il en a marqué, framboise
 * quand il en est resté à zéro (pick raté). Rien tant que le match n'est pas
 * joué (null) : jamais de rouge sur un pick simplement en attente.
 */
export function couleurPoints(points: number | null | undefined): string {
  if (points === null || points === undefined) return '';
  return points > 0 ? 'text-juste' : 'text-rate';
}

/** Petit rond de chargement — remplace le texte « … » sur un bouton en attente. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}
