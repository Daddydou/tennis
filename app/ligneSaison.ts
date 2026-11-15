/**
 * LIGNE DE LA SAISON (scène d'accueil) — module pur, ni React ni Next.
 *
 * Place les tournois d'une année sur une ligne de 0 (1er janvier) à 1
 * (31 décembre), comme la frise des épisodes du guide Dark. Seuls les grands
 * rendez-vous (et le tournoi vedette) portent une étiquette, et deux
 * étiquettes trop proches ne s'affichent pas ensemble : la ligne reste lisible.
 */

export type TournoiSaison = {
  id: string;
  name: string;
  category: string | null;
  start_date: string | null;
};

export type PointSaison = {
  id: string;
  nom: string;
  /** Position sur la ligne, de 0 à 1. */
  x: number;
  vedette: boolean;
  etiquette: boolean;
};

/**
 * Catégories assez grandes pour porter leur nom sur la ligne, par priorité :
 * quand deux étiquettes se touchent, le Grand Chelem passe avant le Masters.
 * Comparées en minuscules : la base écrit aussi bien « M1000 » que « finals ».
 */
const PRIORITE: Record<string, number> = { gs: 1, finals: 2, wtafinals: 2, m1000: 3 };

/** Écart minimal entre deux étiquettes (en fraction de la ligne). */
export const ECART_ETIQUETTES = 0.12;

/** 'YYYY-MM-DD' → position dans son année (0 = 1er janvier, 1 = 31 décembre). */
export function positionDansAnnee(iso: string): number {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  const debut = Date.UTC(a, 0, 1);
  const fin = Date.UTC(a, 11, 31);
  return (Date.UTC(a, m - 1, j) - debut) / (fin - debut);
}

export function ligneSaison(tournois: TournoiSaison[], annee: number, vedetteId: string | null): PointSaison[] {
  const vus = new Set<string>();
  const points: PointSaison[] = [];
  const tries = tournois
    .filter((t) => t.start_date && Number(t.start_date.slice(0, 4)) === annee)
    .sort((a, b) => (a.start_date! < b.start_date! ? -1 : a.start_date! > b.start_date! ? 1 : 0));
  for (const t of tries) {
    // Un tournoi mixte (ATP et WTA, mêmes dates) n'est qu'un seul point.
    const cle = `${t.name.toLowerCase()}|${t.start_date!.slice(0, 10)}`;
    const vedette = t.id === vedetteId;
    if (vus.has(cle) && !vedette) continue;
    vus.add(cle);
    points.push({
      id: t.id,
      // « Roland Garros 2026 » → « Roland Garros » : l'année est celle de la ligne.
      nom: t.name.replace(/\s+\d{4}$/, ''),
      x: positionDansAnnee(t.start_date!),
      vedette,
      etiquette: vedette || (t.category ?? '').toLowerCase() in PRIORITE,
    });
  }
  // Placement glouton par priorité (vedette, puis Grands Chelems, Finales,
  // Masters) : une étiquette trop proche d'une étiquette déjà placée s'efface.
  const rang = (p: PointSaison, cat: string) => (p.vedette ? 0 : (PRIORITE[cat] ?? 9));
  const candidats = points
    .map((p, i) => ({ p, r: rang(p, (tries.find((t) => t.id === p.id)?.category ?? '').toLowerCase()), i }))
    .filter(({ p }) => p.etiquette)
    .sort((a, b) => a.r - b.r || a.i - b.i);
  const places: number[] = [];
  for (const { p } of candidats) {
    if (places.some((x) => Math.abs(p.x - x) < ECART_ETIQUETTES)) p.etiquette = false;
    else places.push(p.x);
  }
  return points;
}

/** Numéro de semaine ISO 8601 d'une date 'YYYY-MM-DD'. */
export function semaineIso(iso: string): number {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  const jour = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - jour);
  const debutAnnee = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - debutAnnee) / 86_400_000 + 1) / 7);
}
