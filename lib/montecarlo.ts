/**
 * SIMULATION MONTE CARLO
 *
 * Remplace la propagation analytique de calculerEsperances(), qui
 * s'effondre aux tours tardifs : la probabilite qu'un joueur donne
 * atteigne les quarts devient si faible que toutes les esperances
 * tendent vers zero, et l'affectation n'a plus d'information.
 *
 * Ici on simule le tournoi N fois depuis le tirage, en tirant chaque
 * match au sort selon les Elo, et on compte les points reellement
 * marques. L'esperance devient une moyenne empirique, robuste meme
 * quand les probabilites individuelles sont faibles.
 */

// Point d'entree : le code vit dans deux modules, reexportes tels quels pour
// que les imports `@/lib/montecarlo` restent valables.
//   - montecarloTournoi.ts : simulation du tournoi (points des picks)
//   - montecarloBracket.ts : probabilites de victoire du jeu de Bracket
export * from './montecarloTournoi';
export * from './montecarloBracket';
