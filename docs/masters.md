# Format Masters (ATP Finals, WTA Finals)

Deux poules de 4, trois journées, puis demies croisées et finale. Règles du jeu : page « Règles » de l'app de Thomas (état du 06/11/2026), reprises dans `lib/masters.ts`.

## Règles retenues

- **Poules** : A = « haut », B = « bas ». Chacun joue les trois autres de sa poule. Classement : victoires, puis confrontation directe entre deux ex æquo ; à trois, pourcentage de sets puis de jeux gagnés (calculés sur les matchs des ex æquo entre eux, comme dans les règlements officiels : à confirmer si Thomas les calcule sur toute la poule).
- **Demies croisées** : 1er A – 2e B et 1er B – 2e A, puis la finale.
- **Pronostic** (à la place du bracket, fermé au premier match) : classer chaque poule du 1er au 4e, choisir le vainqueur des deux demies que ce classement dessine, puis le champion. Qualifié trouvé 4 pts, place exacte 2 pts, finaliste trouvé 8 pts (quel que soit son parcours), champion 16 pts : **64 maximum**.
- **Picks** : à chaque journée de poules, un joueur par poule ; en demie et en finale, un seul. Un joueur ne se pique qu'**une fois par phase** : trois joueurs différents par poule sur les trois journées, puis, en phase finale, on repart de zéro. Points calculés match par match comme ailleurs.
- **Classement du tournoi** : points du pronostic + points des picks.

## Dans la base

Un tournoi Masters a les tours `J1, J2, J3, SF, F` (`estMasters`) ; la moitié (`half`) d'un match de poule dit sa poule (`top` = A, `bottom` = B). Aucune migration : le schéma accepte déjà ce format.

## Importer un Masters

```
npm run import:masters -- --tournoi=<id Game Tracker> --debut=AAAA-MM-JJ           (aperçu, rien n'est écrit)
npm run import:masters -- --tournoi=<id Game Tracker> --debut=AAAA-MM-JJ --ecrire  (écrit)
```

- Lit les poules et la journée 1 dans l'API de picks de Game Tracker. Les journées 2 et 3 dépendent des résultats de la journée 1 (les vainqueurs se rencontrent, les perdants aussi, puis les duels restants) : Game Tracker ne les donne qu'après. **Relancer la commande après la journée 1** pour les ajouter ; elle ne duplique rien et ne touche jamais à un résultat déjà enregistré.
- `--debut` (date du premier match) ne sert qu'à la création.
- Les écrans des tournois à tableau (Tableau, Picks, Bracket, Fantasy, Prédictions, Résultats) n'ont pas de sens pour un Masters (Bracket, Fantasy, Prédictions, Résultats renvoient vers le Dashboard). Un Masters a quatre onglets : **Dashboard** (synthèse : classement des picks, résultats, accès aux onglets), **Tableau** (poules, classements, demies, finale), **Picks** (picks proposés par journée, joueuses avec adversaire, Elo, chance de gagner et qui les a pickées, panneau Game Tracker) et **Pronostic** (classement des poules, demies, championne). Code : `MastersEcrans.tsx` (un composant par onglet), `MastersPieces.tsx`, `lib/mastersAnalyse.ts`, `onglets.ts` (`ONGLETS_MASTERS`).

## Résultats des matchs (API tennis)

Source : le tableau des singles de l'API tennis (« WTA Finals - Indian Wells », 1 requête sur les 50 par jour). Il publie dès le vendredi les 12 matchs de poule **sans jour** (paires de joueuses, horaires quand ils sont programmés), puis demies et finale. Le rattachement à nos matchs se fait par la **paire de joueuses**, jamais par une position (`lib/mastersResultats.ts`) :

