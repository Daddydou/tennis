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
# 1 bis. Après 0003, cliquer « Rafraîchir les Elo Tennis Abstract » : la
#        migration vide ta_elo, que seul l'import repeuple (slug compris).

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
- `/tournoi/[id]` — vue du tableau tour par tour (lecture seule).
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
- `/tournoi/[id]/predictions` — « bracket prédit » : pour chaque joueur encore en
  lice, P(atteindre chaque tour restant) et P(titre), triées par probabilité de
  titre décroissante. Lit le même cache `tn_projections` que l'écran picks — rien
  n'est resimulé si les picks ont déjà été affichés.
- `/tournoi/[id]/resultats` — points par pick (match / net sets / net games) et
  total du tournoi. Bouton « Recalculer » → `/api/recompute`.
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
  `--appliquer` pour écrire).
- **Elo : source externe Tennis Abstract, avec repli.** Les Elo maison (colonnes
  `elo_*` de `tn_players`) ne sont calculés que sur les tournois importés ici,
  donc bruités. `ta_elo` reçoit les rapports hebdomadaires de Tennis Abstract
  (~540 joueurs par circuit, Elo global + dur/terre/gazon), et la simulation
  applique la cascade **TA → maison → défaut (1650)** (`supabase/elo.ts`).
  L'import de tableau n'écrit toujours pas les colonnes `elo_*`.
  Tennis Abstract ne publiant pas d'ID ATP, le rapprochement se fait par nom
  normalisé (`lib/matching.ts`) ; les cas irréductibles se déclarent dans
  `ta_name_exceptions`. L'écran Picks affiche l'Elo effectif de chaque joueur et
  sa source, pour repérer d'un coup d'œil une mauvaise correspondance.
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
  import/                        import du JSON + action serveur
  tournoi/[id]/                  tableau, picks, fantasy, predictions, resultats
  tournoi/[id]/BadgeSourceElo.tsx  provenance d'un Elo — partagé picks/fantasy
  api/recompute/route.ts         POST → tn_recompute_picks()
  api/elo/refresh/route.ts       POST → import des Elo Tennis Abstract
  api/fantasy/backfill/route.ts  POST → historique des tournois déjà en base
  api/calibration/elo/route.ts   POST → calibration Elo→proba, en JSON
  EloRefreshButton.tsx           bouton de rafraîchissement (accueil)
supabase/
  anon.ts                        client clé publique — LECTURES uniquement
  server.ts                      client service-role (server-only) — ÉCRITURES
  queries.ts                     lectures + reconstruction Match[]/Player
  elo.ts                         cascade TA → maison → défaut + sources
  elo-refresh.ts                 récupération TA → ta_elo (server-only)
  projections.ts                 simulation Monte Carlo + cache tn_projections
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
ils ont été calculés sous l'ancienne échelle. Le bouton « Rafraîchir les Elo »
le fait déjà pour les deux.
