/**
 * SYSTÈME DE DESIGN — jetons partagés, pour toute l'app.
 *
 * Thème clair, esprit Apple (iOS/macOS) : fond de page gris très clair,
 * cartes blanches surélevées par une ombre douce (jamais une bordure dure),
 * accent bleu système, coins généreux et cohérents. Détail couleur/contraste
 * dans le bloc de commentaire en tête de app/globals.css.
 *
 * Principes :
 *   - Accent bleu réservé aux actions principales — jamais aux couleurs déjà
 *     porteuses de sens ailleurs dans l'app (surfaces, source d'Elo,
 *     erreurs, cf. app/page.tsx et app/tournoi/[id]/BadgeSourceElo.tsx).
 *   - Chaque élément interactif presse visuellement au clic
 *     (`active:scale-[0.97]`, transition rapide) : l'utilisateur voit sa
 *     pression prise en compte avant même la réponse du serveur.
 *   - Zones cliquables d'au moins 44px de haut (`min-h-11`) — usage
 *     principalement au téléphone.
 */

/** Bouton principal : l'action la plus importante d'un écran ou d'un bloc. */
export const boutonPrimaire =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition active:scale-[0.97] active:bg-blue-800 hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-40';

/** Bouton secondaire : une action possible, jamais LA priorité de l'écran. */
export const boutonSecondaire =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-900 transition active:scale-[0.97] hover:bg-zinc-200 disabled:pointer-events-none disabled:opacity-40';

/** Bouton d'action destructrice — même geste, texte rouge, jamais de fond agressif. */
export const boutonDanger =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-medium text-red-600 transition active:scale-[0.97] hover:bg-red-50 disabled:pointer-events-none disabled:opacity-40';

/** Lien discret habillé en action (mêmes zones tactiles) — pour naviguer, pas pour valider. */
export const lienBouton =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white px-3.5 text-sm font-medium text-blue-600 shadow-sm transition active:scale-[0.97] hover:bg-zinc-50';

/**
 * Agrandit la zone cliquable d'un lien texte SANS le transformer en bouton
 * (nav secondaire, liste d'actions denses) — juste assez de hauteur pour
 * rester tapable au pouce.
 */
export const zoneTactile = 'inline-flex min-h-11 items-center';

/**
 * Pastille de sélection (participant, tour, onglet) : actif ou non — esprit
 * contrôle segmenté iOS (piste grise, sélection pleine couleur), jamais de
 * bordure dure.
 */
export function pilleSelecteur(actif: boolean): string {
  return `inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-medium transition active:scale-[0.97] ${
    actif ? 'bg-blue-600 text-white shadow-sm' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
  }`;
}

/**
 * Carte de contenu : fond blanc pur sur le gris très clair de la page,
 * ombre douce (`shadow-card`, cf. globals.css) plutôt qu'une bordure —
 * c'est cet écart de luminance + l'ombre qui donne l'effet « surélevé ».
 */
export const carte = 'rounded-2xl bg-white shadow-card';

/**
 * Champ de saisie texte : fond gris clair façon iOS (jamais blanc sur
 * blanc dans une carte), qui blanchit et s'entoure d'un anneau bleu au focus.
 */
export const champTexte =
  'min-h-11 rounded-xl border border-transparent bg-zinc-100 px-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500';

/** Petit rond de chargement — remplace le texte « … » sur un bouton en attente. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}
