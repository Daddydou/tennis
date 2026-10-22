# Elo maison — protocole et résultats

État au 22/10/2026. Scripts dans ce dossier ; données hors dépôt
(`C:\Users\lolor\Projets\_donnees`).

## Données

| Source | Période | Contenu |
|---|---|---|
| Archive Jeff Sackmann (CC BY-NC-SA 4.0, copie Hugging Face `Aneeshers/tennis-sackmann-archive`, le dépôt GitHub d'origine n'existe plus) | 1990 → début juin 2026 | ATP et WTA, tous niveaux : Grand Chelem, Masters/1000, circuit, Finals, Coupe Davis/BJK, qualifications, Challengers/WTA 125, Futures/ITF |
| API tennis (Matchstat, RapidAPI) | juin 2026 → hier | ATP et WTA, circuit + Challengers + ITF ≥ 35 K (pas les Futures/ITF 15-25 K), en cours de téléchargement (50 requêtes/jour) |

1 539 849 matchs, 137 705 joueurs. Forfaits écartés (aucune information sur
le niveau). Joueurs de l'API rattachés à l'archive par le nom complet et le
pays (97 % des joueurs ATP, 85 % WTA ; les autres sont de nouveaux joueurs).

## Protocole

Les notes sont calculées **en continu de 1990 à aujourd'hui**, sur tous les
niveaux. Chaque match est **prédit avant** de mettre à jour les notes : la
prédiction ne voit jamais le résultat.

Seules les prédictions des matchs du **circuit principal** (tableau final :
Grand Chelem, Masters/1000, circuit, Finals ; ATP + WTA) entrent dans les
scores — ce sont ceux que prédit l'app.

| Période | Rôle |
|---|---|
| 2008-2017 (46 567 matchs) | **Entraînement** : réglage des paramètres |
| 2018-2021 (16 010) | **Validation** : arrêt précoce du réglage, recalibrage, ablation |
| 2022 → juin 2026 (21 287) | **Test** : mesuré une seule fois, à la fin |

Mesures : log-loss (critère principal, punit les erreurs commises avec
assurance), score de Brier, exactitude (le favori gagne).

