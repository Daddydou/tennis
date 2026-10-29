# Elo maison

Notes Elo calculées par nous (général + par surface) à partir de l'historique des matchs
depuis 1990, à la place des notes de Tennis Abstract (`ta_elo`). Choix de la source :
variable Vercel `SOURCE_ELO` (`maison` = notre Elo ; vide ou `ta` = Tennis Abstract).
Depuis le 23/10/2026 17 h 20 (Paris), la production tourne avec `SOURCE_ELO=maison`.

## Où est quoi

- `lib/eloMaison.ts` : le moteur (pur, testé). Note générale + note par surface, facteur K
  qui décroît avec l'expérience, multiplicateur selon le niveau du tournoi, marge de victoire,
  conversion bo5, recalibrage de Platt (c = 0,862). `colonnesApp` transforme les notes en
  colonnes au format `ta_elo` pour que le mélange 0,6 surface / 0,4 général et l'échelle 400
  de l'app redonnent exactement les probabilités maison.
- `lib/eloMaisonIdentites.ts` : départage des homonymes (pays, joueur dominant) et valeur par
  défaut d'un joueur inconnu à la bonne échelle (`ELO_DEFAUT_MAISON` : 2000 ATP, 2100 WTA ;
  l'ancien défaut 1650 appartenait à l'échelle Tennis Abstract).
- `lib/eloMaisonSuivi.ts` : règles du suivi quotidien (dernier jour complet, retard, gravité,
  réserve de quota API).
- `db/eloMaison.ts` : à chaque passage du cron, lit les résultats de la veille (tous niveaux)
  et met les notes à jour.
- `db/elo.ts` : `chargerIndexElo` (lecture de `tn_elo_maison` par pages de 1000, repli sur
  Tennis Abstract si vide).
- `recherche/elo-maison/` : amorçage, comparaisons, diagnostics (voir ci-dessous).

## Tables (migration 0028)

- `tn_elo_maison` : une ligne par joueur. Clé `ta_slug` : `ATP:s<id>` / `WTA:s<id>` pour un joueur
  de l'archive, `ATP:m<id>` / `WTA:m<id>` pour un joueur créé par l'API. Colonnes `elo_*` au
  format app, état du moteur (`note_*`, `n_*`, `dernier_jour`), `matchstat_id`, pays. Index unique
  sur (`tour`, `matchstat_id`).
- `tn_elo_maison_suivi` : dernier jour traité par circuit, statut (`ok`, `en_retard`, `erreur`).
- Lecture publique, écriture service role seulement (vérifié par `npm run verify:rls`).

## Mise à jour quotidienne et alertes

Le cron GitHub Actions (`0 0,6,12,18 * * *` UTC) appelle `/api/import-auto/run`. L'Elo maison
traite le jour complet précédent de chaque circuit (1 à 3 requêtes API). Un jour n'est lu que
10 h après sa fin en UTC, pour que les derniers matchs (fuseaux lointains) soient arrivés.

Le quota API (50 requêtes / 24 h glissantes, en-tête `x-ratelimit-requests-remaining`) est
partagé. Règles (détail et seuils dans `lib/eloMaisonSuivi.ts`) :

- retard normal : l'Elo passe après les tableaux et ne consomme qu'au-dessus d'une réserve de
  8 requêtes ;
- retard d'au moins 2 jours : l'Elo passe en premier, réserve réduite à 1 ;
- retard d'au moins 3 jours : l'étape est en `erreur`, donc le job GitHub échoue et un e-mail
  d'alerte part ;
- retard de plus de 10 jours : statut `en_retard` (traité comme une erreur) ; il ne faut plus
  rattraper jour par jour mais **ré-amorcer**.

## Ré-amorçage (rejouer tout l'historique)

`recherche/elo-maison/amorcer.mts` rejoue 1990 → hier à partir de l'archive de Jeff Sackmann
(`_donnees/sackmann`) et du cache API (`_donnees/api`), puis écrit `tn_elo_maison`.

- Sans option : aperçu, rien n'est écrit (liens API ↔ archive, contrôle des ambiguïtés).
- `--ecrire` : écrit en base. Garde-fou : refuse si le suivi en base est plus avancé que ce que
  couvrent les données locales (il faut alors `--forcer`). Avant d'écrire, sauvegarde JSON dans
  `_donnees/sauvegardes/`, déduplication sur `matchstat_id`, purge des lignes devenues obsolètes
  (celles que le nouvel amorçage ne produit plus), puis upsert par lots de 500.
