/**
 * SIMULATEUR DE POINTS DE BRACKET
 *
 * Jeu distinct des picks et du Fantasy : chaque participant prédit le
 * VAINQUEUR DE CHAQUE MATCH du tableau, à partir d'un tour de départ choisi
 * (les quarts, par exemple). Une bonne prédiction rapporte 2^(numéro du tour
 * − 1) points, le numéro se comptant depuis le PREMIER TOUR DU TOURNOI — 1er
 * tour 1 pt, 2e tour 2 pts, 4, 8, 16, 32, 64 en finale sur un tableau de 128.
 *
 * Module PUR : ni I/O, ni Supabase, ni Elo — jamais de probabilité ici (cf.
 * lib/montecarlo.ts pour la partie tirage au sort). Il ne connaît que la
 * structure du tableau (qui joue qui, à quelle position) et des résultats,
 * réels ou hypothétiques.
 *
 * DEUX ARBRES DE NATURE DIFFÉRENTE partagent ce module :
 *   - le BRACKET RÉEL/SCÉNARIO (`resoudreArbre`) : UNE seule ligne de jeu
 *     cohérente — chaque tour découle du precédent par cascade (qui a gagné
 *     alimente qui affronte qui ensuite). C'est la référence contre laquelle
 *     on note tout le monde, réelle jusqu'à un point puis hypothétique au-delà
 *     (clics du scénario interactif, ou tirage Monte Carlo).
 *   - les PRONOSTICS d'un participant (`tn_bracket_predictions`, lus tels
 *     quels) : une prédiction INDÉPENDANTE par emplacement, jamais cascadée.
 *     Prédire qui gagnera la finale n'exige pas d'avoir correctement deviné
 *     les demies — chaque emplacement se juge seul (`scoreDuStock`), ce qui
 *     est aussi ce qui rend une prédiction sur un joueur déjà éliminé
 *     automatiquement nulle, sans code spécial : il ne peut plus être
 *     vainqueur d'aucun emplacement réel/simulé.
 *
 * Un match déjà joué verrouille TOUJOURS son vrai vainqueur dans l'arbre
 * réel/scénario, quel que soit `choix` — « les matchs déjà joués comptent
 * leurs vrais résultats ».
 */

// Point d'entrée : le code vit dans deux modules, réexportés tels quels pour
// que les imports `@/lib/bracketSim` restent valables.
//   - bracketArbre.ts     : résolution de l'arbre, atteignabilité, scores
//   - bracketScenarios.ts : scénarios qui garantissent la victoire
export * from './bracketArbre';
export * from './bracketScenarios';
