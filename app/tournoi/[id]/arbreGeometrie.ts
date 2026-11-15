/**
 * GÉOMÉTRIE DE L'ARBRE DU TABLEAU — façon arbre généalogique du guide Dark.
 *
 * Module pur (ni React ni Next) : place les joueurs et les traits d'un tableau
 * à élimination directe, des tours choisis jusqu'à la finale, EN MIROIR — la
 * moitié haute du tableau à gauche, la moitié basse à droite, les deux
 * finalistes face à face et le vainqueur au centre.
 *
 * Unités : le rem. Colonne `COLONNE` de large, `LIGNE` de haut par joueur du
 * premier tour affiché (d'un côté). Le composant (ArbreBracket.tsx) ne fait
 * que poser ces boîtes : aucune logique de tableau n'y vit.
 */

export const COLONNE = 8;
export const LIGNE = 4.75;
/** Rayon du cercle d'un joueur, et du cercle du vainqueur. */
export const RAYON = 1.25;
export const RAYON_VAINQUEUR = 1.9;

export type DuelArbre = {
  round: string;
  position: number;
  a: string | null;
  b: string | null;
  vainqueur: string | null;
};

export type EtatNoeud = 'gagnant' | 'perdant' | 'attente' | 'vide';

export type NoeudArbre = {
  cle: string;
  joueur: string | null;
  /** Centre du cercle, en rem depuis le coin haut gauche. */
  x: number;
  y: number;
  /** Le duel que ce joueur dispute à cet emplacement (null : le vainqueur final). */
  round: string | null;
  position: number | null;
  etat: EtatNoeud;
  vainqueurFinal: boolean;
};

/** Un trait horizontal (`h`) ou un crochet ouvert d'un côté (`crochet`). */
export type TraitArbre =
  | { type: 'h'; x: number; y: number; largeur: number; accent: boolean }
  | { type: 'crochet'; x: number; y: number; largeur: number; hauteur: number; ouvert: 'gauche' | 'droite' };

export type Arbre = {
  largeur: number;
  hauteur: number;
  noeuds: NoeudArbre[];
  traits: TraitArbre[];
  /** Tours affichés, du premier à la finale. */
  tours: string[];
};

/** Les tours qu'on peut prendre comme point de départ : au plus `max` matchs (8 par défaut = 16 joueurs). */
export function departsPossibles(rounds: string[], duels: DuelArbre[], max = 8): string[] {
  return rounds.filter((r) => {
    const n = duels.filter((d) => d.round === r).length;
    return n >= 1 && n <= max;
  });
}

/** Point de départ par défaut : le plus large tour d'au plus `max` matchs (les quarts : 4). */
export function departParDefaut(rounds: string[], duels: DuelArbre[], max = 4): string | null {
  return departsPossibles(rounds, duels, max)[0] ?? departsPossibles(rounds, duels)[0] ?? null;
}

function etatDe(joueur: string | null, vainqueur: string | null): EtatNoeud {
  if (!joueur) return 'vide';
  if (!vainqueur) return 'attente';
  return vainqueur === joueur ? 'gagnant' : 'perdant';
}

/**
 * Construit l'arbre depuis le tour `depuis` jusqu'au dernier tour de `rounds`.
 * Renvoie `null` si ce tour n'a pas un nombre de matchs en puissance de deux
 * (tableau incomplet) : on ne dessine pas un arbre faux.
 */
