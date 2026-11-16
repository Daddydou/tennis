/**
 * LIGNE DE LA SAISON (scène d'accueil) - module pur, ni React ni Next.
 *
 * Place les tournois d'une année sur une ligne de 0 (1er janvier) à 1
 * (31 décembre), comme la frise des épisodes du guide Dark. Seuls les Grands
 * Chelems et les tournois en cours (dont la vedette) portent une étiquette ;
 * les autres points montrent leur nom au survol (SceneAccueil.tsx). Deux
 * étiquettes trop proches ne s'affichent pas ensemble (un tournoi en cours
 * descend alors d'une rangée) : la ligne reste lisible.
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
  /** Tournoi en cours aujourd'hui (couleur à part sur la ligne). */
  enCours: boolean;
  etiquette: boolean;
  /** Rangée de l'étiquette : 0 sous la ligne, 1 juste dessous (deux tournois en cours trop proches). */
  rangee: 0 | 1;
};

/** Écart minimal entre deux étiquettes (en fraction de la ligne) : Roland Garros et Wimbledon tiennent ensemble. */
export const ECART_ETIQUETTES = 0.08;

/** 'YYYY-MM-DD' → position dans son année (0 = 1er janvier, 1 = 31 décembre). */
export function positionDansAnnee(iso: string): number {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  const debut = Date.UTC(a, 0, 1);
  const fin = Date.UTC(a, 11, 31);
  return (Date.UTC(a, m - 1, j) - debut) / (fin - debut);
}

/** Grand Chelem ? (la base écrit « gs » ou « GS »). */
function estGrandChelem(category: string | null): boolean {
  return (category ?? '').toLowerCase() === 'gs';
}

export function ligneSaison(
  tournois: TournoiSaison[],
  annee: number,
  vedetteId: string | null,
  enCoursIds: ReadonlySet<string> = new Set(),
): PointSaison[] {
  const vus = new Map<string, PointSaison>();
  const points: PointSaison[] = [];
  const grandChelem = new Set<string>();
  const tries = tournois
    .filter((t) => t.start_date && Number(t.start_date.slice(0, 4)) === annee)
    .sort((a, b) => (a.start_date! < b.start_date! ? -1 : a.start_date! > b.start_date! ? 1 : 0));
  for (const t of tries) {
    // Un tournoi mixte (ATP et WTA, mêmes dates) n'est qu'un seul point.
    const cle = `${t.name.toLowerCase()}|${t.start_date!.slice(0, 10)}`;
    const vedette = t.id === vedetteId;
    const enCours = vedette || enCoursIds.has(t.id);
    const jumeau = vus.get(cle);
    if (jumeau && !vedette) {
      jumeau.enCours ||= enCours;
      continue;
    }
    const point: PointSaison = {
      id: t.id,
      // « Roland Garros 2026 » → « Roland Garros » : l'année est celle de la ligne.
      nom: t.name.replace(/\s+\d{4}$/, ''),
      x: positionDansAnnee(t.start_date!),
      vedette,
      enCours,
      etiquette: false,
      rangee: 0,
    };
    if (estGrandChelem(t.category)) grandChelem.add(t.id);
    vus.set(cle, point);
    points.push(point);
  }
  // Placement glouton par priorité (vedette, puis en cours, puis Grands
  // Chelems). Une étiquette trop proche d'une étiquette déjà placée descend
  // d'une rangée si le tournoi est en cours (il doit toujours se lire), sinon
  // elle s'efface.
  const rang = (p: PointSaison) => (p.vedette ? 0 : p.enCours ? 1 : grandChelem.has(p.id) ? 2 : 9);
  const candidats = points
    .map((p, i) => ({ p, r: rang(p), i }))
    .filter(({ r }) => r < 9)
    .sort((a, b) => a.r - b.r || a.i - b.i);
  const places: [number[], number[]] = [[], []];
  const libre = (rangee: 0 | 1, x: number) => !places[rangee].some((y) => Math.abs(x - y) < ECART_ETIQUETTES);
  for (const { p } of candidats) {
    const rangee: 0 | 1 | null = libre(0, p.x) ? 0 : p.enCours && libre(1, p.x) ? 1 : null;
    if (rangee === null) continue;
    p.etiquette = true;
    p.rangee = rangee;
    places[rangee].push(p.x);
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
