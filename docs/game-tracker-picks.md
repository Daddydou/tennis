# Game Tracker : poser ses picks depuis l'app

Résumé de l'API « Picks tennis » de Game Tracker (l'app de Thomas) et de la façon dont l'app tennis s'en sert. Base : `https://bowling-tracker-phi.vercel.app/api/v1/tennis/picks` (JSON UTF-8).

## Mise en place (une fois)

1. L'admin de Game Tracker te donne une clé `bk_live_…` portant le droit `write:tennis-picks`. Elle agit au nom d'UN seul joueur (toi).
2. Mets-la dans `.env.local` : `GAMETRACKER_PICKS_KEY=bk_live_…` (jamais dans le code, jamais dans une conversation).
3. Sur Vercel : Settings > Environment Variables > `GAMETRACKER_PICKS_KEY`, type **sensitive**, puis redéploie (une variable ne s'applique qu'aux nouveaux déploiements).
4. Relie chaque tournoi à son tournoi Game Tracker. Sans lien, rien n'est envoyé. Deux façons :
   - depuis le panneau Game Tracker de l'écran Picks : « Lire Game Tracker » propose la liste des tournois correspondants (même circuit, même année, même tableau) ; choisis-en un et clique sur **Relier** ;
   - ou depuis la page « Synchroniser le bracket de Thomas » (`/import/thomas`), qui ne liste que les tournois présents dans l'API bracket de Thomas (Lyon n'y est pas, alors qu'il est dans l'API picks).
   Le lien est le même dans les deux cas (`tn_bracket_externe_tournois.tournament_id_interne`).

## Utilisation

Écran **Picks** d'un tournoi, vue « Moi », panneau repliable **Game Tracker** :

1. **Lire Game Tracker** : affiche le tour ouvert, l'heure de verrou, ton pick actuel chez eux, le classement, et ce qui serait envoyé.
2. **Envoyer sur Game Tracker** : un seul POST pour le tour ouvert. Après l'envoi, l'app relit ton pick RÉEL et signale tout écart.

Rien ne part tout seul. L'écran ne contacte Game Tracker que quand tu cliques sur « Lire ».

**Repères sur la grille de picks.** Après « Lire Game Tracker », chaque joueur du tour ouvert chez eux est marqué : **hors pool GT** (pas dans ton pool : l'envoi serait refusé), **déjà pické GT** (utilisé à un autre tour chez eux : refusé aussi), **en attente** (son match précédent n'est pas joué : le pick pourra être redirigé). Ces repères sont indicatifs, ils ne bloquent pas la sélection ; ils ne s'affichent que pour le tour que Game Tracker a ouvert, et jamais sur la vue d'un autre participant. Le recoupement par le nom se fait à l'envoi.

## Tours verrouillés : Game Tracker fait foi

À chaque **Lire Game Tracker**, l’app lit aussi `tours[]` (les tours verrouillés ou terminés, avec les picks de **tous** les joueurs) et recopie ces picks dans les nôtres, pour Moi, Laki et Thomas (« moustiton » chez eux, même correspondance que `lib/bracketImport.ts`). Le panneau affiche la liste des changements appliqués.

- Le tour ouvert n’est jamais réécrit.
- Chaque position est traduite en notre joueur (premier tour du tableau) puis recoupée par le nom : un seul désaccord, rien n’est aligné (message dans le panneau).
- Un côté vide chez eux vide le nôtre ; un pseudo inconnu est ignoré (avertissement).
- Si un de nos picks d’un tour pas encore aligné réutilise, dans le même stock, un joueur pris chez eux, il est retiré (un joueur une fois par tournoi **et par participant** ; plusieurs participants peuvent prendre le même joueur).
- Les points sont recalculés depuis nos résultats de matchs : si notre tableau est en retard, ils le sont aussi jusqu’à la mise à jour.

Code : `lib/gameTrackerAlignement.ts` (plan, pur, testé) et `db/gameTrackerAlignement.ts` (lecture, puis écriture service role).

## Vérifier l’API en direct (lecture seule)

`npm run verify:game-tracker` liste les tournois jouables ; `npm run verify:game-tracker -- --tournoi=<id>` affiche en plus le tour ouvert, le pool, ton pick et le classement. Il passe par le même client et les mêmes lecteurs que l'app : si Game Tracker change la forme de ses réponses, il échoue ici avec le chemin fautif. Il n'envoie jamais de POST.

## Règles de Game Tracker (appliquées par leur serveur, les mêmes que dans l'app)

- Chaque tour : un joueur du haut du tableau et un du bas. En demi-finale et finale : un seul pick, dans `haut`.
- On pique dans le pool du tour (8 candidats par moitié avant les huitièmes, tous les joueurs en lice ensuite). Un joueur ne se pique qu'une fois par tournoi.
- Un tour s'ouvre dès le premier match du tour précédent : certains candidats sont `enAttente`. Si l'un d'eux perd, **Game Tracker redirige automatiquement le pick vers le vainqueur** (ou le vide s'il a déjà été pické). Il faut donc relire avant le verrou.
- Le tour se verrouille au premier match (`lockAt`). Avant, le pick se remplace à volonté.
- Le POST **remplace le pick du tour en entier** (`haut` et `bas` obligatoires, `null` vide un côté).

## Ce que fait l'app pour rester sûre

- Positions recalculées côté serveur depuis tes picks (position du joueur au premier tour), puis recoupées avec le **nom** du pool Game Tracker : un seul désaccord et rien n'est envoyé.
- Refus avant envoi si : tour verrouillé, joueur hors pool, joueur déjà pické chez eux, mauvais côté du tableau.
- Un côté que tu n'as pas posé ici est renvoyé tel que Game Tracker l'a déjà : l'envoi ne vide jamais un côté par accident. Aucun pick chez toi pour le tour = rien n'est envoyé.
- L’envoi n’écrit rien dans notre base : il ne modifie pas tes picks locaux.

## Erreurs de l'API

| Code | Sens |
|---|---|
| 401 | Clé absente, invalide, révoquée ou expirée |
| 403 | La clé ne permet pas de poser des picks tennis, ou plus d'accès au tennis ; tour verrouillé ou pas encore ouvert |
| 404 | Tournoi introuvable / jeu de picks fermé ; tour inexistant |
| 422 | Un seul pick en demi/finale ; joueur hors pool ; joueur déjà pické ; position hors tableau |
| 429 | Plus de 60 requêtes par minute (en-tête `Retry-After`) |
| 500 | Erreur serveur, réessayer plus tard |

Un refus de règle (403/404/422 avec `enregistre: false`) s'affiche avec la raison donnée par Game Tracker ; rien n'est enregistré et le pick d'avant reste en place.

## Code

| Fichier | Rôle |
|---|---|
| `lib/gameTrackerPicks.ts` | Module pur : lecture des réponses, picks -> positions, `preparerEnvoi`, `ecartsApresEnvoi` |
| `externe/gameTrackerPicksClient.ts` | HTTP (GET tournois / état, POST pick), clé jamais affichée |
| `db/gameTrackerPicks.ts` | Lecture seule de notre base (lien, tableau, mes picks) |
| `app/tournoi/[id]/picks/gameTrackerActions.ts` | Server Actions `lireGameTracker` / `envoyerGameTracker` (session exigée) |
| `app/tournoi/[id]/picks/PanneauGameTracker.tsx` | Panneau de l'écran picks |

Tests : `npx vitest run lib/__tests__/gameTrackerPicks.test.ts externe/__tests__/gameTrackerPicksClient.test.ts` (ou `npm run test:components`).
