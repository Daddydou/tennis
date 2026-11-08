/**
 * Analyse « joueurs du tour » de l'écran Picks : pour chaque affiche du tour en
 * cours, les deux joueurs avec leur rang, leur Elo, leur adversaire, leur
 * probabilité de victoire et QUI les a pickés (Moi, Laki, Thomas...).
 *
 * Module PUR (ni Next ni Supabase) : il ne fait que relire les `DonneesPlan`
 * déjà construites pour le plan. Il reste affichable quand tous les picks sont
 * posés (le plan, lui, n'a alors plus rien à proposer).
 */
import { pVictoire } from './elo';
import type { DonneesPlan } from './planDonnees';

export interface PickDeJoueur {
  participant: string;
  round: string;
}

export interface LigneAnalyse {
  nom: string;
  rang: number | null;
  elo: number;
  /** Adversaire de l'affiche (null = pas encore connu / bye). */
  adversaire: { nom: string; elo: number } | null;
  /** Chance de gagner l'affiche (0..1), null sans adversaire. Cotes si connues, sinon Elo. */
  proba: number | null;
  /** attente = à jouer ; gagne / perdu = affiche jouée. */
  etat: 'attente' | 'gagne' | 'perdu';
  /** Tous les picks de ce joueur, tous participants, tous tours. */
  picks: PickDeJoueur[];
}

export interface AfficheAnalyse {
  /** Libellé du tour (code du tour, ex « QF »). */
  round: string;
  lignes: [LigneAnalyse, LigneAnalyse];
}

/** Affiches du tour en cours (celui que le plan appelle r0). Vide si le tournoi est terminé. */
export function construireAnalyseJoueurs(d: DonneesPlan): AfficheAnalyse[] {
  if (d.r0 >= d.rounds.length) return [];
  const round = d.rounds[d.r0];

  const picksDe = (j: number): PickDeJoueur[] =>
    d.participants.flatMap((p) => p.picks.filter((k) => k.joueur === j).map((k) => ({ participant: p.nom, round: k.round })));

  const proba = (a: number, b: number): number => {
    const m = d.blend.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
    if (m) return m[0] === a ? m[2] : 1 - m[2];
    return pVictoire(d.joueurs[a].elo, d.joueurs[b].elo);
  };

  const affiches: AfficheAnalyse[] = [];
  for (let i = 0; i + 1 < d.ouverture.length; i += 2) {
    const a = d.ouverture[i];
    const b = d.ouverture[i + 1];
    if (a === null && b === null) continue;
    const fixe = a !== null && b !== null ? d.fixes.find((f) => (f.a === a && f.b === b) || (f.a === b && f.b === a)) : undefined;
    const gagnant = fixe ? (fixe.gagnantEstA ? fixe.a : fixe.b) : null;

    const ligne = (j: number | null, adv: number | null): LigneAnalyse | null => {
      if (j === null) return null;
      const jp = d.joueurs[j];
      return {
        nom: jp.nom,
        rang: jp.rang,
        elo: Math.round(jp.elo),
        adversaire: adv === null ? null : { nom: d.joueurs[adv].nom, elo: Math.round(d.joueurs[adv].elo) },
        proba: adv === null ? null : proba(j, adv),
        etat: gagnant === null ? 'attente' : gagnant === j ? 'gagne' : 'perdu',
        picks: picksDe(j),
      };
    };

    const la = ligne(a, b);
    const lb = ligne(b, a);
    // Une affiche avec un seul joueur connu (adversaire pas encore inscrit) : on montre quand même le joueur.
    const vide = (): LigneAnalyse => ({
      nom: 'À déterminer',
      rang: null,
      elo: 0,
      adversaire: null,
      proba: null,
      etat: 'attente',
      picks: [],
    });
    affiches.push({ round, lignes: [la ?? vide(), lb ?? vide()] });
  }
  return affiches;
}
