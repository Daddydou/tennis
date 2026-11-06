/**
 * POSSIBILITÉS DU BRACKET — que peut encore avoir pronostiqué chaque participant ?
 *
 * Dans le jeu Bracket de Thomas, un tour n'est visible qu'une fois verrouillé : les pronostics
 * des tours à venir (quarts, demies, finale...) de Laki et de Thomas sont cachés. Mais on en sait
 * beaucoup, sans rien deviner au hasard :
 *
 *   1. COHÉRENCE (vérifiée sur les données : 100 % aux tours 2 et 3) : un pronostic de tour t+1 est
 *      toujours l'un des deux pronostics du tour t des deux matchs qui l'alimentent. Pour un
 *      tableau de 64 dont on voit 3 tours, chaque quart n'a donc que 2 candidats, chaque demie 2,
 *      la finale 2 : 2^7 = 128 tableaux possibles.
 *   2. BARÈME : 2^(tour-1) points par pronostic correct (1, 2, 4, 8, 16, 32).
 *   3. VIVANTS : un pronostic ne peut encore rapporter que si son joueur n'est pas éliminé.
 *   4. « MAX » (facultatif) : le maximum affiché chez Thomas = points actuels + points encore
 *      possibles. En le donnant, on ne garde que les tableaux dont le potentiel colle exactement.
 *
 * Module PUR (aucun import React / Next / Supabase). Résultat = des possibilités, jamais une
 * certitude sur un choix précis, sauf quand un seul candidat reste (`certain`).
 */

export interface EntreePossibilites {
  /** Taille du tableau (puissance de 2). */
  drawSize: number;
  /** Nom affichable de chaque position de tableau. */
  noms: Map<number, string>;
  matchs: { tour: number; index: number; position1: number | null; position2: number | null; vainqueur: number | null }[];
  participants: { userId: string; pseudo: string; points: number }[];
  /** Pronostics VISIBLES (tours verrouillés) ; `position` = la position de tableau choisie. */
  pronostics: { userId: string; tour: number; index: number; position: number | null }[];
  /** « max » affiché chez Thomas, par pseudo (facultatif). */
  max?: Record<string, number>;
}

export interface Candidat {
  position: number;
  nom: string;
  vivant: boolean;
  /** Part des tableaux compatibles où ce joueur est choisi (0..1). */
  part: number;
}

export interface CaseCachee {
  tour: number;
  match: number;
  candidats: Candidat[];
  /** Un seul candidat possible. */
  certain: boolean;
}

export type StatutPossibilites =
  /** Pas de « max » : tous les tableaux cohérents. */
  | 'sans_max'
  /** « max » donné et au moins un tableau le reproduit exactement. */
  | 'avec_max'
  /** « max » donné mais aucun tableau ne le reproduit (valeur périmée ou erronée). */
  | 'incoherent'
  /** Pronostics cachés trop nombreux pour être énumérés (tableau énorme, un seul tour visible). */
  | 'trop_grand'
  /** Rien de caché, ou pas de pronostic visible. */
  | 'rien_a_deduire';

export interface PossibilitesParticipant {
  userId: string;
  pseudo: string;
  points: number;
  /** Points encore possibles sur les matchs déjà visibles mais pas encore joués. */
  visibles: number;
  statut: StatutPossibilites;
  /** Nombre de tableaux cohérents, et parmi eux ceux qui collent au « max » (égal si pas de max). */
  total: number;
  compatibles: number;
  /** Points finaux minimum et maximum encore atteignables parmi les tableaux compatibles. */
  bornes: { min: number; max: number } | null;
  cases: CaseCachee[];
  /** Champion possible = candidats de la finale. */
  champion: Candidat[];
}

const bareme = (tour: number) => 2 ** (tour - 1);
/** Au-delà, on n'énumère pas (2^18 = 262 144 tableaux, déjà quelques centaines de ms). */
const MAX_MATCHS_CACHES = 18;

