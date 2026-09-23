# Recherche — backtests du moteur de picks

> **Origine.** Ce dossier reprend les scripts de backtest et les données de
> l'ancien projet `tennis-picks` (première version du moteur, archivé), rapatriés
> le 2026-09-23. Les scripts importent désormais le moteur **à jour** de
> l'application (`../lib/`), et non plus l'ancienne copie. La suite de ce
> document est le README d'origine. Les sections *Modules* et *Utilisation*
> décrivent l'API de la première version : pour l'API actuelle, voir `../lib/`
> et le README principal.
>
> **Ce qui a changé au rapatriement :**
> - imports `./lib/…` remplacés par `../lib/…` ;
> - chemins de données relatifs au script (`__dirname`) : les scripts se lancent
>   depuis n'importe quel dossier ;
> - noms de tournois corrigés : `05-madrid.json` → `21-madrid.json`,
>   `06-roland-garros.json` → `25-roland-garros.json` (`backtest-mc.ts` ne
>   tournait plus). `backtest.ts` lit `tournois/21-madrid.json`, identique à
>   l'ancien `madrid2026.json` ;
> - `validate.ts` : attendus Walkover 15 → **5** et Abandon après 6-3 16 →
>   **11**, conformes au barème corrigé (migration 0013) ;
> - `elos.json` est la copie de l'ancien projet, pour garder les mêmes Elo
>   d'entrée que les résultats publiés. `compute-elo.ts` le régénère.

Modules TypeScript pour le jeu des picks tennis (ATP + WTA).

## Barème

| Poste | Valeur |
|---|---|
| Match gagné | **5 pts** (tous rounds) |
| Net sets | (gagnés − perdus) × 3, **plancher 0** |
| Net games | somme sur les **sets gagnés uniquement** |
| Walkover | 5 pts + 3/set incomplet + 2/set incomplet |
| Unicité | 1 pick par joueur et par tournoi |

Le perdant conserve ses points. Tie-break = 1 jeu de net.
Le nombre de sets incomplets d'un walkover dépend du format :
2 en bo3 (15 pts), 3 en bo5 (20 pts).

**Validé 7/7** en Python et TypeScript, plus les cas bo5.

## Modules

| Fichier | Rôle |
|---|---|
| `lib/types.ts` | Types partagés |
| `lib/scoring.ts` | Barème et calcul des points |
| `lib/elo.ts` | Elo par surface, calcul match par match |
| `lib/optimizer.ts` | Espérances + affectation hongroise |
| `lib/montecarlo.ts` | **Simulation du tournoi (recommandé)** |
| `lib/parser.ts` | JSON bookmarklet → structures |

## Utilisation

```ts
import { parseExtract, extraireJoueurs, devinerBestOf, devinerSurface } from '@/lib/parser';
import { simulerTournoi } from '@/lib/montecarlo';
import { optimiser, genererSlots } from '@/lib/optimizer';

const ex = parseExtract(jsonDuBookmarklet);
const players = extraireJoueurs(ex, ranks, elos);
const bo = devinerBestOf(ex.tour, ex.tournament.slug);
const surface = devinerSurface(ex.tournament.slug);

const mc = simulerTournoi(ex.matches, players, ex.roundsFound, 20000, bo, surface);
const picks = optimiser(mc.esperances, players, genererSlots(ex.roundsFound));
```

### Calcul des Elo

```ts
import { calculerElos, eloDepuisRang } from '@/lib/elo';

// ORDRE CHRONOLOGIQUE obligatoire : l'Elo est séquentiel
const elos = calculerElos([
  { matches: marrakechMatches,  surface: 'clay' },
  { matches: monteCarloMatches, surface: 'clay' },
  { matches: madridMatches,     surface: 'clay' },
], initiaux);
```

## Résultats des backtests

### Rejoués le 2026-09-23 avec le moteur à jour (`../lib/`)

Mêmes données (`tournois/`, `elos.json`), Monte Carlo 20 000 itérations,
graine 42 (déterministe). « Ancien moteur » = même script, mêmes données,
exécuté sur la copie `tennis-picks/lib`.

| Backtest | Stratégie | Ancien moteur | Moteur à jour |
|---|---|---|---|
| Madrid (`backtest-mc.ts`) | Oracle | 216 | 216 |
| | **Monte Carlo** | **147 (68 %)** | **137 (63 %)** |
| | Analytique | 117 | 117 |
| | Meilleur Elo | 98 | 98 |
| Roland-Garros (`backtest-rg.ts`) | Oracle | **258** | **245** |
| | Monte Carlo | 153 (59 %) | 153 (62 %) |
| | Classement ATP | 153 | 153 |
| | Meilleur Elo | 149 | 149 |
| Madrid (`backtest.ts`) | Optimiseur analytique | 136 | 136 |

La stratégie aléatoire n'est pas reprise : sans graine, elle varie de ±2 pts
d'une exécution à l'autre.

- **Oracle RG 258 → 245** : effet du barème corrigé. Un forfait ne rapporte plus
  que 5 pts, et un abandon ne compte que les sets entièrement joués.
- **Monte Carlo Madrid 147 → 137** : différence **non expliquée à ce jour**. Ce
  n'est ni l'échelle Elo (rejoué à 400, identique), ni un décalage d'arguments
  (la signature de `simulerTournoi` n'a fait que s'allonger). Elle vient d'une
  autre évolution de `lib/montecarlo.ts` : à investiguer avant de citer ce
  chiffre.
- Les tableaux ci-dessous (156 pts Madrid, 136 pts RG) datent d'une version plus
  ancienne encore du moteur ou des Elo. Aucun des deux moteurs ne les reproduit
  sur les données actuelles.

