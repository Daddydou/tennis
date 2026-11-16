/**
 * Les mots des écrans Masters selon le circuit : « joueur » à l'ATP, « joueuse » à la WTA.
 * Module PUR. Sans circuit connu, on garde le féminin (le premier Masters suivi était la WTA).
 */
export function motsJoueur(tour: string | null | undefined): { Joueur: string; Joueurs: string; un: string } {
  return tour === 'ATP'
    ? { Joueur: 'Joueur', Joueurs: 'Joueurs', un: 'un joueur' }
    : { Joueur: 'Joueuse', Joueurs: 'Joueuses', un: 'une joueuse' };
}
