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
- Les écrans des tournois à tableau (Tableau, Picks, Bracket, Fantasy, Prédictions, Résultats) renvoient vers le Dashboard pour un Masters, qui montre les poules, les classements, les demies et la finale.

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

## Picks avec Game Tracker

Panneau « Game Tracker » sur l'écran du tournoi (`lib/mastersGT.ts`, `db/mastersGT.ts`, `mastersGTActions.ts`) :

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

- Pronostic : saisie, points réels, lecture de la version de Thomas (son bracket est vide tant que le tournoi n'a pas démarré), classement général.
