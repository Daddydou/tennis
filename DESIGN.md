---
name: Picks Tennis
description: Outil de stratège pour un jeu de picks tennis ATP/WTA, thème clair esprit Apple.
colors:
  action-blue: "#2563eb"
  action-blue-hover: "#1d4ed8"
  action-blue-pressed: "#1e40af"
  page-mist: "#f5f5f7"
  card-white: "#ffffff"
  ink: "#1d1d1f"
  ink-strong: "#18181b"
  ink-muted: "#71717a"
  ink-faint: "#a1a1aa"
  well-grey: "#f4f4f5"
  well-grey-hover: "#e4e4e7"
  hairline: "#e4e4e7"
  hairline-soft: "#f4f4f5"
  circuit-wta: "#c026d3"
  surface-clay: "#f59e0b"
  surface-hard: "#0ea5e9"
  surface-grass: "#10b981"
  surface-carpet: "#94a3b8"
  status-win: "#059669"
  status-warning: "#b45309"
  status-error: "#dc2626"
  elo-ambiguous: "#7c3aed"
typography:
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.55
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.43
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.33
  label-caps:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.025em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12px"
rounded:
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  1: "4px"
  1-5: "6px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.card-white}"
    typography: "{typography.title}"
    rounded: "{rounded.xl}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.action-blue-hover}"
  button-primary-active:
    backgroundColor: "{colors.action-blue-pressed}"
  button-secondary:
    backgroundColor: "{colors.well-grey}"
    textColor: "{colors.ink-strong}"
    rounded: "{rounded.xl}"
    padding: "0 16px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.well-grey-hover}"
  button-danger:
    textColor: "{colors.status-error}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    padding: "0 12px"
    height: "44px"
  link-button:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.action-blue}"
    rounded: "{rounded.xl}"
    padding: "0 14px"
    height: "44px"
  segment-pill-active:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.xl}"
    padding: "0 12px"
    height: "44px"
  segment-pill:
    backgroundColor: "{colors.well-grey}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.xl}"
    padding: "0 12px"
    height: "44px"
  input-text:
    backgroundColor: "{colors.well-grey}"
    textColor: "{colors.ink-strong}"
    rounded: "{rounded.xl}"
    padding: "0 12px"
    height: "44px"
  card:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.2xl}"
    padding: "12px"
---

# Design System: Picks Tennis

## Overview

**Creative North Star: "Le carnet du capitaine"**

Un outil de stratège, net et calme. L'interface sert la décision du moment, quand un tour ouvre et qu'il faut choisir vite. Elle s'efface derrière les chiffres : probabilités, points, Elo, cotes. Le registre visuel est celui d'iOS et de macOS : page gris brume, cartes blanches légèrement surélevées, un seul bleu d'action, la police système. Rien n'est là pour impressionner.

La densité est assumée. Ce sont des tableaux serrés en texte 12 à 14px, pas une vitrine. La lisibilité vient de la hiérarchie et du contraste, pas de l'espace vide. Comme l'usage se partage entre le téléphone, souvent dehors, et l'ordinateur, chaque cible tactile fait au moins 44px de haut, même dans une liste dense.

La couleur porte du sens avant de décorer. Chaque teinte vive est déjà prise : circuit, surface, source d'Elo, victoire, avertissement, erreur. Le bleu est le seul accent libre, et il est réservé à l'action. L'app refuse deux registres : le look « site de paris » (néons, couleurs criardes, compteurs qui clignotent) et les fioritures décoratives (dégradés, illustrations, animations gratuites).

