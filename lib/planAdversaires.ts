/**
 * ADVERSAIRES D'UN JOUEUR À UN TOUR DONNÉ — pour le grand tableau de l'écran
 * Picks, quand on pique pour un tour PLUS LOIN que celui qui se joue.
 *
 * Exemple (Bâle) : le R16 est verrouillé et en cours, on pique pour les QF.
 * L'adversaire d'un joueur en QF est le vainqueur du duel de R16 voisin :
 *   - duel voisin joué  → un seul adversaire, connu ;
 *   - duel voisin pas joué → les DEUX adversaires possibles.
 * Plus loin (SF, F) : tous les joueurs encore en course du bloc voisin.
 *
 * Module PUR. `ouverture` = les joueurs à l'ouverture du premier tour non
 * terminé (r0), dans l'ordre du tableau : 2 joueurs par duel, et un duel du
 * tour r0+k réunit deux blocs voisins de 2^k joueurs.
 */

/**
 * Indices (dans `ouverture`) des adversaires possibles de `joueur` au tour
 * r0 + `ecart`. `vivant(j)` dit si `j` peut encore atteindre ce tour (c'est lui
 * qui retire les joueurs déjà éliminés). Liste vide : joueur introuvable ou
 * bloc voisin vide (exemptions).
 */
export function adversairesPossibles(
  ouverture: (number | null)[],
  joueur: number,
  ecart: number,
  vivant: (j: number) => boolean,
): number[] {
  const pos = ouverture.indexOf(joueur);
  if (pos < 0 || ecart < 0) return [];
  const taille = 2 ** ecart;
  const bloc = Math.floor(pos / taille);
  const voisin = bloc ^ 1;
  const out: number[] = [];
  for (const j of ouverture.slice(voisin * taille, (voisin + 1) * taille)) {
    if (j !== null && vivant(j)) out.push(j);
  }
  return out;
}
