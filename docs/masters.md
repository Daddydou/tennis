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

## Pas encore fait

- Résultats des matchs : source à définir au premier match (l'API tennis ne listait pas encore les WTA Finals).
- Picks des Masters (règle « une fois par phase », envoi et lecture vers Game Tracker : le rapprochement des tours de Game Tracker avec nos tours suppose un tableau à élimination directe).
- Pronostic des Masters (saisie, points, lecture de la version de Thomas : son bracket est vide tant que le tournoi n'a pas démarré), classement général.
