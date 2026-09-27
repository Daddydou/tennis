/**
 * FANTASY — COMPOSITION D'UNE ÉQUIPE SOUS CONTRAINTES DE CLASSEMENT
 *
 * Second jeu, monté sur le même moteur que les picks, sans rien y changer.
 *
 *   Picks   : un joueur par slot (tour × moitié de tableau), chaque joueur ne
 *             servant qu'une fois — c'est une affectation joueur → slot, et
 *             chaque joueur porte une espérance PAR TOUR.
 *   Fantasy : une équipe composée UNE SEULE FOIS avant le coup d'envoi, puis
 *             figée. Chaque joueur retenu marque sur l'ensemble de ses matchs,
 *             selon le même barème (lib/scoring.ts), pondéré par un
 *             multiplicateur croissant selon le tour. Chaque joueur porte donc
 *             UNE espérance globale, celle du tirage — aucun résultat réel n'y
 *             entre jamais (cf. db/fantasy.ts).
 *
 * L'équipe se compose d'un joueur par palier de classement, et les paliers
 * dépendent de la date du tournoi (cf. `compositionPour`). Dans le découpage
 * historique hors Grand Chelem (tournois avant le 2026-09-28), les derniers
 * paliers se recoupent (« 31 et au-delà » deux fois) : prendre le meilleur de
 * chaque palier indépendamment produirait un doublon. On résout donc
 * l'affectation palier → joueur globalement, en réutilisant l'algorithme
 * hongrois déjà écrit pour les picks (lib/optimizer.ts). Sur des paliers
 * disjoints (Grand Chelem, et tout le découpage depuis le 2026-09-28),
 * l'affectation globale rend le même résultat qu'un maximum palier par
 * palier, et reste le chemin unique.
 *
 * Module PUR : aucune I/O, aucune dépendance à Supabase. Les espérances par
 * tour lui sont fournies (elles viennent de la simulation Monte Carlo, cf.
 * db/fantasy.ts).
 */

// Point d'entrée : le code vit dans deux modules, réexportés tels quels pour
// que les imports `@/lib/fantasy` restent valables.
//   - fantasyRegles.ts : bye, multiplicateurs (BAREMES_EXPLICITES), paliers
//   - fantasyCalcul.ts : espérance, score réel, composition de l'équipe
export * from './fantasyRegles';
export * from './fantasyCalcul';