**Key Characteristics:**
- Thème clair forcé, pas de mode sombre (`dark:` neutralisé dans globals.css).
- Profondeur par écart de luminance (page #f5f5f7, carte blanche) plus une ombre très douce, jamais une bordure dure autour d'une carte.
- Un seul accent d'action, le bleu système ; toutes les autres teintes vives sont sémantiques.
- Police système, corps de 14px, chiffres en `tabular-nums` dans les tableaux.
- Chaque élément interactif fait au moins 44px de haut et s'enfonce légèrement à la pression (`scale 0.97`).

## Colors

Une palette neutre gris-zinc, un bleu d'action, et une famille de teintes sémantiques que l'on ne détourne jamais.

### Primary
- **Bleu d'action** (#2563eb) : bouton principal, pastille de sélection active, onglet actif du tournoi, texte des liens-boutons, anneau de focus clavier. Blanc sur ce bleu = 5,17:1. Survol #1d4ed8, pression #1e40af.

### Neutral
- **Brume de page** (#f5f5f7) : fond de page uniquement, jamais d'une carte.
- **Blanc de carte** (#ffffff) : cartes, barre d'en-tête, lien-bouton.
- **Encre** (#1d1d1f) : texte courant, un quasi-noir jamais pur.
- **Encre forte** (#18181b) : texte des boutons secondaires et des champs.
- **Encre atténuée** (#71717a) : légendes, en-têtes de tableau, liens de navigation au repos. C'est le gris de texte le plus utilisé.
- **Encre pâle** (#a1a1aa) : placeholder et métadonnées non essentielles. Contraste faible, à éviter pour toute information utile (voir Do's and Don'ts).
- **Puits gris** (#f4f4f5) : fond des boutons secondaires, des pastilles inactives et des champs de saisie. Survol #e4e4e7.
- **Filet** (#e4e4e7) et **Filet doux** (#f4f4f5) : séparateurs d'en-têtes de tableau et de lignes.

### Couleurs sémantiques (réservées)
- **Circuit ATP** : le bleu d'action lui-même (puce blue-600, fond blue-100). Partage assumé, un badge n'est jamais confondu avec un bouton.
- **Circuit WTA** (#c026d3, fuchsia) : puce et barre WTA.
- **Surfaces** : terre battue ambre (#f59e0b), dur ciel (#0ea5e9), gazon émeraude (#10b981), moquette ardoise (#94a3b8).
- **Victoire / en cours** (#059669, émeraude) : résultat gagné, statut actif, points positifs.
- **Avertissement / Elo maison** (#b45309, ambre) : repli de source, alerte non bloquante, sur fond ambre-50.
- **Erreur / Elo par défaut** (#dc2626, rouge) : échec, action destructrice, valeur par défaut suspecte, sur fond rouge-50.
- **Elo ambigu** (#7c3aed, violet) : homonymes non résolus.

### Named Rules
**La règle du bleu qui agit.** Le bleu signale ce qu'on peut faire, jamais un état ni une catégorie, à la seule exception assumée de la puce ATP. Un nouvel élément qui veut attirer l'œil sans être une action n'a pas droit au bleu.

**La règle des teintes prises.** Ambre, émeraude, ciel, fuchsia, violet, rouge et ardoise ont chacun un sens fixé. On ne les réutilise jamais pour décorer ou pour « varier ».

## Typography

**Display Font:** aucune, l'app n'a pas de titre de vitrine.
**Body Font:** police système (ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto)
**Label/Mono Font:** ui-monospace (SFMono, Menlo, Consolas), rare

**Character:** la police du système d'exploitation, sans personnalité ajoutée. Ce sont les poids et les tailles, pas la fonte, qui portent la hiérarchie.

### Hierarchy
- **Headline** (600, 18px) : nom du tournoi, titre de page.
- **Title** (600, 14px) : titre de carte ou de section. C'est le niveau de titre le plus fréquent.
- **Body** (400, 14px, taille de base du `body`) : texte, cellules de tableau, boutons.
- **Label** (400, 12px) : texte secondaire, détail de cellule, notes. C'est la taille la plus utilisée de l'app.
- **Label caps** (600, 12px, majuscules, interlettrage 0.025em, encre atténuée) : en-têtes de colonnes de tableau, sur-titres de section.

### Named Rules
**La règle des chiffres alignés.** Toute colonne de nombres (points, %, Elo, cotes) est en `tabular-nums` pour se comparer d'un coup d'œil.

## Layout

Une colonne centrée d'au plus 1152px (`max-w-6xl`), avec 16px de gouttière latérale et 20px en haut. L'en-tête global est une barre blanche pleine largeur, avec une navigation qui défile horizontalement au téléphone au lieu de passer à la ligne. Dans un tournoi, les onglets (Dashboard, Tableau, Prédictions, Picks, Fantasy, Bracket, Simulateur, Résultats) forment une barre soulignée qui défile elle aussi horizontalement.

Le rythme vertical s'appuie sur une petite échelle : 4, 6, 8 et 12px entre les éléments d'un bloc (`space-y-1` à `space-y-3`), 16 à 20px entre les sections (`space-y-4`, `space-y-5`). Les cartes ont un padding interne de 12px. Les tableaux larges défilent horizontalement dans leur conteneur au lieu de casser la page.

**La règle du pouce.** Toute zone cliquable fait au moins 44px de haut (`min-h-11`), lien texte compris (`zoneTactile`).

## Elevation & Depth

Le système est hybride et très plat. La profondeur vient d'abord de l'écart de luminance entre la page (#f5f5f7) et la carte blanche, puis d'une ombre douce à deux couches qui fait « flotter » la carte. Les boutons pleins portent une ombre minime (`shadow-sm`). L'en-tête se détache par un filet d'ombre de 1px.

### Shadow Vocabulary
- **Carte** (`box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)`) : toute carte de contenu (`carte`, utilitaire `shadow-card`).
- **Bouton** (`shadow-sm`, `0 1px 2px rgba(0,0,0,0.05)`) : bouton principal, pastille active, lien-bouton.
- **En-tête** (`box-shadow: 0 1px 0 rgba(0,0,0,0.06)`) : la barre globale.

### Named Rules
**La règle de l'ombre au lieu du trait.** Une carte se détache par la lumière et l'ombre, jamais par une bordure. Les filets sont réservés aux séparateurs internes des listes et des tableaux.

## Shapes

Coins généreux et cohérents : 12px (`rounded-xl`) pour tout ce qui se touche (boutons, champs, pastilles, liens-boutons), 16px (`rounded-2xl`) pour les cartes. Le 6 et le 8px (`rounded-md`, `rounded-lg`) ne survivent que dans de petits badges. Le cercle complet est réservé aux puces, aux points de statut et au spinner.

## Components

### Buttons
Tactiles et posés : ils s'enfoncent légèrement à la pression (`scale 0.97`, transition rapide), pour que l'appui se voie avant même la réponse du serveur.
- **Shape :** coins doux (12px), hauteur minimale 44px.
- **Primary :** fond bleu d'action, texte blanc 14px demi-gras, 16px de padding horizontal, ombre minime. Un seul par écran ou par bloc.
- **Hover / Focus :** bleu plus profond au survol, encore plus à la pression ; focus clavier = contour bleu de 2px décalé de 2px.
- **Secondary :** fond puits gris, texte encre forte, sans ombre.
- **Danger :** texte rouge 12px sans fond, fond rouge-50 au survol. Jamais de bouton rouge plein.
- **Lien-bouton :** fond blanc, texte bleu, ombre minime. Il sert à naviguer, pas à valider.
- **Désactivé :** opacité 40 %, aucun événement.
- **Chargement :** petit spinner circulaire de 14px dans le bouton, à la place d'un « … ».

### Chips
- **Pastille de sélection** (`pilleSelecteur`) : contrôle segmenté façon iOS, pour le choix de PREMIER niveau d'un écran (participant, tour, section). Inactive : piste gris puits, texte atténué. Active : bleu plein, texte blanc.
- **Filtre secondaire** (`filtreSecondaire`) : tout choix imbriqué sous une rangée de pastilles (moitié de tableau, sous-onglet du Simulateur). Actif : puce blanche, ombre minime, texte encre demi-gras ; jamais de bleu plein, pour que la hiérarchie entre deux rangées se lise.
- **Badge** (`badge`, `badgeNeutre`) : 12px, coins 6px. Neutre = puits gris, texte zinc-700 (gagné/perdu, en attente, cote). Sémantique = fond -100, texte -800 de la teinte réservée.
- **Badges de source d'Elo** : fond -50, bordure -300, texte -700 de leur teinte réservée. Le nom Tennis Abstract ne s'affiche que s'il diffère du nôtre.

### Notes d'information
- **Note info** (`noteInfo`) : fond puits gris, texte zinc-700, 12px, coins 12px. Pour la méthode, le contexte ou un état vide. Les avertissements restent en ambre-50, les erreurs en rouge-50.
- **Méthode repliée :** sur les écrans de décision (Picks, Bracket), l'explication de la méthode vit dans un « Comment lire… » replié, SOUS la décision, jamais au-dessus.

### Cards / Containers
- **Corner Style :** 16px.
- **Background :** blanc sur la brume de page.
- **Shadow Strategy :** ombre Carte (voir Elevation & Depth).
- **Border :** aucune.
- **Internal Padding :** 12px en général.

### Inputs / Fields
- **Style :** fond puits gris, sans bordure visible, coins 12px, hauteur 44px, texte 14px. Jamais blanc sur blanc dans une carte.
- **Focus :** le fond devient blanc et un anneau bleu de 2px apparaît.

### Navigation
- **Globale :** barre blanche, liens 14px en encre atténuée, zones de 44px, survol fond gris et texte encre. Défile horizontalement au téléphone.
- **Onglets de tournoi :** soulignés. L'onglet actif a un trait bas bleu de 2px et un texte bleu demi-gras ; les autres sont atténués et le trait est transparent. Filet zinc-200 sous l'ensemble.

### Tableaux denses
Le composant le plus présent de l'app. En-têtes en label caps atténué, séparés par un filet. Lignes séparées par un filet doux, cellules en 12 à 14px, chiffres en `tabular-nums`. Pas de zébrage ni de bordure de cellule.

## Do's and Don'ts

### Do:
- **Do** réutiliser les jetons de `app/ui.tsx` (`boutonPrimaire`, `boutonSecondaire`, `boutonDanger`, `lienBouton`, `pilleSelecteur`, `carte`, `champTexte`, `zoneTactile`, `Spinner`) plutôt que de recomposer des classes.
- **Do** donner au moins 44px de haut à toute cible tactile.
- **Do** écrire les classes Tailwind en chaînes littérales complètes (Tailwind v4 sans config scanne le code source).
- **Do** aligner les nombres avec `tabular-nums`.
- **Do** garder un seul bouton principal bleu par bloc.
- **Do** mettre la décision du moment en tête d'écran (tour ouvert, picks à poser), la méthode et les sources en dessous.
- **Do** signaler le circuit par une barre de 4px au bord gauche et une puce écrite, sur des lignes blanches.
- **Do** donner au moins 12px et zinc-500 (4,8:1) à tout texte qui porte une information ; ambre et émeraude en -700 pour le texte.

### Don't:
- **Don't** utiliser le look « site de paris » : néons, couleurs criardes, compteurs clignotants, rouge et vert saturés en aplats.
- **Don't** ajouter de fioritures décoratives : dégradés, illustrations, animations gratuites.
- **Don't** réutiliser une teinte sémantique (ambre, émeraude, ciel, fuchsia, violet, rouge, ardoise) pour décorer.
- **Don't** entourer une carte d'une bordure dure ; l'ombre Carte suffit.
- **Don't** réintroduire de mode sombre ou de variante `dark:`.
- **Don't** porter une information utile en encre pâle (#a1a1aa) : son contraste est trop faible pour une lecture en plein soleil.