- **L'archive Hugging Face est figée à juin 2026.** Avant tout ré-amorçage, relancer
  `combler-api.mjs` pour récupérer juin → aujourd'hui avec l'API (≈ 50 requêtes par 24 h, donc
  plusieurs jours), sinon les notes seront en retard de plusieurs mois.
- Prévenir l'utilisateur avant d'écrire : cela remplace les notes en production.

## Scripts de contrôle (lecture seule)

- `comparer.mts` : maison contre Tennis Abstract contre marché sur les matchs de l'app
  (log-loss, Brier, exactitude, intervalles bootstrap) et, depuis le 23/10, poids optimal du
  mélange Elo / cotes. Résultats datés dans `resultats/`.
- `diagnostic-echelle.mts` : compare les échelles des deux Elo (pour fixer le défaut).
- `verifier-resolution.mts` : vérifie de bout en bout que les joueurs de l'app trouvent une note
  maison (23/10 : 227/242 ATP, 191/195 WTA ; les vrais homonymes retombent sur le défaut).
- `optimiser.mts`, `evaluer.mts`, `ablation.mts` : réglage et évaluation du modèle (voir
  `RESULTATS.md`).

## Joueur sans Elo, ou « ambigu » : trouver le problème, puis poser un alias (migration 0030)

`npm run verify:elo-inconnus` (lecture seule) rejoue la résolution de l'Elo avec le vrai code pour les joueurs des tournois des 45 derniers jours (`-- --jours=120` pour plus). Il liste ceux qui retombent sur le défaut du circuit (ATP 2000 / WTA 2100) ou sur un homonyme ambigu, avec les lignes candidates de la table d'Elo (`ta_slug`).

Mesure du 29/10/2026 : 236 joueurs sur 245 trouvés (96 %) ; 4 inconnus, 5 ambigus (presque tous des noms chinois ou hongkongais).

Cause fréquente : **doublons d'identité dans `tn_elo_maison`**. L'archive écrit un même joueur de plusieurs façons (« Xin Yu Wang » / « Xinyu Wang », « Ye Xin Ma » / « Yexin Ma », « Coleman Wong » / « Chak Lam Coleman Wong ») ; quand le passage quotidien ne retrouve pas le joueur, il crée une ligne neuve (`TOUR:m<id>`, repartie de 1500) à côté de la ligne historique. Aucune ligne n'est supprimée : on dit à l'app laquelle est la bonne avec la table `tn_elo_maison_alias` (id du joueur de l'app → `ta_slug`), lue avant le rapprochement par le nom.

Poser un alias (service role, par exemple depuis l'éditeur SQL de Supabase) :

```sql
insert into tn_elo_maison_alias (player_id, tour, ta_slug, note)
values ('326376', 'wta', 'WTA:s216133', 'Xinyu Wang — ligne historique')
on conflict (player_id) do update set ta_slug = excluded.ta_slug, note = excluded.note;
```

Choisir la ligne : celle de la **bonne personne** (même pays, même prénom écrit autrement) ; entre une ligne historique figée (`dernier_jour` ancien) et une ligne récente née à 1500, préférer la ligne historique tant que la récente a peu de matchs (sa note est encore très basse), sinon la ligne récente (mise à jour chaque jour). Un alias vers une ligne absente est ignoré : le nom reprend la main. Cache de l'index : quelques minutes.

Piste de fond (non faite) : au moment de créer une ligne `TOUR:m<id>` (db/eloMaison.ts), tenter d'abord un rapprochement tolérant (noms collés, même pays, joueur actif) avec une ligne historique sans `matchstat_id`, au lieu de repartir de 1500.

## Pièges connus

- Doublons : un joueur peut exister côté archive (`s<id>`) et côté API (`m<id>`) ; les règles de
  rattachement (nom exact + pays normalisé, changement de nationalité, même famille de nom)
  sont dans `donnees.mts`. Les vrais homonymes restent ambigus (X. Wang, Blanch, Kennedy,
  Wong, Y. Lin, Y. Ma) et prennent la valeur par défaut.
- Seuls 1 327 joueurs ATP et 2 451 WTA ont un `matchstat_id` dans `tn_players` : le reste est
  rapproché par le nom (`lib/matching.ts`).
- `matchs_traites` du suivi vaut le nombre de matchs de l'amorçage pour un circuit ; il n'a pas de
  sens opérationnel (cosmétique).
