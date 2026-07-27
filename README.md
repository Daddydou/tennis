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
  import/                        import du JSON + action serveur
  tournoi/[id]/                  tableau, picks, resultats, sous-nav
  api/recompute/route.ts         POST → tn_recompute_picks()
  api/elo/refresh/route.ts       POST → import des Elo Tennis Abstract
  EloRefreshButton.tsx           bouton de rafraîchissement (accueil)
supabase/
  anon.ts                        client clé publique — LECTURES uniquement
  server.ts                      client service-role (server-only) — ÉCRITURES
  queries.ts                     lectures + reconstruction Match[]/Player
  elo.ts                         cascade TA → maison → défaut + sources
  elo-refresh.ts                 récupération TA → ta_elo (server-only)
  projections.ts                 simulation Monte Carlo + cache tn_projections
  migrations/                    RLS, puis tables ta_elo / ta_name_exceptions
scripts/verifier-rls.mjs         contrôle des accès avec la clé publique
scripts/verifier-auth.mjs        contrôle de la protection par mot de passe
lib/                             moteur fourni (non modifié)
```
