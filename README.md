# Picks Tennis

Jeu de picks tennis personnel, mono-utilisateur. Next.js 16 (App Router) +
Supabase + Tailwind v4.

## Principe

À chaque tour d'un tournoi, on « pique » des joueurs. Barème : 5 pts par match
gagné, net sets ×3 (plancher 0), net games sur les sets gagnés uniquement. Un
joueur ne peut être pické **qu'une seule fois** sur tout le tournoi — c'est la
contrainte structurante du jeu. 12 picks par tournoi (2 par tour jusqu'aux quarts,
puis 1 en demi et 1 en finale).

Le moteur (`lib/`) est fourni tel quel et n'est pas modifié : scoring, Elo par
surface, simulation Monte Carlo, affectation optimale (algorithme hongrois),
parser du JSON du bookmarklet.

## Démarrer

```bash
npm run dev      # http://localhost:3000
```

Variables d'environnement (`.env.local`) :

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...      # publique : lecture seule, inlinée dans le bundle
SUPABASE_SERVICE_ROLE_KEY=...          # SECRET : jamais préfixée NEXT_PUBLIC_
APP_PASSWORD=...                       # mot de passe unique d'accès à l'app
AUTH_SECRET=...                        # signature du cookie (sinon dérivé d'APP_PASSWORD)
```

Modèle complet dans `.env.example`.

## Accès à l'app

L'app entière est privée derrière un **mot de passe unique** (`APP_PASSWORD`).
`proxy.ts` — le `middleware.ts` de Next 16 — redirige vers `/login` toute requête
sans cookie de session valide, et répond **401** sur `/api/*` et sur les Server
Actions, où une redirection HTML serait illisible.

Le cookie `tn_session` est `httpOnly`, `SameSite=Lax`, `secure` en production, et
signé en HMAC-SHA256 : il ne contient qu'une expiration, elle-même dans la charge
signée — donc non modifiable côté client. Rien n'est stocké en base.

**Le proxy n'est pas la ligne de défense principale.** La doc Next 16 est
explicite : une Server Action n'est pas une route, c'est un POST vers la route qui
l'héberge, qu'un changement de matcher peut sortir de la couverture du proxy sans
bruit. Chaque écriture revérifie donc la session elle-même via `auth/garde.ts` —
`importerExtrait`, `validerPick`, `supprimerPick`, `POST /api/recompute`.

```bash
npm run build && npm start
npm run verify:auth            # 401 sans cookie, cookie signé, contournements
```

## Sécurité de la base

Les tables `tn_*` sont en **lecture publique / écriture service-role** :

```bash
# 1. Appliquer une fois les migrations (SQL editor Supabase, ou psql)
#    supabase/migrations/0001_rls_lecture_publique.sql
#    supabase/migrations/0002_elo_tennis_abstract.sql   (tables ta_elo, ta_name_exceptions)
#    supabase/migrations/0003_elo_identite_par_slug.sql (identité TA par slug — vide ta_elo)
#    supabase/migrations/0004_exceptions_par_circuit.sql (clé d'exception = nom + circuit)
#    supabase/migrations/0005_fantasy.sql               (table de cache tn_fantasy)
#    supabase/migrations/0006_fantasy_a_priori.sql      (cache fantasy sans from_round)
#    supabase/migrations/0007_fantasy_historique.sql    (table tn_fantasy_historique)
#    supabase/migrations/0008_cotes.sql                 (cache tn_odds, cotes bookmakers)
#    supabase/migrations/0009_statut_in_progress.sql    (statut in_progress, tableaux en direct)
# 1 bis. Après 0003, repeupler ta_elo depuis /import/elo (la migration la vide,
#        et seul un import la remplit — slug compris).

# 2. Vérifier depuis la clé publique : lecture OK, écritures et RPC refusées
npm run verify:rls
```

Tant que la migration n'est pas appliquée, les pages s'affichent **vides** : les
lectures se font désormais avec la clé publique, que la RLS filtre à 0 ligne.

## Écrans

- `/import` — coller le JSON du bookmarklet ATP **ou WTA** (même format, au champ
  `tour` près). `parseExtract()` + `verifierExtraction()`, puis **upsert** dans
  `tn_tournaments`, `tn_players`, `tn_matches` (réimportable après chaque tour).
  Le circuit du tournoi décide du rapport Elo interrogé : un tableau WTA n'est
  jamais rapproché des joueurs ATP, et inversement.
- `/import/elo` — **mise à jour des Elo Tennis Abstract, par collage**. Tennis
  Abstract répond **403** aux requêtes venant des IP de datacenter (Vercel) :
  le fetch serveur n'aboutit plus en production, alors que la page s'ouvre
  normalement dans un navigateur. C'est donc le navigateur qui lit le rapport —
  snippet `public/extract-elo.js`, servi par l'app (derrière le mot de passe) et
  copiable en un clic depuis l'écran — et l'app qui reçoit le JSON par collage,
  `POST /api/elo/import`. Un circuit à la fois, ou les deux en collant
  `[extraitAtp, extraitWta]`. L'écriture en base est **rigoureusement la même**
  que celle du fetch (mêmes lignes, même upsert par `(ta_slug, tour)`, mêmes
  caches invalidés) : seule la source change.
  `POST /api/elo/refresh` est **conservé en repli** — inutilisable depuis
  Vercel, mais fonctionnel en local, et prêt à resservir si le filtre tombe. Le
  bouton « Tenter le fetch serveur » est en bas de l'écran.
- `/tournoi/[id]` — vue du tableau tour par tour (lecture seule).
- `/tournoi/[id]/bracket` — **arbre pronostiqué depuis le tirage**, du premier
  tour au champion. Pronostic *déterministe* : à chaque match, le plus haut
  **Elo effectif** sur la surface du tournoi (mélange 60/40, le même que
  l'écran Picks et que la simulation) l'emporte et avance ; un exempté passe
  sans match. À Elo strictement égal, le mieux classé ; à rang égal, un
  départage stable par identifiant, pour que deux affichages ne donnent jamais
  deux champions. Aucun Monte Carlo — un simple parcours de l'arbre, calculé à
  chaque affichage (quelques millisecondes).
  **Ni `winner_id` ni les scores ne sont lus** : seul `rounds[0]` alimente le
  calcul, la suite est déduite. L'arbre est donc identique que le tournoi soit
  à venir, en cours ou terminé — même parti pris que l'espérance Fantasy. Il
  n'y a rien à invalider, et un tour intermédiaire manquant en base ne
  l'empêche pas de se remplir.
  Rendu pensé pour le téléphone : un tour à la fois (sélecteur de tours),
  duels en liste verticale, filtre par moitié de tableau au-delà de 4 duels, et
  la carte du champion prédit avec son parcours tour par tour en tête d'écran.
  La logique vit dans `lib/bracket.ts`, module pur sans I/O.
- `/tournoi/[id]/picks` — écran principal : par tour, deux colonnes (moitié haute /
  basse), joueurs triés par espérance de points, adversaire du tour, joueurs déjà
  pickés grisés. Validation → `tn_picks`.
- `/tournoi/[id]/fantasy` — **second jeu**, à côté des picks et sans interaction
  avec eux : une équipe composée **une seule fois avant le coup d'envoi**, puis
  figée — un joueur par palier de classement (5 en Grand Chelem, 4 ailleurs).
  Chaque joueur y marque sur *tous* ses matchs, au même barème, pondéré par un
  multiplicateur croissant selon le tour. L'écran propose la composition
  optimale, le détail tour par tour au clic, et le total de l'équipe.
  **Espérance a priori** : la simulation part toujours du tirage, tableau
  complet, et n'injecte aucun résultat réel — la question posée est « quelle
  équipe fallait-il composer au vu du tirage », pas « que rapportera-t-elle
  compte tenu de ce qui est joué ». Le résultat est donc identique que le
  tournoi soit à venir, en cours ou terminé. Lit le même cache
  `tn_projections` que les picks, sur le premier tour.
  À côté de l'espérance, l'écran affiche le **score réel de cette même équipe
  figée** — ce qu'elle a marqué sur les résultats importés, joueur par joueur,
  tour par tour et en total. C'est une mesure, jamais un critère : la
  composition ne tient aucun compte des résultats.
  **Le bye vaut une victoire 6/4 6/4** — 5 (victoire) + 6 (net sets) + 4 (net
  games) = 15 points, multipliés par le coefficient du tour où il tombe.
  Règle propre au Fantasy : aux picks, un bye reste à 0 point, et `lib/scoring.ts`
  n'est pas touché. Comme l'exemption est acquise au tirage, elle entre en
  espérance comme un **gain certain** (présence 100 %, aucune simulation), et
  au même montant dans le score réel — sans quoi l'écart prédit/réalisé
  s'ouvrirait sur une différence de convention.
- `/fantasy` — **historique prédit / réalisé**, un tournoi par ligne. Écrit à
  chaque import ; le bouton « Reprendre les tournois déjà en base » rattrape
  l'existant (`POST /api/fantasy/backfill`, borné dans le temps, à recliquer
  tant qu'il reste des tournois). La synthèse ne porte que sur les tournois
  **terminés** — un tournoi en cours a un score tronqué qui tirerait la moyenne
  vers le bas. **Collecte seulement** : aucun paramètre du modèle n'est dérivé
  de ces chiffres, ni aujourd'hui ni automatiquement demain. Sur quelques
  tournois, l'écart est dominé par le bruit ; s'y ajuster serait du
  sur-apprentissage. On accumule pour pouvoir regarder, et décider à la main.
- `/calibration` — la courbe Elo → probabilité du moteur
  (`P = 1 / (1 + 10^(−Δ/400))`, cf. `pVictoire` dans `lib/elo.ts`) confrontée à
  tous les matchs terminés en base : fréquence réelle de victoire du favori par
  tranche d'écart d'Elo, face à la probabilité prédite, plus la constante qui
  minimise l'écart. Le favori est celui au plus haut **Elo effectif**, pas la
  tête de série. Tranches sous 20 matchs signalées « non significatif » et
  exclues de l'ajustement. **Mesure seulement** : `lib/elo.ts` n'est pas touché.
  Réserve importante, rappelée sur la page : les Elo utilisés sont les Elo
  actuels, qui intègrent le résultat des matchs testés — la fréquence de
  victoire du favori en ressort surestimée et la constante ajustée, plus basse
  que la vraie. Même sortie en JSON via `POST /api/calibration/elo`.
- `/calibration/echelle` — le même choix, jugé sur ce qui compte pour l'app :
  pour chaque échelle candidate (400, 370, 350, 305), on **rejoue** chaque
  tournoi terminé (simulation, espérances, composition de l'équipe, score réel
  de cette équipe) et on affiche l'écart prédit/réalisé, global et par
  catégorie (GC / M1000 / autres). La colonne « pire catégorie » sert de
  garde-fou : une échelle peut annuler l'écart global en compensant une
  catégorie trop optimiste par une autre trop pessimiste. Déclenché au bouton
  (une simulation par tournoi ET par échelle), `POST /api/calibration/echelle`.
  Même réserve de circularité, et **même corpus** que `/calibration` : ce n'est
  pas une seconde preuve, c'est la même vue autrement.
- `/calibration/cotes` — **le blend Elo / cotes, mesuré avant d'être branché.**
  Trois méthodes concourent sur les mêmes matchs : Elo seul, cotes seules, et
  leur mélange 50/50 (`blendAvecCotes`, `lib/elo.ts`). Chacune est jugée au
  **score de Brier** et à la **log-loss**, tous deux « plus bas = mieux » — les
  deux sont affichés parce que la log-loss punit bien plus durement une
  prédiction confiante et fausse. **Rien n'est branché** : ni les picks, ni le
  fantasy, ni la simulation ne lisent ces cotes.
  Source : The Odds API v4, clé dans `ODDS_API_KEY` (variable d'environnement,
  jamais dans le code). Les probabilités sont **dévigorisées** (1/cote puis
  normalisation à somme 1, ce qui retire la marge du book) et agrégées par la
  **médiane** des bookmakers — un book en retard sur une blessure déplacerait
  une moyenne, pas une médiane. Le rapprochement des noms réutilise
  `lib/matching.ts` ; une rencontre non appariée est **affichée et exclue du
  score**, jamais ignorée en silence.
  **Quota et fenêtre de capture.** Le palier gratuit plafonne à 500 requêtes par
  mois : seul le bouton « Récupérer les cotes » appelle l'API (1 crédit :
  un marché, une région), l'affichage ne lit que le cache `tn_odds`. Surtout,
  ce palier ne sert que les rencontres **à venir ou en cours** — l'historique
  est payant. Une cote doit donc être capturée AVANT que le match ne se joue ;
  sur un tournoi déjà terminé sans capture préalable, il n'y a rien à
  récupérer, et l'écran le dit.
- `/tournoi/[id]/predictions` — « bracket prédit » : pour chaque joueur encore en
  lice, P(atteindre chaque tour restant) et P(titre), triées par probabilité de
  titre décroissante. Lit le même cache `tn_projections` que l'écran picks — rien
  n'est resimulé si les picks ont déjà été affichés.
- `/tournoi/[id]/resultats` — points par pick (match / net sets / net games) et
  total du tournoi. Bouton « Recalculer » → `/api/recompute`.
  À côté du total, le **score de référence** : ce qu'auraient rapporté les picks
  si l'on avait suivi l'app à la lettre. À chaque tour on prend la (les)
  recommandation(s) de l'écran Picks — espérance de points maximale parmi les
  survivants réels, deux par tour tant que le tableau a deux moitiés, une seule
  en demies et en finale — sous la **même contrainte d'unicité** que le jeu :
  un joueur déjà pris descend d'un cran dans l'ordre des espérances, et un tour
  dont tous les survivants sont utilisés reste vide (« aucun pick possible »,
  exactement comme dans le jeu réel). Le total est la somme de leurs points
  **réels** ; un match indécis vaut 0, comme pour le score de l'utilisateur.
  Détail tour par tour au clic, avec le pick réel en regard.
  **Lecture seule** : ni les picks ni le score ne sont modifiés. Les espérances
  viennent du **même cache `tn_projections`** que l'écran Picks (une entrée par
  tour de départ), donc aucune divergence possible avec ce que l'app affichait.
  Seuls les tours effectivement joués comptent, ce qui borne le calcul ; il est
  malgré tout **rendu en flux** (`<Suspense>`) — sur un tableau de 128 au cache
  froid, il faut une simulation par tour (une quinzaine de secondes) et le reste
  de la page ne doit pas l'attendre.
- `POST /api/recompute` — appelle la fonction Supabase `tn_recompute_picks()`.

## Décisions d'architecture

Ces points s'écartent légèrement de l'énoncé, pour des raisons dictées par la base
et par Next.js 16 :

- **Séparation lecture / écriture des clés Supabase.** Les lectures passent par la
  clé publique (`supabase/anon.ts`), adossée à des policies RLS
  `for select to anon using (true)` sur les 5 tables `tn_*` : ce client ne peut
  rien modifier, et reste donc utilisable jusque dans le navigateur. Les écritures
  (import, picks, cache de projections, `tn_recompute_picks`) passent par la
  `SUPABASE_SERVICE_ROLE_KEY` (`supabase/server.ts`), qui contourne RLS et ne vit
  que côté serveur — le module porte `import 'server-only'`, ce qui casse le build
  s'il est atteint depuis un Client Component. Aucune policy insert/update/delete
  n'existe : même volée, la clé publique ne permet aucune écriture.
- **Espérances par simulation Monte Carlo** plutôt que par propagation analytique,
  qui s'effondrait aux tours tardifs (espérances → 0, slots de picks laissés
  vides). L'écran picks simule **à partir du tour affiché** (`simulerDepuis`,
  20 000 runs) : seuls les survivants réels de ce tour sont simulés — un joueur
  déjà éliminé n'apparaît plus comme candidat. Le résultat est **mis en cache dans
  `tn_projections`, indexé par `from_round`** (E[pts] + P d'avancer). L'import
  invalide tout le cache du tournoi puis préchauffe le tour courant ; les autres
  tours sont simulés à la demande au premier affichage. Voir
  `supabase/projections.ts`.
- **Slots sans pick possible.** À un tour donné, si tous les survivants d'une
  moitié ont déjà été pickés, le slot ne peut littéralement pas être rempli —
  état valide du jeu (un joueur ne sert qu'une fois), pas une erreur. Ces slots
  sont détectés par `etatsSlots()` à partir des **matchs réels** (pas des
  projections : la disponibilité est un fait du tableau, et il faut pouvoir la
  calculer sur tous les tours sans lancer une simulation par tour). Ils sortent
  du décompte « requis » du tour, qui devient donc complétable. Un tour dont les
  joueurs ne sont pas encore connus n'est pas « impossible », seulement
  indéterminé.
- **Le calcul des points est découplé de la validation des tours.**
  `tn_recompute_picks` scorait déjà chaque pick contre son match, sans notion de
  tour complet — mais il n'était appelé que par le bouton « Recalculer » de
  l'écran Résultats. Des picks dont le match était terminé restaient donc à
  `points = null`. `recalculerPoints()` est désormais appelé à l'import (arrivée
  des résultats) et à chaque validation/suppression de pick ; le bouton n'est
  plus qu'un filet de sécurité.
- **P(titre) ajoutée au moteur.** `presence` ne couvre que « jouer un tour » : la
  finale y figure, la gagner non — la boucle de simulation s'arrête dès qu'il ne
  reste qu'un joueur. `simulerTournoi` crédite désormais le dernier survivant de
  chaque simulation (`titres`), seul ajout au moteur fourni ; aucune sortie
  existante ne change. Vérifié : Σ P(titre) = 1, Σ P(finale) = 2, et
  P(titre) ≤ P(finale) pour chaque joueur. La valeur est stockée dans
  `tn_projections` sous le pseudo-tour `TITRE`, hors de `tournament.rounds` pour
  rester invisible de l'optimiseur.
- **Référentiel des tournois (`lib/calendrier.ts`)** pour la surface, la catégorie
  et la date de début. Il remplace `devinerSurface(slug, mois)`, dont le repli
  calendaire recevait le mois de l'**extraction** et non celui du tournoi :
  importer un tableau en juillet classait l'Australian Open sur gazon (15 des 22
  tournois en base étaient faux). L'extraction du bookmarklet ne portant aucune
  date, `start_date` — colonne déjà présente au schéma mais jamais remplie — est
  reconstituée depuis la semaine ISO habituelle du tournoi. `npm run
  backfill:tournois` corrige les lignes existantes (aperçu par défaut,
  `--appliquer` pour écrire), noms d'affichage compris, et liste les slugs
  qu'il ne reconnaît pas.
- **Les clés du calendrier WTA sont les slugs réels de wtatennis.com**, relevés
  dans `/sitemap/tournaments.xml` — pas les noms courants. Le site emploie deux
  formes d'URL, `/tournaments/{slug}/draws` pour les Grands Chelems et les
  1000, `/tournaments/{id}/{slug}/{annee}/draws` pour le reste : d'où
  `canadian-open` (et non montreal), `china-open` (et non beijing),
  `miami-open`, `madrid-open`, `cincinnati-open`, `wuhan-open`. Surface,
  catégorie et semaine viennent de l'API publique de la WTA, calendrier 2026 ;
  les noms courants et les variantes d'une saison à l'autre restent acceptés
  via `ALIAS_WTA`. Un slug de WTA 125 (`madrid-125`) n'hérite jamais de la
  fiche du tournoi principal de la même ville : mieux vaut un tournoi non
  reconnu, donc signalé, qu'un WTA 125 classé WTA 1000.
- **Identité du tournoi retrouvée dans l'URL source.** Le bookmarklet WTA ne
  renseigne ni `tournament.slug`, ni l'identifiant, ni l'année : ses imports
  arrivaient en « Tournoi 2026 », sans surface ni catégorie, et — faute de clé
  — une ligne de plus à chaque réimport. `identiteDepuisUrl` les relit dans
  `source_url` (le champ explicite prime toujours). Le premier segment
  numérique est l'identifiant, les suivants l'année : les identifiants WTA
  récents (2014 Adélaïde, 2088 Abu Dhabi) ressemblent à des années, seule leur
  position les distingue.
- **Un slug inconnu s'affiche brut et se signale.** « wuhan-open 2026 » dans la
  liste des tournois dit quelle fiche ajouter ; « Tournoi 2026 » ne disait
  rien. L'import le remonte dans ses avertissements — surface, catégorie et
  date ne sont alors que des défauts — et le journalise côté serveur avec
  l'URL source.
- **Elo : source externe Tennis Abstract, avec repli — deux niveaux, pas trois.**
  `ta_elo` reçoit les rapports hebdomadaires de Tennis Abstract (~540 joueurs par
  circuit, Elo global + dur/terre/gazon). `resoudreElos` (`supabase/elo.ts`) écrit
  une cascade à trois étages — TA, puis Elo maison, puis défaut — mais **l'étage
  du milieu n'est jamais atteint** : en pratique la cascade est
  **TA → défaut (1650)**.

  La raison tient à ce qui alimente `tn_players` : l'import de tableau n'y écrit
  que l'identité (id, circuit, nom, pays). Il n'écrit **ni `rank`, ni les
  colonnes `elo_*`**, et rien d'autre ne les alimente — le code qui calculerait
  les Elo maison n'est pas branché (voir plus bas). Sur la base actuelle :
  `rank` est NULL sur les 365 lignes, 96 lignes portent encore un `elo_*`
  hérité, et ces 96-là sont toutes appariées à Tennis Abstract, qui prime. Sur
  1 404 résolutions (tous tournois confondus) : **1 388 TA, 0 maison, 12 défaut,
  4 ambigus**.

  **Conséquence à connaître.** Un joueur non apparié dans Tennis Abstract ne
  tombe pas seulement à 1650 : il se retrouve aussi **sans rang**, puisque le
  rang affiché vient de `ta_elo.atp_rank` (`p.rank ?? e.rangTa`, cf.
  `rowsToPlayers`). Or `estEligible` (`lib/fantasy.ts`) rejette un rang nul :
  ces joueurs sont donc **inéligibles à tous les paliers Fantasy**. C'est ce qui
  explique les équipes à 3 paliers pourvus sur 4 de Marrakech, Hong Kong et
  Adélaïde. Aujourd'hui 16 joueurs sont dans ce cas sur l'ensemble des tournois.

  Tennis Abstract ne publiant pas d'ID ATP, le rapprochement se fait par nom
  normalisé (`lib/matching.ts`) ; les cas irréductibles se déclarent dans
  `ta_name_exceptions`. L'écran Picks affiche l'Elo effectif de chaque joueur et
  sa source, pour repérer d'un coup d'œil une mauvaise correspondance — un badge
  « défaut » y signale exactement un joueur tombé au bout de cette cascade.
- **Le calcul d'Elo maison existe mais n'est pas branché.** `calculerElos`,
  `majElo`, `nouvelEloRecord` et `facteurK` (`lib/elo.ts`) forment une chaîne
  complète pour recalculer des Elo match par match depuis les tournois importés.
  **Aucune n'est appelée**, ni par l'app ni par un script : elles subsistent en
  réserve, pour le jour où l'on voudrait un repli entre Tennis Abstract et le
  défaut. Tant qu'elles ne le sont pas, l'étage « maison » de `resoudreElos`
  reste du code atteignable mais jamais emprunté — il ne se déclencherait que
  pour un joueur portant un `elo_*` hérité ET absent des rapports TA.
- **Les Elo arrivent par le presse-papier, comme les tableaux.** Tennis Abstract
  répond 403 aux requêtes venant des IP de datacenter : imiter les en-têtes d'un
  navigateur n'y change rien, c'est l'IP qui est filtrée, et le fetch serveur est
  donc mort en production. Plutôt que de chercher un contournement fragile
  (proxy, cache tiers), on reprend le chemin qui marche déjà pour les tableaux :
  un snippet lit la page **dans le navigateur**, l'app reçoit le JSON par
  collage. Le parsing des Elo et l'upsert ne sont écrits qu'une fois
  (`ecrireRapport`) — collage et fetch y convergent, si bien que le repli reste
  vérifiable en local sans code parallèle à maintenir.
- **Homonymes : l'identité est le slug TA, pas le nom.** « Andrej Martin » (SVK)
  et « Andres Martin » (USA) se normalisent tous deux en `a martin` ; le rapport
  Elo ne publie **aucun pays**, donc rien dans la source ne les départage.
  `ta_elo` est donc unique sur `(ta_slug, tour)` — le slug vient de l'URL TA
  (`player.cgi?p=AndresMartin`) — et les deux lignes coexistent. Le
  rapprochement d'un nom ambigu ne choisit **aucun** des deux : le joueur passe
  en source `ambigu` (badge violet), la valeur retombe sur le repli, et l'écran
  Picks affiche les candidats avec l'`insert` prêt à coller dans
  `ta_name_exceptions` (colonne `ta_slug`). Un Elo faux et silencieux est pire
  qu'un signalement.
- **Un match en cours est un match pas encore joué — une seule liste le dit.**
  Le bookmarklet marque `in_progress` les rencontres en train de se jouer sur un
  tableau en direct ; la contrainte `tn_matches_status_check` ne connaissait que
  `live`, et l'upsert étant atomique, importer Montréal WTA en cours perdait les
  **128 lignes pour 4 matchs sur le court**. `in_progress` est donc accepté au
  schéma (migration 0009) à côté de `live`, sans réécriture à l'import : la
  valeur stockée reste celle de la source.

  Ce qu'il vaut : **rien**. Pas d'issue connue, donc pas de vainqueur, pas de
  points (`scoreMatch` et `tn_score_match` le rendent à 0 comme un `scheduled`,
  ses sets partiels compris), pas d'entrée dans le score réel — picks comme
  fantasy — et un tournoi qui en contient un n'est pas terminé. La simulation le
  rejoue depuis zéro : à Elo égal, une joueuse menant 6-0 4-0 reste à 50 % de
  passer le tour, et le bracket, qui ne lit aucun résultat, ne bouge pas.

  La liste des statuts sans issue était **recopiée dans huit modules** ; c'est
  ce qui a fait mentir le code un fichier à la fois. Elle vit désormais dans
  `STATUTS_INDECIS` / `STATUTS_DECIDES` (`lib/types.ts`) et nulle part ailleurs.
  Par sécurité, l'import **neutralise le vainqueur** d'un match indécis (un
  tableau en direct peut désigner la joueuse qui mène) et `verifierExtraction`
  **nomme tout statut hors vocabulaire** plutôt que de laisser remonter une
  erreur SQL brute.
- **`best_of` et `surface`** déduits à l'import (`devinerBestOf`, `devinerSurface`),
  stockés sur `tn_tournaments` et propagés au scoring (un walkover en Grand Chelem
  masculin vaut 20 pts, pas 15) comme à la simulation.
- **Le schéma ne stocke pas la tête de série** (ni la moitié de tableau) sur
  `tn_players`. Après import, les structures du moteur (`Match[]`, `Player`) sont
  reconstruites depuis la DB (`supabase/queries.ts`) : la moitié se déduit du
  match de 1er tour ; la reconstruction est vérifiée identique à l'extraction en
  mémoire. La tête de série n'étant pas persistée, l'UI affiche le rang ATP quand
  il est connu.
- **Next.js 16** : `params` et `searchParams` sont des `Promise` (breaking change),
  d'où le `await` dans les pages.

## Tester

`madrid2026.json` (127 matchs, 96 joueurs) permet de tester l'import et tous les
écrans sans extraction fraîche : le coller dans `/import`.

## Structure

```
proxy.ts                         porte d'entrée : tout est privé sauf /login
auth/
  session.ts                     jeton signé HMAC (importable depuis proxy.ts)
  garde.ts                       contrôle de session dans les écritures
app/
  login/                         mot de passe unique → cookie de session
  page.tsx                       liste des tournois
  fantasy/                       historique prédit / réalisé + bouton de reprise
  calibration/                   courbe Elo→proba confrontée aux matchs joués
  calibration/echelle/           effet d'une autre échelle sur le jeu Fantasy
  calibration/cotes/             blend Elo/cotes — mesure isolée, rien de branché
  import/                        import du JSON + action serveur
  import/elo/                    collage des Elo TA (snippet public/extract-elo.js)
  tournoi/[id]/                  tableau, bracket, picks, fantasy, predictions, resultats
  tournoi/[id]/BadgeSourceElo.tsx  provenance d'un Elo — partagé picks/fantasy
  api/recompute/route.ts         POST → tn_recompute_picks()
  api/elo/import/route.ts        POST → Elo TA collés (méthode principale)
  api/elo/refresh/route.ts       POST → Elo TA par fetch (repli, 403 sur Vercel)
  api/fantasy/backfill/route.ts  POST → historique des tournois déjà en base
  api/calibration/elo/route.ts   POST → calibration Elo→proba, en JSON
  api/cotes/refresh/route.ts     POST → cotes The Odds API → cache tn_odds
  EloRefreshButton.tsx           bouton du repli par fetch (écran /import/elo)
supabase/
  anon.ts                        client clé publique — LECTURES uniquement
  server.ts                      client service-role (server-only) — ÉCRITURES
  queries.ts                     lectures + reconstruction Match[]/Player
  elo.ts                         cascade TA → défaut + sources (étage « maison »
                                 écrit mais jamais atteint, cf. plus haut)
  elo-refresh.ts                 collage OU fetch TA → ta_elo (server-only)
  projections.ts                 simulation Monte Carlo + cache tn_projections
  reference.ts                   score de référence : projections par tour puis
                                 lib/reference.ts (mémoïsé par requête)
  fantasy.ts                     espérances a priori, score réel, historique
  calibration.ts                 mesure de la courbe Elo→proba (lecture seule)
  comparaison-echelle.ts         rejoue le Fantasy sous d'autres échelles Elo
  migrations/                    RLS, ta_elo / ta_name_exceptions, tn_fantasy
scripts/verifier-rls.mjs         contrôle des accès avec la clé publique
scripts/verifier-auth.mjs        contrôle de la protection par mot de passe
scripts/appliquer-migration.mjs  joue un .sql via l'API Management Supabase
lib/                             moteur fourni (non modifié)
lib/fantasy.ts                   AJOUT : paliers, multiplicateurs, équipe optimale,
                                 score réel (réutilise optimizer/scoring/montecarlo
                                 tels quels)
lib/bracket.ts                   AJOUT : arbre pronostiqué depuis le tirage
                                 (déterministe, sans Monte Carlo ni résultats)
lib/cotes.ts                     AJOUT : dévigorisation, consensus des books,
                                 scores de Brier et log-loss (mesure seule)
lib/reference.ts                 AJOUT : picks recommandés tour par tour sous
                                 contrainte d'unicité, et leurs points réels
```

### Où corriger le barème de multiplicateurs

Les valeurs Grand Chelem sont officielles ; celles des Masters 1000 ne le sont
pas encore et sont **dérivées** du barème Grand Chelem, ramené au nombre de tours
du tournoi (premier tour ×1, finale ×2, progression régulière). Pour les corriger,
une seule ligne à ajouter dans `BAREMES_EXPLICITES` (`lib/fantasy.ts`) :

```ts
export const BAREMES_EXPLICITES: Record<string, readonly number[]> = {
  'GC:7': BAREME_GRAND_CHELEM,
  'M1000:7': [1, 1.15, 1.3, 1.5, 1.7, 1.85, 2],   // ← clé = famille:nombre de tours
};
```

Le cache `tn_fantasy` mémorise les multiplicateurs utilisés : changer le barème
le périme de lui-même, sans invalidation manuelle.

### Où corriger l'échelle Elo → probabilité

La constante de `pVictoire` vit dans **`ECHELLE_ELO` (`lib/elo.ts`)**, une seule
ligne dont dépend tout le moteur — simulation Monte Carlo comme propagation
analytique, qui appellent `pVictoire` sans surcharge :

```ts
export const ECHELLE_ELO = 400;   // ← hérité des échecs, jamais calibré tennis
```

`pVictoire`, `simulerMatch`, `simulerTournoi` et `simulerDepuis` acceptent un
paramètre `echelle` optionnel : il n'existe que pour les écrans de calibration,
qui rejouent le calcul sous d'autres valeurs **sans rien changer à la
production**. Omis, c'est toujours `ECHELLE_ELO` qui s'applique.

Après un changement, vider les caches dérivés (`tn_projections`, `tn_fantasy`) :
ils ont été calculés sous l'ancienne échelle. Un import d'Elo (`/import/elo`)
le fait déjà pour les deux.
