# Prompt pour Claude Code

Copie tout ce qui suit la ligne de séparation et colle-le dans Claude Code,
depuis le dossier du projet Next.js.

---

Projet Next.js 14 (App Router) + Supabase + Tailwind : jeu de picks tennis personnel, mono-utilisateur.

## Contrainte absolue

Les modules dans `lib/` sont **déjà écrits, testés et validés**. Ne les modifie pas, ne les réécris pas, ne les duplique pas. Importe-les et utilise-les tels quels :

- `lib/types.ts` — types partagés (Player, Match, Slot, Pick, DrawExtract…)
- `lib/scoring.ts` — barème du jeu, validé 7/7 sur les cas de référence
- `lib/elo.ts` — Elo par surface, calcul match par match
- `lib/optimizer.ts` — espérances + affectation hongroise (backtest : 136 pts vs 216 pour l'oracle)
- `lib/parser.ts` — JSON du bookmarklet → structures du moteur

Lis ces fichiers avant d'écrire quoi que ce soit. Leurs signatures font foi.

## Règles du jeu

Barème (implémenté dans `lib/scoring.ts`, ne pas réimplémenter) :

| Poste | Valeur |
|---|---|
| Match gagné | 5 pts, tous rounds confondus |
| Net sets | (gagnés − perdus) × 3, plancher 0 |
| Net games | somme sur les **sets gagnés uniquement** |
| Walkover | 5 pts + 3/set incomplet + 2/set incomplet |

Le perdant conserve ses points. Tie-break = 1 jeu de net.

Structure des picks : **12 picks par tournoi**. Deux par tour (un dans la moitié haute, un dans la moitié basse) jusqu'aux quarts inclus, puis un seul en demi-finale et un seul en finale. **Un joueur ne peut être pické qu'une seule fois sur tout le tournoi** — c'est la contrainte structurante du jeu.

## Base de données

Les tables existent déjà dans Supabase (projet `ubnkuwyqclrjckogldlc`) : `tn_players`, `tn_tournaments`, `tn_matches`, `tn_picks`, `tn_projections`. Plus les fonctions `tn_score_match()` et `tn_recompute_picks()`.

Ne recrée pas le schéma. Si tu as besoin de le consulter, il est dans `schema.sql` à la racine.

Contrainte clé côté base : `unique (tournament_id, player_id)` sur `tn_picks`.

## Écrans à construire

### 1. `/import`
Textarea pour coller le JSON produit par le bookmarklet ATP.
- Appeler `parseExtract()` puis `verifierExtraction()`
- Afficher les avertissements retournés (matchs manquants, joueurs sans ID…)
- Insérer dans `tn_tournaments`, `tn_players`, `tn_matches`
- Upsert, pas d'insert : le même tournoi sera réimporté après chaque tour

### 2. `/tournoi/[id]`
Vue du tableau, tour par tour. Scores, statuts, vainqueurs. Lecture seule.

### 3. `/tournoi/[id]/picks` — écran principal
Pour le tour courant :
- Deux colonnes (moitié haute / moitié basse)
- Joueurs triés par `recommanderPourTour()` avec leur espérance de points
- Joueurs déjà pickés dans ce tournoi : grisés et non sélectionnables
- Afficher pour chaque joueur : nom, tête de série, adversaire du tour, E[pts]
- Bouton de validation qui écrit dans `tn_picks`

### 4. `/tournoi/[id]/resultats`
Points par pick avec le détail (match / net sets / net games), total du tournoi.

### 5. `/api/recompute`
Route POST qui appelle la fonction Supabase `tn_recompute_picks(tournament_id)`.

## Technique

- Client Supabase serveur avec `SUPABASE_SERVICE_ROLE_KEY` pour les imports
- Client navigateur avec `NEXT_PUBLIC_SUPABASE_ANON_KEY` pour la lecture
- Interface **en français**
- Style sobre et dense, pas d'espacement excessif — c'est un outil, pas une vitrine
- Tailwind uniquement, pas de librairie de composants

## Exemple d'utilisation des modules

```ts
import { parseExtract, extraireJoueurs, joueursParTour } from '@/lib/parser';
import { calculerEsperances, genererSlots, recommanderPourTour } from '@/lib/optimizer';
import { pointsAtRound } from '@/lib/scoring';

const extract = parseExtract(json);
const players = extraireJoueurs(extract);
const rounds = extract.roundsFound;
const esp = calculerEsperances(extract.matches, players, rounds, 3, 0.6, 'clay');

const reco = recommanderPourTour(esp, players, 'QF', 'top', dejaPickes, 10);
```

## Fichier de test

`madrid2026.json` à la racine contient un tournoi complet (Madrid 2026, 127 matchs, 96 joueurs). Utilise-le pour tester l'import et les écrans sans dépendre d'une extraction fraîche.

## Ce qu'il ne faut pas faire

- Ne pas réimplémenter le scoring : il est dans `lib/scoring.ts`
- Ne pas chercher à télécharger des données depuis `github.com/JeffSackmann/tennis_atp` : tous les CSV renvoient 404, vérifié depuis deux réseaux différents
- Ne pas ajouter d'authentification multi-utilisateurs : l'app est mono-utilisateur
- Ne pas modifier les fichiers de `lib/`
