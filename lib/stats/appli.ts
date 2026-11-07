/**
 * STATISTIQUES — vue « App » : ce que l'application contient, et si c'est frais.
 *
 * Module pur : la base fournit les comptes et les dates, ici on ne fait que les présenter.
 */

export interface Compteur {
  libelle: string;
  valeur: number;
}

export type NiveauFraicheur = 'frais' | 'moyen' | 'ancien' | 'vide';

export interface LigneFraicheur {
  libelle: string;
  dernier: string | null;
  ageHeures: number | null;
  niveau: NiveauFraicheur;
}

/**
 * Âge d'une donnée et niveau : frais sous 24 h, moyen sous 7 jours, ancien au-delà. Une
 * source sans aucune date est « vide », jamais « fraîche » : ne rien avoir n'est pas être à jour.
 */
export function fraicheurDe(libelle: string, dernier: string | null, maintenant: Date): LigneFraicheur {
  if (!dernier) return { libelle, dernier: null, ageHeures: null, niveau: 'vide' };
  const ageHeures = Math.max(0, (maintenant.getTime() - new Date(dernier).getTime()) / 3_600_000);
  const niveau: NiveauFraicheur = ageHeures < 24 ? 'frais' : ageHeures < 24 * 7 ? 'moyen' : 'ancien';
  return { libelle, dernier, ageHeures, niveau };
}

/** « il y a 3 h », « il y a 2 j » — compact, pour une cellule de tableau. */
export function formaterAge(ageHeures: number | null): string {
  if (ageHeures === null) return '—';
  if (ageHeures < 1) return 'il y a moins d’1 h';
  if (ageHeures < 48) return `il y a ${Math.floor(ageHeures)} h`;
  return `il y a ${Math.floor(ageHeures / 24)} j`;
}