Réglage : descente coordonnée sur 20 paramètres (un à la fois, autour de la
meilleure valeur, jusqu'à stabilité), en ne retenant que les étapes qui
améliorent aussi la validation (sinon on apprend le bruit de 2008-2017 :
observé dès la 4e passe).

## Modèle retenu

Note générale + note par surface (dur, terre, gazon, moquette), comme
FiveThirtyEight et Tennis Abstract, avec :

| Brique | Valeur retenue |
|---|---|
| Facteur K | 250 / (n + 8,8)^0,4, plancher 24,75 |
| Poids de la surface à la prédiction | **0,40** (l'app utilise 0,60) |
| K par niveau | GC ×1,1 · Masters ×0,9 · circuit ×1 · Finals ×0,72 · Challenger ×0,8 · Futures/ITF ×1,21 · qualifs ×1,1 · Davis ×0,9 |
| Marge de victoire (part de jeux gagnés) | ×(1 + 0,77 × (2 × part − 1)) |
| Abandons | poids 1,25 |
| 3 sets gagnants | probabilité convertie via la probabilité de gagner un set |
| Échelle logistique | 507, puis recalibrage c = 0,863 ajusté sur la validation |

Testées et **sans effet** (non retenues) : apprentissage croisé entre
surfaces, poids de surface selon l'expérience, note de départ selon le
classement, K augmenté au retour de blessure, moquette fusionnée avec le dur.

## Résultats sur le TEST (2022 → juin 2026, jamais vu pendant le réglage)

Même échantillon pour les trois méthodes (matchs dont le classement des deux
joueurs est connu).

| | n | Log-loss | Brier | Exactitude |
|---|---|---|---|---|
| **Elo maison** | 21 287 | **0,6038** | **0,2092** | **66,3 %** |
| Elo FiveThirtyEight (paramètres publiés) | 21 287 | 0,6075 | 0,2107 | 66,0 % |
| Classement ATP/WTA seul | 21 287 | 0,6329 | 0,2215 | 63,5 % |

Détail : ATP 0,6067 (538 : 0,6114) · WTA 0,6007 (538 : 0,6033) · Grand
Chelem 0,5468 (538 : 0,5506).

Calibration (test) : quand l'Elo maison donne 70-75 % au favori, il gagne
73,5 % du temps ; 80-85 % → 83,1 % ; 50-55 % → 52,1 %. Sans le recalibrage,
le modèle était trop sûr de lui (67,5 % annoncés pour 63,9 % réels) : le
tennis récent est un peu plus imprévisible que 2008-2017.

## Ce qui compte (ablation, validation 2018-2021)

Perte de log-loss quand on RETIRE une brique :

| Retirer… | Perte |
|---|---|
| les Challengers et qualifications | **+0,0156** |
| les Futures / ITF | +0,0046 |
| poids de surface 0,6 au lieu de 0,4 | +0,0025 |
| la marge de victoire | +0,0014 |
| le plancher de K | +0,0007 |
| les abandons pondérés | +0,0003 |
| la conversion 3 sets gagnants | +0,0002 |
| le K par niveau | +0,0001 |

Leçon principale : **l'historique des petits tournois compte plus que tous
les réglages fins**. Un Elo calculé sur les seuls tournois du circuit (ce que
faisait l'ancien « Elo maison » de l'app) est nettement moins bon.

## Comparaison préliminaire avec Tennis Abstract (22/10/2026)

759 matchs de l'app depuis fin juillet, trou de l'archive comblé seulement avec les
matchs du circuit (pas encore Wimbledon ni Challengers) — `resultats/comparaison-2026-10-22.txt` :
Tennis Abstract 0,6091 de log-loss, maison 0,6035 (écart −0,0056, IC 95 % [−0,0162 ; +0,0051],
non significatif). ATP ≈ égalité, WTA plutôt en faveur de la maison. Sur les 334 matchs avec
cotes : TA 0,6102, maison 0,6154, marché 0,5934 — le marché reste devant les deux.
À refaire une fois le trou comblé (`comparer.mts`).

## Intégration dans l'app

- `lib/eloMaison.ts` : le moteur (pur, testé), paramètres de production figés.
- Migration `0028` : `tn_elo_maison` (une ligne par joueur, colonnes `elo_*` au format
  `ta_elo`, transformées par `colonnesApp` pour que le mélange 0,6/0,4 et l'échelle 400 de
  l'app redonnent exactement les probabilités maison recalibrées) et `tn_elo_maison_suivi`.
- `amorcer.mts --ecrire` : rejoue tout l'historique et écrit les notes (service role).
- `db/eloMaison.ts` : à chaque passage du cron (après les tableaux), les résultats de la
  veille, tous niveaux, ≈ 1 à 3 requêtes API par circuit et par jour. Plus de 10 jours de
  retard → statut `en_retard`, ré-amorcer plutôt que rattraper.
- `db/elo.ts` : `SOURCE_ELO=maison` (Vercel) fait lire `tn_elo_maison` à la place de `ta_elo` ;
  vide ou `ta`, rien ne change. Repli automatique sur Tennis Abstract si la table est vide.

## Reste à faire

1. Finir de combler juin → octobre 2026 avec l'API (≈ 50 requêtes, 2 jours).
2. Refaire la comparaison maison / Tennis Abstract / marché sur ces données complètes.
3. Appliquer la migration 0028, amorcer (`amorcer.mts --ecrire`), puis choisir la source.

## Reproduire

```bash
node recherche/elo-maison/telecharger.mjs                       # archive (≈ 280 Mo)
node --env-file=.env.local recherche/elo-maison/combler-api.mjs 20   # trou récent, 20 requêtes max
node --max-old-space-size=6144 recherche/elo-maison/optimiser.mts    # ≈ 10 min
node --max-old-space-size=6144 recherche/elo-maison/evaluer.mts
node --max-old-space-size=6144 recherche/elo-maison/ablation.mts
```

Sources : archive de Jeff Sackmann (tennis_atp, tennis_wta) ; FiveThirtyEight,
« How We're Forecasting The 2016 U.S. Open » (facteur K) ; Angelini, Candila
& De Angelis (2022), « Weighted Elo rating for tennis match predictions »,
*European Journal of Operational Research* (marge de victoire).