### Madrid 2026 — bo3, 96 joueurs (résultats d'origine)

| Stratégie | Points | % oracle |
|---|---|---|
| Oracle | 216 | 100 % |
| **Monte Carlo** | **156** | **72 %** |
| Meilleur Elo | 127 | 59 % |
| Classement ATP | 108 | 50 % |
| Aléatoire | 94 | 43 % |

### Roland-Garros 2026 — bo5, 128 joueurs (résultats d'origine)

| Stratégie | Points | % oracle |
|---|---|---|
| Oracle | 258 | 100 % |
| Classement ATP | 153 | 59 % |
| Meilleur Elo | 143 | 55 % |
| **Monte Carlo** | **136** | **53 %** |
| Aléatoire | 120 | 46 % |

## Limite importante

**Le modèle n'est pas systématiquement supérieur.** Il gagne nettement sur
Madrid, il perd sur Roland-Garros face au simple classement ATP.

Raisons de l'écart sur RG :
- tournoi à surprises (Sinner sorti au R64, Djokovic battu, Shelton éliminé)
- le bo5 amplifie le poids des écarts Elo, donc les erreurs sur les favoris
- les Elo proviennent de tournois en bo3, qui ne mesurent pas l'endurance
  sur 3 sets gagnants

**Conclusion honnête** : sur deux tournois, l'optimiseur fait à peu près jeu
égal avec les heuristiques simples. Il faudrait une dizaine de backtests pour
trancher. Traite-le comme une aide à la décision, pas comme un oracle.

## Historique des corrections

| Version | Madrid | Ce qui a changé |
|---|---|---|
| V1 | 51 | glouton + pénalité de coût d'opportunité |
| V2 | 75 | exclusion des byes |
| V3 | 136 | affectation globale au lieu du glouton |
| V4 | 156 | Monte Carlo au lieu de la propagation analytique |

**Les byes** : picker un exempté rapporte 0 pt garanti.

**La pénalité de coût d'opportunité** : sans fondement avec un barème plat
à 5 pts. Elle coûtait 85 points.

**Le glouton** : épuise les favoris tôt, puis tombe sur des éliminés.
L'affectation hongroise résout les 12 slots simultanément.

**La propagation analytique** : les probabilités s'effondrent aux tours
tardifs, toutes les espérances tendent vers 0 et l'affectation n'a plus
d'information. Le Monte Carlo est robuste là où elle échoue.

## Insight stratégique

La victoire valant 5 pts partout, **la domination rapporte plus que la
profondeur de parcours** :

| Scénario (bo3) | Calcul | Total |
|---|---|---|
| 6-0 6-0 | 5 + 6 + 12 | 23 pts |
| 6-1 6-2 | 5 + 6 + 9 | 20 pts |
| 7-6 6-7 7-6 | 5 + 3 + 3 | 11 pts |
| Défaite 4-6 6-4 3-6 | 0 + 0 + 2 | 2 pts |

Espérance selon l'écart Elo : +0 → 8.75 pts, +200 → 13.50, +400 → 16.67.

→ **Cibler les mismatches, pas les affiches.**

## Sources de données

**Tableaux** — bookmarklet ATP fourni. Si le favori Chrome ne se déclenche
pas (stripping du préfixe `javascript:` ou CSP), utiliser un **snippet**
Chrome : F12 → Sources → Snippets → coller `bookmarklet-atp.js` → Ctrl+Enter.
Le snippet est persistant et immunisé contre ces deux problèmes.

⚠️ Toujours vérifier que l'URL contient `/archive/` et non `/current/`,
sinon on extrait l'édition en cours au lieu de celle recherchée.

**Elo** — calculés depuis tes propres imports via `calculerElos()`.

⚠️ Le repo `JeffSackmann/tennis_atp` renvoie 404 sur tous ses CSV, testé
depuis deux réseaux différents en juillet 2026. Ne pas bâtir dessus.

## Scripts

| Script | Usage |
|---|---|
| `validate.ts` | Valide le scoring (7/7) et le hongrois |
| `compute-elo.ts` | Calcule les Elo depuis `tournois/*.json` |
| `backtest.ts` | Backtest Madrid, Elo estimés |
| `backtest-mc.ts` | Backtest Madrid, Monte Carlo |
| `backtest-rg.ts` | Backtest Roland-Garros, bo5 |
| `testbo5.ts` | Vérifie le scoring en best of 5 |

Depuis la racine du projet `tennis` (ou depuis `recherche/`, au choix) :

```bash
npx tsx recherche/validate.ts      # scoring 7/7 + hongrois
npx tsx recherche/backtest-mc.ts   # Madrid
npx tsx recherche/backtest-rg.ts   # Roland-Garros
npx tsx recherche/compute-elo.ts   # ÉCRASE recherche/elos.json (+ elos-supabase.sql)
```

⚠ `compute-elo.ts` réécrit `elos.json` avec le moteur à jour : les backtests
ne compareront alors plus avec les résultats ci-dessus. Il écrit aussi
`elos-supabase.sql`, des `update tn_players …` qui **écraseraient les Elo de la
base de production** si on les collait dans l'éditeur SQL. Ne le faire qu'en
connaissance de cause.

Le bookmarklet (`bookmarklet-atp.js`) cité plus haut n'a pas été rapatrié : il
reste dans l'archive `tennis-picks`.

## Pistes d'amélioration

1. **Elo bo3 / bo5 séparés** — l'endurance sur 5 sets est une compétence distincte
2. **Blend avec les cotes** — fait depuis dans l'application (`blendAvecCotes`,
   `lib/elo.ts`, cotes dans `tn_odds`)
3. **Plus de backtests** — deux tournois ne suffisent pas à trancher
4. **Bookmarklet WTA** — structure DOM différente