export function construireArbre(rounds: string[], duels: DuelArbre[], depuis: string): Arbre | null {
  const debut = rounds.indexOf(depuis);
  if (debut === -1) return null;
  const tours = rounds.slice(debut);
  const parTour = tours.map((r) =>
    duels.filter((d) => d.round === r).sort((x, y) => x.position - y.position),
  );
  const n0 = parTour[0].length;
  if (n0 === 0 || (n0 & (n0 - 1)) !== 0) return null;
  // Chaque tour suivant doit avoir moitié moins de matchs (on tronque à la finale).
  const R = Math.min(tours.length, Math.log2(n0) + 1);
  for (let k = 1; k < R; k++) if (parTour[k].length !== n0 >> k) return null;

  // Colonnes : 0..R-1 à gauche (R-1 = finaliste du haut), R au centre, R+1..2R à droite.
  const cx = (col: number) => col * COLONNE + COLONNE / 2;
  const colGauche = (k: number) => k;
  const colDroite = (k: number) => 2 * R - k;
  const largeur = (2 * R + 1) * COLONNE;

  // Joueurs d'un côté au premier tour affiché : n0 (2 par match, moitié des matchs).
  const parCote = Math.max(n0, 1);
  const hauteur = parCote * LIGNE;

  const noeuds: NoeudArbre[] = [];
  const traits: TraitArbre[] = [];

  // y des entrants, par tour et par côté : départ régulier, puis milieux successifs.
  // yCote[k][i] = ordonnée du i-ème entrant (d'un côté) au tour k.
  const yCote: number[][] = [];
  yCote[0] = Array.from({ length: parCote }, (_, i) => (i + 0.5) * LIGNE);
  for (let k = 1; k < R; k++) {
    const prev = yCote[k - 1];
    yCote[k] = Array.from({ length: prev.length / 2 }, (_, i) => (prev[2 * i] + prev[2 * i + 1]) / 2);
  }

  const finale = parTour[R - 1][0];
  if (R === 1) {
    // Finale seule : un finaliste de chaque côté.
    yCote[0] = [hauteur / 2];
  }

  for (let k = 0; k < R; k++) {
    const matchs = parTour[k];
    const estFinale = k === R - 1;
    if (estFinale) {
      const y = hauteur / 2;
      const d = finale;
      noeuds.push(
        { cle: `${d.round}|${d.position}|a`, joueur: d.a, x: cx(colGauche(k)), y, round: d.round, position: d.position, etat: etatDe(d.a, d.vainqueur), vainqueurFinal: false },
        { cle: `${d.round}|${d.position}|b`, joueur: d.b, x: cx(colDroite(k)), y, round: d.round, position: d.position, etat: etatDe(d.b, d.vainqueur), vainqueurFinal: false },
        { cle: 'vainqueur', joueur: d.vainqueur, x: cx(R), y, round: null, position: null, etat: d.vainqueur ? 'gagnant' : 'attente', vainqueurFinal: true },
      );
      traits.push(
        { type: 'h', x: cx(colGauche(k)) + RAYON, y, largeur: cx(R) - RAYON_VAINQUEUR - cx(colGauche(k)) - RAYON, accent: d.vainqueur !== null && d.vainqueur === d.a },
        { type: 'h', x: cx(R) + RAYON_VAINQUEUR, y, largeur: cx(colDroite(k)) - RAYON - cx(R) - RAYON_VAINQUEUR, accent: d.vainqueur !== null && d.vainqueur === d.b },
      );
      continue;
    }
    const moitie = matchs.length / 2;
    matchs.forEach((d, j) => {
      const gauche = j < moitie;
      const jc = gauche ? j : j - moitie; // rang du match de ce côté
      const y1 = yCote[k][2 * jc];
      const y2 = yCote[k][2 * jc + 1];
      const col = gauche ? colGauche(k) : colDroite(k);
      const x = cx(col);
      noeuds.push(
        { cle: `${d.round}|${d.position}|a`, joueur: d.a, x, y: y1, round: d.round, position: d.position, etat: etatDe(d.a, d.vainqueur), vainqueurFinal: false },
        { cle: `${d.round}|${d.position}|b`, joueur: d.b, x, y: y2, round: d.round, position: d.position, etat: etatDe(d.b, d.vainqueur), vainqueurFinal: false },
      );
      // Crochet : du bord des deux cercles jusqu'à mi-chemin de la colonne suivante.
      const demi = COLONNE / 2 - RAYON;
      const xSuivant = cx(gauche ? colGauche(k + 1) : colDroite(k + 1));
      const yM = (y1 + y2) / 2;
      if (gauche) {
        traits.push({ type: 'crochet', x: x + RAYON, y: y1, largeur: demi, hauteur: y2 - y1, ouvert: 'gauche' });
        traits.push({ type: 'h', x: x + COLONNE / 2, y: yM, largeur: xSuivant - RAYON - (x + COLONNE / 2), accent: false });
      } else {
        traits.push({ type: 'crochet', x: x - RAYON - demi, y: y1, largeur: demi, hauteur: y2 - y1, ouvert: 'droite' });
        traits.push({ type: 'h', x: xSuivant + RAYON, y: yM, largeur: x - COLONNE / 2 - (xSuivant + RAYON), accent: false });
      }
    });
  }

  return { largeur, hauteur, noeuds, traits, tours: tours.slice(0, R) };
}

/** « Jannik Sinner » → « JS » ; « J. Sinner » → « JS » ; « Sinner » → « SI ». */
export function initiales(nom: string): string {
  const mots = nom.replace(/\./g, ' ').split(/[\s-]+/).filter(Boolean);
  if (mots.length === 0) return '?';
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}
