/**
 * LE GRAND TABLEAU DE L'ÉCRAN PICKS — la logique, sans React.
 *
 * Le grand tableau liste les joueurs encore en course pour le TOUR QU'ON VA
 * PICKER (ex. les QF quand le R16 est verrouillé et en cours), avec leur(s)
 * adversaire(s) à ce tour et les points espérés à ce tour et aux suivants.
 *
 * Ce module est PUR (aucun import React / Next / Supabase) et testé : il
 * contient ce qui vivait avant dans `PlanPicks.tsx` — le choix du tour affiché
 * (`tourDuTableau`) et la construction des lignes (`construireLignesTableau`).
 * Le composant `TableauJoueurs` ne fait plus que l'affichage.
 */

import type { PlayerInsight } from './insights';
import { adversairesPossibles } from './planAdversaires';
import type { DonneesPlan, ParticipantDonnees, SourceElo } from './planDonnees';
import { utilisesDe, type Monde } from './planEcran';

export interface CelluleTour {
  /** E[points | pické à ce tour] — inconditionnelle. */
  e: number;
  /** P(être encore en lice à ce tour). */
  presence: number;
  /** Écart-type des points. */
  sigma: number;
}

export interface AdversaireTour {
  nom: string;
  rang: number | null;
  elo: number;
  /** P(le joueur de la ligne bat cet adversaire). */
  pVictoire: number;
  /** Points projetés de ce duel pour le joueur de la ligne (réels s'il est joué). */
  points: number;
}

export interface LigneTableau {
  idx: number;
  id: string;
  nom: string;
  rang: number | null;
  elo: number;
  sourceElo: SourceElo;
  taName: string | null;
  candidatsElo: string[];
  moitie: 'top' | 'bottom';
  /**
   * Adversaire(s) au tour du pick : UN seul s'il est connu (duel voisin joué,
   * ou tour en cours), PLUSIEURS tant que le duel voisin n'est pas joué.
   * Vide : pas encore d'adversaire (exemption…).
   */
  adversaires: AdversaireTour[];
  /** Résultat du duel de CE tour s'il est déjà joué (tour en cours seulement). */
  resultat: 'gagne' | 'perdu' | null;
  /**
   * Le duel du tour en cours, quand le pick vise un tour plus loin (ex. R16
   * en cours, pick pour les QF) : à jouer contre qui, ou son résultat.
   */
  enCours: { round: string; contre: string | null; resultat: 'gagne' | 'perdu' | null } | null;
  parTour: Record<string, CelluleTour>;
  /** Déjà pické par ce participant à un autre tour. */
  utilise: boolean;
  /** Les autres participants qui l'ont déjà pické. */
  prisPar: { nom: string; round: string }[];
  insight: PlayerInsight | null;
}

export interface TourDuTableau {
  /** Le tour qui se joue (r0), ou le dernier si le tournoi est fini. */
  tourCourant: string;
  /** Le tour qu'on va picker : le premier tour libre, sinon le tour courant. */
  tourTableau: string;
  /** Nombre de tours entre le tour en cours (r0) et le tour du pick. 0 = le tour en cours. */
  ecartTours: number;
  /** Les colonnes de tours affichées : du tour du pick jusqu'à la finale. */
  roundsAffiches: string[];
}

/**
 * Quel tour le grand tableau montre-t-il ?
 * @param rounds           les tours du tournoi, dans l'ordre (ex. R32, R16, QF, SF, F)
 * @param r0               indice du premier tour non terminé
 * @param premierTourLibre le premier tour où le participant a encore un pick à poser (null s'il n'en a plus)
 */
export function tourDuTableau(rounds: string[], r0: number, premierTourLibre: string | null): TourDuTableau {
  const tourCourant = rounds[r0] ?? rounds[rounds.length - 1];
  const tourTableau = premierTourLibre ?? tourCourant;
  const i = rounds.indexOf(tourTableau);
  return {
    tourCourant,
    tourTableau,
    ecartTours: Math.max(0, i - r0),
    roundsAffiches: rounds.slice(i < 0 ? r0 : Math.max(i, r0)),
  };
}

export interface EntreeLignesTableau {
  d: DonneesPlan;
  monde: Pick<Monde, 't' | 'moments'>;
  /** Le participant dont on pose les picks (un élément de `d.participants`). */
  stock: ParticipantDonnees;
  insights: Record<string, PlayerInsight | null>;
  tour: TourDuTableau;
}

/** Les lignes du grand tableau. Liste vide si le tournoi est terminé. */
export function construireLignesTableau({ d, monde, stock, insights, tour }: EntreeLignesTableau): LigneTableau[] {
  if (d.r0 >= d.rounds.length) return [];
  const { tourTableau, tourCourant, ecartTours, roundsAffiches } = tour;
  const utilises = utilisesDe(stock);
  const { esp, ecart, presence } = monde.moments;
  const vivant = (j: number) => ecartTours === 0 || (presence[d.joueurs[j].id]?.[tourTableau] ?? 0) > 0;
  const out: LigneTableau[] = [];
  d.joueurs.forEach((j, idx) => {
    if (!presence[j.id]) return;
    // Plus loin que le tour en cours : seuls restent ceux qui peuvent encore y arriver.
    if (ecartTours > 0 && !((presence[j.id]?.[tourTableau] ?? 0) > 0)) return;
    // Adversaire(s) au tour du pick : connu, ou les possibles tant que le duel voisin n'est pas joué.
    const adversaires = adversairesPossibles(d.ouverture, idx, ecartTours, vivant).map((a) => {
      const f = ecartTours === 0 ? monde.t.fixe(idx, a) : undefined;
      return {
        nom: d.joueurs[a].nom,
        rang: d.joueurs[a].rang,
        elo: d.joueurs[a].elo,
        pVictoire: f ? (f.gagnantEstA ? 1 : 0) : monde.t.p(idx, a),
        points: monde.t.ep(idx, a),
      };
    });
    const partenaire = adversairesPossibles(d.ouverture, idx, 0, () => true)[0];
    const fixe = partenaire !== undefined ? monde.t.fixe(idx, partenaire) : undefined;
    const resultatEnCours = fixe ? (fixe.gagnantEstA ? 'gagne' : 'perdu') : null;
    const parTour: LigneTableau['parTour'] = {};
    for (const r of roundsAffiches) {
      const pres = presence[j.id]?.[r];
      if (pres === undefined) continue;
      parTour[r] = { e: esp[j.id]?.[r] ?? 0, presence: pres, sigma: ecart[j.id]?.[r] ?? 0 };
    }
    out.push({
      idx,
      id: j.id,
      nom: j.nom,
      rang: j.rang,
      elo: j.elo,
      sourceElo: j.sourceElo,
      taName: j.taName,
      candidatsElo: j.candidatsElo,
      moitie: j.moitie,
      adversaires,
      resultat: ecartTours === 0 ? resultatEnCours : null,
      enCours:
        ecartTours > 0
          ? {
              round: tourCourant,
              contre: partenaire !== undefined ? d.joueurs[partenaire].nom : null,
              resultat: resultatEnCours,
            }
          : null,
      parTour,
      utilise: utilises.has(idx),
      prisPar: d.participants
        .filter((p) => p !== stock)
        .flatMap((p) => p.picks.filter((k) => k.joueur === idx).map((k) => ({ nom: p.nom, round: k.round }))),
      insight: insights[j.id] ?? null,
    });
  });
  return out;
}
