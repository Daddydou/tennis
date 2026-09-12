/**
 * SYSTÈME DE DESIGN — jetons partagés, pour toute l'app.
 *
 * Validé sur un aperçu à 3 écrans (Dashboard, Picks, Tableau — cf. le
 * commit qui a introduit ce fichier sous app/tournoi/[id]/ui.tsx) avant
 * généralisation ici à l'ensemble de l'app.
 *
 * Principes (cf. le bloc de commentaire dans app/globals.css pour le détail
 * couleur/contraste) :
 *   - Accent lime réservé aux actions principales et à la mise en avant —
 *     jamais aux couleurs déjà porteuses de sens (circuits ATP/WTA,
 *     surfaces, source d'Elo, erreurs, cf. app/page.tsx et
 *     app/tournoi/[id]/BadgeSourceElo.tsx).
 *   - Chaque élément interactif presse visuellement au clic
 *     (`active:scale-[0.97]`, transition rapide) : l'utilisateur voit sa
 *     pression prise en compte avant même la réponse du serveur.
 *   - Zones cliquables d'au moins 44px de haut (`min-h-11`) — usage
 *     principalement au téléphone.
 */

/** Bouton principal : l'action la plus importante d'un écran ou d'un bloc. */
export const boutonPrimaire =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-lime-500 px-4 text-sm font-semibold text-zinc-900 shadow-sm transition active:scale-[0.97] hover:bg-lime-400 disabled:pointer-events-none disabled:opacity-40 dark:bg-lime-400 dark:hover:bg-lime-300';

/** Bouton secondaire : une action possible, jamais LA priorité de l'écran. */
export const boutonSecondaire =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition active:scale-[0.97] hover:border-zinc-400 hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900';

/** Bouton d'action destructrice — même geste, teinte d'alerte au survol. */
export const boutonDanger =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-transparent px-3 text-xs font-medium text-zinc-500 transition active:scale-[0.97] hover:text-red-600 disabled:pointer-events-none disabled:opacity-40 dark:text-zinc-400 dark:hover:text-red-400';

/** Lien discret habillé en action secondaire (mêmes zones tactiles). */
export const lienBouton =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 px-3.5 text-sm font-medium text-zinc-700 transition active:scale-[0.97] hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900';

/**
 * Agrandit la zone cliquable d'un lien texte SANS le transformer en bouton
 * (nav secondaire, liste d'actions denses) — juste assez de hauteur pour
 * rester tapable au pouce.
 */
export const zoneTactile = 'inline-flex min-h-11 items-center';

/**
 * Pastille de sélection (participant, tour, onglet) : actif ou non. Même
 * geste visuel partout où on choisit une seule option dans une rangée.
 */
export function pilleSelecteur(actif: boolean): string {
  return `inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium transition active:scale-[0.97] ${
    actif
      ? 'border-lime-500 bg-lime-500 text-zinc-900 dark:border-lime-400 dark:bg-lime-400 dark:text-zinc-950'
      : 'border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900'
  }`;
}

/** Carte de contenu : conteneur de base, radius/ombre cohérents. */
export const carte =
  'rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40';

/** Champ de saisie texte : radius/bordure/focus cohérents avec les boutons. */
export const champTexte =
  'min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-lime-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-lime-400';

/** Petit rond de chargement — remplace le texte « … » sur un bouton en attente. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}
