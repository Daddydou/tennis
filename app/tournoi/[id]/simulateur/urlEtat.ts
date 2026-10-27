/**
 * Reflète une vue choisie à l'écran dans l'URL (sans recharger ni ajouter
 * d'entrée d'historique) : un retour arrière ou un lien partagé retrouve la
 * même section / sous-vue. `null` retire le paramètre (valeur par défaut).
 */
export function majParametreUrl(cle: string, valeur: string | null): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (valeur === null) url.searchParams.delete(cle);
  else url.searchParams.set(cle, valeur);
  window.history.replaceState(window.history.state, '', url);
}