- journée 1 : mise à jour des résultats, statuts (programmé, en direct, terminé, abandon, forfait), sets (orientés dans l'ordre de nos matchs) et horaires ;
- journées 2 et 3 : leurs lignes sont **créées dès que la journée 1 d'une poule est jouée** (vainqueurs entre eux, perdantes entre elles, puis les deux duels restants). Si l'API date ces duels dans un ordre qui contredit cette déduction, un avertissement est affiché ;
- demies placées dès que les deux poules sont terminées, finale dès que les deux demies sont jouées (une finale peut opposer deux joueuses qui se sont déjà affrontées en poule : on distingue poule et phase finale par le tour de l'API) ;
- le statut du tournoi avance tout seul (à venir, en cours, terminé) et les points des picks sont recalculés (`tn_recompute_picks`).

Trois façons de rafraîchir :

- **bouton « Actualiser les résultats »** sur l'écran du tournoi (1 requête, refusé s'il y a eu un rafraîchissement il y a moins de 2 minutes) ;
- **cron** toutes les 6 h : le tournoi doit avoir une ligne dans `tn_import_auto` (mode `api`, `source_url` = URL du tableau de l'API) ;
- **ligne de commande** : `npm run resultats:masters -- --tournoi=<id interne> --nom="WTA Finals - Indian Wells" --annee=2026 [--ecrire]` (aperçu par défaut).

Une joueuse de l'API introuvable parmi les huit : rien n'est écrit. L'API est la source : ses valeurs remplacent les nôtres.

## Pronostics et classement du tournoi

Table `tn_masters_pronostics` (migration 0032) : un pronostic par participant et par tournoi. Sur l'écran du tournoi (`PronosticsMasters`, `EditeurPronostic`, `mastersPronosticActions`) :

- **Saisie** de son pronostic (classement des deux poules, vainqueur des deux demies, championne) avec le même contrôle que le serveur (`validerPronostic`) ; pour moi, l'éditeur est pré-rempli avec le **pronostic proposé** par la simulation. Les pronostics de Laki et de Thomas se saisissent à la main tant que l'API de Thomas ne les donne pas (son bracket est vide pour les Finals).
- **Fermeture au premier match** du tournoi (match commencé ou joué, ou heure du premier match programmé passée) : `pronosticFerme`. Elle ne bloque plus la saisie : après le premier match, on peut toujours saisir ou corriger un pronostic à la main (c'est la seule façon de recopier ceux déjà posés chez Game Tracker) ; la source est alors « manuel », et le formulaire part du classement actuel des poules.
- **Un seul écran** (onglet Pronostic, `ComparaisonPronostics.tsx`, logique pure dans `lib/mastersScenario.ts`) : une grille côte à côte avec le pronostic de chaque participant (vert = juste, ambre = bien qualifiée mais pas à cette place, rouge = raté, blanc = pas encore joué) et une colonne **Simulé**, un bracket au format d'un pronostic (classement des deux poules, vainqueurs des demies, championne) que l'on modifie à volonté. Les points de chacun (pronostic puis total avec les picks, rang, écart avec aujourd'hui) se recalculent tout de suite comme si le scénario était la réalité (`pointsSousScenario`). Départ du scénario = la réalité (`scenarioInitial`) ; ce qui est déjà joué (poule terminée sans égalité, demie, finale) est figé. Les picks ne sont pas simulés : ils comptent pour leurs points actuels.
- **Points** (`pointsPronostic`) : qualifiée trouvée 4, place exacte 2, finaliste trouvée 8 (quel que soit son parcours), championne 16 ; 64 au maximum. Comptés sur ce qui est déjà connu : les places d'une poule seulement quand elle est terminée **et** que son classement n'a aucune égalité non départagée (on ne donne pas de points à tort) ; finalistes quand les deux demies sont jouées ; championne quand la finale l'est.
- **Classement du tournoi** : points du pronostic + points des picks ; les ex æquo partagent le rang (1, 1, 3). Affiché sur le Dashboard (`MastersDashboard.tsx`, `classerTournoi`) : une ligne par participant avec Pronostic, Picks et Total (« Pronostic » et non « Bracket » : un Masters n'a pas de bracket).
- **Pronostics sur le Tableau** (`lib/mastersPronosticVue.ts`, pur ; `MastersPieces.tsx`) : sur chaque joueuse de poule, une pastille par participant (lettre + place prévue). Vert = place exacte, ambre = bien qualifiée (top 2) mais pas à cette place, rouge = raté, gris = poule pas finie ou égalité non départagée. Sous la finale : finalistes et championne de chacun (✓ juste, ✗ raté, sans signe = pas encore joué), jugés dès que c'est certain (éliminée en poule, demie perdue…). Un participant sans pronostic est signalé par une note.
- **Picks de Laki et de Thomas** (onglet Picks, sélecteur `?participant=` comme sur Paris, `PicksParticipantMasters.tsx`) : en lecture seule, un emplacement par journée et par poule, demie, finale, avec les points. Leurs picks arrivent par « Lire Game Tracker » (tours verrouillés).

## Picks avec Game Tracker

Panneau « Game Tracker » sur l'écran du tournoi (`lib/mastersGT.ts`, `db/mastersGT.ts`, `mastersGTActions.ts`) :

- **Lire depuis le Dashboard** (`BoutonLireGTMasters.tsx`, même action `lireGameTrackerMasters`) : bouton à côté de « Actualiser les résultats », en lecture seule ; il montre mes picks posés chez Game Tracker, le verrou de chaque tour, et ce qui a été recopié.
- **Lire** : lit l'état chez Game Tracker et **recopie ses picks chez nous** (Game Tracker fait foi) : les miens sur les tours encore modifiables, ceux de tous sur les tours verrouillés. Le plan de picks se recalcule alors autour de ce qui est posé.
- **Envoyer** : pour chaque tour ouvert (ou à venir : picks à l'avance), choix parmi le plan conseillé et ses alternatives, **Vérifier** (rien n'est écrit) puis **Confirmer** ; l'envoi est refusé si Game Tracker a changé entre-temps, et n'est annoncé réussi que si Game Tracker confirme les positions posées. Rien ne part tout seul.
- Tours de Game Tracker : 1, 2, 3 = journées de poules (`haut` = poule A, `bas` = poule B), 4 = demies, 5 = finale (un seul pick, champ `haut`, candidates cherchées des deux côtés du pool). Rapprochement avec nos joueuses par le nom ; positions 1 à 8 lues dans les pools.
- **Une fois par phase** (migration 0031) : chaque pick porte sa phase ; un joueur peut être pické en poules puis de nouveau en demie ou en finale.

## Propositions de picks et de pronostic

L'écran du tournoi propose (`lib/mastersSim.ts`, `lib/mastersConseils.ts`, `db/mastersConseils.ts`) :

- le **pronostic** qui rapporte le plus en espérance (classement des deux poules, vainqueur des deux demies, championne), avec la probabilité de chaque rang et de chaque titre ; il disparaît au premier match (le pronostic ferme à ce moment) ;
- les **picks** de chaque tour (trois journées par poule, demie, finale), avec les points espérés et les deux meilleures alternatives ; les picks déjà posés dans l'app sont conservés et bloquent leur joueur pour la phase.

Méthode : 10 000 tournois simulés à partir de l'Elo du jour (même chaîne que le reste de l'app : surface dure, 60 % surface / 40 % général) et des résultats déjà joués. Scores en sets et en jeux simulés avec le modèle de `lib/optimizerProbabilites.ts` (validé contre son calcul analytique : `mastersSim.test.ts`). Journées 2 et 3 : vainqueurs de la journée 1 entre eux, perdants entre eux, puis les deux duels restants (déduction vérifiée sur Game Tracker quand il publiera la journée 2). Forfaits et abandons non simulés ; une égalité parfaite non départagée par les règles est tirée au hasard. Le plan optimise les trois journées ensemble (une joueuse forte n'est utilisée qu'une fois, là où son avantage est le plus grand).

## Pas encore fait

- Lecture automatique des pronostics de Thomas et de Laki depuis l'API de Thomas. Constat du 13/11/2026 (sondes en lecture seule) : pour un tournoi de type `FINALS`, `GET /brackets` ne renvoie que les 12 matchs de poule (3 tours de 4 matchs, positions 1 à 8, pas de demies ni de finale), et chaque `pronostics[]` est `{ position: null, resultat: "sans_prono" }` pour tous les participants, alors que `participants[]` donne bien `rempli` et `pointsTotaux` (ex. 6, 6 et 0). Le pronostic de poules (classements, demies, championne) n'est donc exposé nulle part par l'API ; il ne se lit que sur le site de Thomas (page « Pronostics des participants »). Notre synchro de bracket (`sync:bracket-thomas`) rejette cette forme (« Bracket incohérent », 12 erreurs) : sans effet pour les Masters, qui n'en ont pas besoin. Il faudrait que Thomas ajoute les pronostics de poules à sa réponse (`/brackets`) pour automatiser la lecture. En attendant : saisie à la main (pronostics de Moi et de Laki recopiés le 13/11 ; Thomas n'en a pas posé, `rempli: false`). Contrôle utile : après saisie, les points affichés doivent retomber sur les `pointsTotaux` de Thomas.
- Les « points encore possibles » d'un pronostic (`maxRestant`) ne tiennent pas compte des joueuses déjà éliminées (Thomas, lui, les déduit : « max 46 » pour 54 chez nous).
- **Picks des autres** (onglet Picks) : visibles sur les tours non validés seulement (tour dont tous les matchs ne sont pas joués) ; les tours validés sont repliés avec mes seuls picks (`partitionnerTours`). Les picks d'un autre sur un tour pas encore verrouillé chez Game Tracker ne sont pas lisibles : l'API ne les donne qu'au verrouillage.