export function possibilitesBracket(e: EntreePossibilites): PossibilitesParticipant[] {
  const nbTours = Math.log2(e.drawSize);
  if (!Number.isInteger(nbTours) || nbTours < 1) return [];

  // Joueurs éliminés : perdants des matchs joués.
  const elimines = new Set<number>();
  for (const m of e.matchs) {
    if (m.vainqueur !== null && m.position1 !== null && m.position2 !== null) {
      elimines.add(m.vainqueur === m.position1 ? m.position2 : m.position1);
    }
  }
  const vivant = (p: number) => !elimines.has(p);
  const nom = (p: number) => e.noms.get(p) ?? `Position ${p}`;

  const toursVisibles = [...new Set(e.pronostics.filter((p) => p.position !== null).map((p) => p.tour))];
  const base = toursVisibles.length ? Math.max(...toursVisibles) : 0;

  return e.participants.map((part): PossibilitesParticipant => {
    const sortie = (statut: StatutPossibilites, extra: Partial<PossibilitesParticipant> = {}): PossibilitesParticipant => ({
      userId: part.userId,
      pseudo: part.pseudo,
      points: part.points,
      visibles: 0,
      statut,
      total: 0,
      compatibles: 0,
      bornes: null,
      cases: [],
      champion: [],
      ...extra,
    });

    const pick = (tour: number, index: number): number | null =>
      e.pronostics.find((p) => p.userId === part.userId && p.tour === tour && p.index === index)?.position ?? null;

    // Points encore possibles sur les tours visibles : match pas joué et joueur choisi encore vivant.
    let visibles = 0;
    for (const m of e.matchs) {
      if (m.tour > base || m.vainqueur !== null) continue;
      const p = pick(m.tour, m.index);
      if (p !== null && vivant(p)) visibles += bareme(m.tour);
    }

    if (base === 0 || base >= nbTours) return sortie('rien_a_deduire', { visibles });
    const nbCaches = 2 ** (nbTours - base) - 1;
    if (nbCaches > MAX_MATCHS_CACHES) return sortie('trop_grand', { visibles });

    // Cases cachées, tour par tour (du premier tour caché à la finale).
    const cases: { tour: number; match: number }[] = [];
    for (let t = base + 1; t <= nbTours; t++) for (let m = 0; m < 2 ** (nbTours - t); m++) cases.push({ tour: t, match: m });

    const demande = e.max?.[part.pseudo];
    const cible = demande === undefined ? null : demande - part.points - visibles;

    const choisi = new Map<string, number>(); // "tour|match" -> position choisie dans le tableau en cours
    const comptes = new Map<string, number>(); // "tour|match|position" -> nombre de tableaux compatibles
    let total = 0;
    let compatibles = 0;
    let ptsMin = Infinity;
    let ptsMax = -Infinity;

    const sortant = (t: number, idx: number) => (t - 1 === base ? pick(t - 1, idx) : (choisi.get(`${t - 1}|${idx}`) ?? null));

    const rec = (k: number): void => {
      if (k === cases.length) {
        total++;
        let pts = 0;
        for (const c of cases) if (vivant(choisi.get(`${c.tour}|${c.match}`)!)) pts += bareme(c.tour);
        if (cible !== null && pts !== cible) return;
        compatibles++;
        if (pts < ptsMin) ptsMin = pts;
        if (pts > ptsMax) ptsMax = pts;
        for (const c of cases) {
          const cle = `${c.tour}|${c.match}|${choisi.get(`${c.tour}|${c.match}`)}`;
          comptes.set(cle, (comptes.get(cle) ?? 0) + 1);
        }
        return;
      }
      const { tour, match } = cases[k];
      const candidats = [sortant(tour, 2 * match), sortant(tour, 2 * match + 1)].filter((x): x is number => x !== null);
      for (const c of new Set(candidats)) {
        choisi.set(`${tour}|${match}`, c);
        rec(k + 1);
      }
      choisi.delete(`${tour}|${match}`);
    };
    rec(0);

    const statut: StatutPossibilites = cible === null ? 'sans_max' : compatibles > 0 ? 'avec_max' : 'incoherent';
    if (compatibles === 0) return sortie(statut === 'incoherent' ? 'incoherent' : 'rien_a_deduire', { visibles, total });

    const casesSortie: CaseCachee[] = cases.map(({ tour, match }) => {
      const prefixe = `${tour}|${match}|`;
      const candidats: Candidat[] = [...comptes.entries()]
        .filter(([cle]) => cle.startsWith(prefixe))
        .map(([cle, n]) => {
          const position = Number(cle.slice(prefixe.length));
          return { position, nom: nom(position), vivant: vivant(position), part: n / compatibles };
        })
        .sort((a, b) => b.part - a.part || a.position - b.position);
      return { tour, match, candidats, certain: candidats.length === 1 };
    });
    return {
      userId: part.userId,
      pseudo: part.pseudo,
      points: part.points,
      visibles,
      statut,
      total,
      compatibles,
      bornes: { min: part.points + visibles + ptsMin, max: part.points + visibles + ptsMax },
      cases: casesSortie,
      champion: casesSortie.find((c) => c.tour === nbTours)?.candidats ?? [],
    };
  });
}
