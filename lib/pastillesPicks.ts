/**
 * Pastilles de picks, rangées par tour (journée, demie, finale) : qui a pické quelle joueuse, et si ce
 * pick est juste, raté ou en attente. Sert l'écran Picks d'un Masters (et ses vues Laki / Thomas).
 *
 * Module PUR (ni Next ni Supabase). Les couleurs ne sont PAS ici : elles vivent dans app/globals.css
 * (jetons) et app/pastillesPicks.tsx (composants). Ici, seulement la décision « quelle pastille, où ».
 */

/** Ce qu'on sait d'un pick par rapport au match de son tour. */
export type ResultatPick = 'juste' | 'rate' | 'attente';

/** Un pick d'une joueuse : qui l'a posé, et pour quel tour. */
export interface PickDeJoueuse {
  participant: string;
  round: string;
}

export interface PastillePickTour {
  participant: string;
  resultat: ResultatPick;
}

/** Résultat d'un match du point de vue d'une joueuse (fond de la ligne). */
export type ResultatLigne = 'gagne' | 'perdu' | 'a_jouer';

/** Identité de couleur d'un participant (point rond). Un participant inconnu reçoit « autre » (gris). */
export type TeinteParticipant = 'moi' | 'laki' | 'thomas' | 'autre';

export function teinteParticipant(nom: string): TeinteParticipant {
  const n = nom.trim().toLowerCase();
  return n === 'moi' || n === 'laki' || n === 'thomas' ? n : 'autre';
}

const ORDRE: Record<TeinteParticipant, number> = { moi: 0, laki: 1, thomas: 2, autre: 3 };

/** Moi, Laki, Thomas d'abord (toujours dans cet ordre), les autres ensuite par ordre alphabétique. */
export function comparerParticipants(a: string, b: string): number {
  return ORDRE[teinteParticipant(a)] - ORDRE[teinteParticipant(b)] || a.localeCompare(b, 'fr');
}

/** Fond d'une ligne de joueuse : gagné, perdu, ou pas encore décidé. */
export function resultatLigne(vainqueurId: string | null, joueuseId: string): ResultatLigne {
  if (vainqueurId === null) return 'a_jouer';
  return vainqueurId === joueuseId ? 'gagne' : 'perdu';
}

/**
 * Les pastilles à montrer sur UNE joueuse dans le bloc d'UN tour : seulement les picks de CE tour
 * (un « Moi » posé en journée 2 n'apparaît jamais dans la journée 1). Un participant n'a qu'une pastille
 * par joueuse et par tour ; deux participants qui ont pické la même joueuse ont deux pastilles.
 * Juste / raté dès que le match est tranché, en attente avant.
 */
export function pastillesDuTour(args: {
  picks: PickDeJoueuse[];
  round: string;
  joueuseId: string;
  vainqueurId: string | null;
}): PastillePickTour[] {
  const { picks, round, joueuseId, vainqueurId } = args;
  const resultat: ResultatPick = vainqueurId === null ? 'attente' : vainqueurId === joueuseId ? 'juste' : 'rate';
  const noms = [...new Set(picks.filter((p) => p.round === round).map((p) => p.participant))];
  return noms.sort(comparerParticipants).map((participant) => ({ participant, resultat }));
}

/** Pick d'un participant déjà joué : des points = juste, zéro = raté, null = pas encore joué. */
export function resultatDepuisPoints(points: number | null | undefined): ResultatPick {
  if (points === null || points === undefined) return 'attente';
  return points > 0 ? 'juste' : 'rate';
}

/** Fond de la ligne d'un pick déjà noté : des points = gagné, zéro = perdu, null = pas encore joué. */
export function ligneDepuisPoints(points: number | null | undefined): ResultatLigne {
  const r = resultatDepuisPoints(points);
  return r === 'juste' ? 'gagne' : r === 'rate' ? 'perdu' : 'a_jouer';
}

/* ------------------------------------------------------------------ */
/*  Statut d'un pick que JE dois poser                                  */
/* ------------------------------------------------------------------ */

/** Où en est un pick : posé (validé), réservé (brouillon du plan), à poser, ou verrouillé (tour fermé). */
export type StatutPick = 'pose' | 'reserve' | 'a_poser' | 'verrouille';

export const LIBELLE_STATUT_PICK: Record<StatutPick, string> = {
  pose: 'Déjà posé',
  reserve: 'Réservé, à valider',
  a_poser: 'À poser',
  verrouille: 'Verrouillé',
};

/** Statut global d'un tour pour la carte de l'accueil (mêmes règles que libellePicksAPoser). */
export function statutPicksAPoser(p: { reste: number; reserves?: number }): StatutPick {
  if (p.reste === 0) return 'pose';
  return Math.min(p.reserves ?? 0, p.reste) === p.reste ? 'reserve' : 'a_poser';
}
