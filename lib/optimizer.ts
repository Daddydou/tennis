/**
 * OPTIMISEUR DE PICKS
 *
 * Problème : N picks sur un tournoi (2 par tour tant qu'il reste deux
 * moitiés de tableau, puis 1), chaque joueur utilisable UNE SEULE FOIS.
 *
 * Le piège : choisir le meilleur joueur disponible à chaque tour est
 * nettement sous-optimal. La stratégie gloutonne épuise les favoris tôt,
 * puis se retrouve avec des joueurs déjà éliminés sur les derniers slots.
 *
 * Backtest Madrid 2026 (216 pts atteignables) :
 *   - glouton avec pénalité ......  51 pts
 *   - glouton sans byes ..........  75 pts
 *   - AFFECTATION GLOBALE ........ 136 pts   <- cette implémentation
 *   - meilleur Elo ............... 127 pts
 *   - classement ................. 108 pts
 *   - aléatoire ..................  93 pts
 *
 * La solution est l'affectation globale (algorithme hongrois) : on résout
 * les N slots simultanément sur la matrice des espérances, ce qui répartit
 * naturellement les joueurs sur toute la durée du tournoi.
 *
 * ⚠ Ce backtest compare des STRATÉGIES, il ne décrit pas ce que fait l'app :
 * `optimiser()` n'est pas branchée, l'écran Picks recommande tour par tour
 * (cf. la note sur la fonction, dans optimizerAffectation.ts). À lire comme
 * un argument en faveur d'un futur écran « plan de tournoi », pas comme
 * l'état des lieux.
 */

// Point d'entrée : le code vit dans deux modules, réexportés tels quels pour
// que les imports `@/lib/optimizer` restent valables.
//   - optimizerProbabilites.ts : modèle de probabilité, propagation (§ 1-2)
//   - optimizerAffectation.ts  : algorithme hongrois, slots, recommandations (§ 3)
export * from './optimizerProbabilites';
export * from './optimizerAffectation';
