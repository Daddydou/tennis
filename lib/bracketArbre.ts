/**
 * Arbre du Bracket : résolution du tableau (réel ou scénario), atteignabilité
 * et scores des stocks de pronostics. Module PUR — cf. l'en-tête de
 * lib/bracketSim.ts, point d'entrée qui réexporte ce fichier.
 */

/** Un match réel, tel qu'il est en base — jamais une hypothèse. */
export interface MatchReel {
  round: string;
  /** Position du match dans son tour, 0-based, dans l'ordre du tableau. */
  position: number;
  player1Id: string | null;
  player2Id: string | null;
  /** Connu seulement si le match a une issue décidée (cf. STATUTS_DECIDES). */
  winnerId: string | null;
}

/** Clé stable d'un emplacement du tableau — sert d'index partout. */
export function cleDuel(round: string, position: number): string {
  return `${round}|${position}`;
}

/** Points d'une bonne prédiction à ce tour : 2^(index du tour depuis le premier). */
export function pointsDuTour(rounds: string[], round: string): number {
  const i = rounds.indexOf(round);
  return i === -1 ? 0 : 2 ** i;
}

/** Un emplacement du tableau, résolu selon une source donnée (réel/pronostic/scénario). */
export interface EmplacementDuel {
  round: string;
  position: number;
  a: string | null;
  b: string | null;
  vainqueur: string | null;
  /** Le vainqueur vient d'un résultat réel déjà joué — non modifiable. */
  verrouille: boolean;
}

export interface ArbreResolu {
  /** Tours couverts, du premier tour du tournoi à la finale (ou jusqu'où le tableau va). */
  rounds: string[];
  duels: EmplacementDuel[];
}

/**
 * Résout l'arbre complet du tournoi, tour par tour depuis le premier tour.
 *
 * Pour chaque duel dont les deux entrants sont connus :
 *   - s'il est déjà joué, le vrai vainqueur est verrouillé ;
 *   - sinon, `choix(round, position, a, b)` décide (ou renvoie `null` si rien
 *     n'est encore choisi).
 * Un duel dont un entrant manque encore reste indéterminé (on ne devine rien
 * au-delà de ce qui est structurellement connu).
 */
export function resoudreArbre(
  matches: MatchReel[],
  rounds: string[],
  choix: (round: string, position: number, a: string, b: string) => string | null,
): ArbreResolu {
  const premier = rounds[0];
  if (!premier) return { rounds: [], duels: [] };

  const parCle = new Map<string, MatchReel>();
  for (const m of matches) parCle.set(cleDuel(m.round, m.position), m);

  const grille: (string | null)[] = [];
  for (const m of [...matches]
    .filter((m) => m.round === premier)
    .sort((x, y) => x.position - y.position)) {
    grille.push(m.player1Id);
    grille.push(m.player2Id);
  }
  if (grille.length === 0) return { rounds: [], duels: [] };

  const duels: EmplacementDuel[] = [];
  const roundsRemplis: string[] = [];
  let actuels = grille;

  for (const round of rounds) {
    if (actuels.length < 2) break;
    // Un bye n'existe QUE dans la grille initiale (premier tour) : un trou
    // dans un tour suivant est un résultat pas encore déterminé, jamais une
    // place structurellement vide — les deux ne doivent pas se confondre,
    // sans quoi un match futur non décidé « avancerait » tout seul le seul
    // camp déjà connu.
    const estPremierTour = roundsRemplis.length === 0;
    roundsRemplis.push(round);

    const suivants: (string | null)[] = [];
    for (let i = 0; i < actuels.length; i += 2) {
      const a = actuels[i] ?? null;
      const b = actuels[i + 1] ?? null;
      const position = i / 2;

      let vainqueur: string | null = null;
      let verrouille = false;

      const reel = parCle.get(cleDuel(round, position));
      if (reel?.winnerId) {
        // Le vrai résultat verrouille TOUJOURS, même si l'adversaire n'est
        // pas encore structurellement connu (b encore null) : c'est
        // exactement le cas d'une hypothèse « ce joueur gagne ce tour »
        // posée avant que son adversaire ne soit lui-même déterminé (cf.
        // `augmenterAvecVictoires`). Sur un match réel, a et b sont de
        // toute façon déjà connus dès qu'un vainqueur l'est — ce chemin ne
        // change donc rien pour les données réelles.
        vainqueur = reel.winnerId;
        verrouille = true;
      } else if (a && b) {
        vainqueur = choix(round, position, a, b);
      } else if (estPremierTour) {
        // Bye du tirage : zéro ou un entrant, rien à décider — l'unique
        // candidat avance s'il existe.
        vainqueur = a ?? b ?? null;
        verrouille = vainqueur !== null;
      }
      // Tour suivant avec un entrant manquant et aucun résultat réel : le
      // match qui l'alimente n'est pas encore résolu — ce duel reste
      // indéterminé (vainqueur null).

      duels.push({ round, position, a, b, vainqueur, verrouille });
      suivants.push(vainqueur);
    }

    actuels = suivants;
  }

  return { rounds: roundsRemplis, duels };
}

/** Duels d'un tour, dans l'ordre du tableau. */
export function duelsDuTour(arbre: ArbreResolu, round: string): EmplacementDuel[] {
  return arbre.duels.filter((d) => d.round === round);
}

/**
 * Pour chaque emplacement futur, l'ensemble des joueurs RÉELS encore
 * susceptibles d'y figurer — fait tiré des seules éliminations déjà
 * survenues, aucune probabilité. Sert à juger si une prédiction est encore
 * atteignable : un joueur déjà éliminé ne peut plus faire gagner personne.
 */
export function ensemblesAtteignables(
  matches: MatchReel[],
  rounds: string[],
): Map<string, Set<string>> {
  const premier = rounds[0];
  const out = new Map<string, Set<string>>();
  if (!premier) return out;

  const parCle = new Map<string, MatchReel>();
  for (const m of matches) parCle.set(cleDuel(m.round, m.position), m);

  const grille: Set<string>[] = [];
  for (const m of [...matches]
    .filter((m) => m.round === premier)
    .sort((x, y) => x.position - y.position)) {
    grille.push(new Set(m.player1Id ? [m.player1Id] : []));
    grille.push(new Set(m.player2Id ? [m.player2Id] : []));
  }

  let actuels = grille;
  for (const round of rounds) {
    if (actuels.length < 2) break;
    const suivants: Set<string>[] = [];
    for (let i = 0; i < actuels.length; i += 2) {
      const position = i / 2;
      const reel = parCle.get(cleDuel(round, position));
      const ensemble = reel?.winnerId
        ? new Set([reel.winnerId])
        : new Set([...(actuels[i] ?? []), ...(actuels[i + 1] ?? [])]);
      out.set(cleDuel(round, position), ensemble);
      suivants.push(ensemble);
    }
    actuels = suivants;
  }
  return out;
}

/** Vainqueur réel d'un emplacement, seulement si le match y est déjà décidé. */
export function vainqueursReels(matches: MatchReel[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of matches) if (m.winnerId) out.set(cleDuel(m.round, m.position), m.winnerId);
  return out;
}

/**
 * Ne garde, dans une carte de pronostics, que les emplacements À PARTIR d'un
 * tour donné (inclus). Les points des tours antérieurs au tour de départ
 * sont saisis à la main (« déjà gagnés »), jamais recalculés : les compter
 * aussi via `scoreDuStock` les compterait deux fois.
 */
export function filtrerDepuisTour(
  predictions: ReadonlyMap<string, string>,
  rounds: string[],
  roundDepart: string,
): Map<string, string> {
  const idxDepart = rounds.indexOf(roundDepart);
  const out = new Map<string, string>();
  for (const [cle, playerId] of predictions) {
    const idx = rounds.indexOf(cle.split('|')[0]);
    if (idx >= idxDepart) out.set(cle, playerId);
  }
  return out;
}

/**
 * Complément de `filtrerDepuisTour` : ne garde que les emplacements STRICTEMENT
 * AVANT un tour donné (exclu). Sert à isoler les pronostics des tours déjà
 * dépassés par le tour de simulation choisi — leurs points (« déjà gagnés »)
 * ne doivent jamais être recomptés avec ceux du tour choisi lui-même (les
 * « simulés »), sans quoi un même emplacement compterait deux fois.
 */
export function filtrerAvantTour(
  predictions: ReadonlyMap<string, string>,
  rounds: string[],
  roundDepart: string,
): Map<string, string> {
  const idxDepart = rounds.indexOf(roundDepart);
  const out = new Map<string, string>();
  for (const [cle, playerId] of predictions) {
    const idx = rounds.indexOf(cle.split('|')[0]);
    if (idx !== -1 && idx < idxDepart) out.set(cle, playerId);
  }
  return out;
}

/**
 * Complément de `filtrerDepuisTour`/`filtrerAvantTour` : ne garde que les
 * emplacements STRICTEMENT APRÈS un tour donné (exclu). Sert au « max
 * possible » (cf. `maxPossibleStock`) : les tours avant sont déjà comptés
 * dans le « déjà gagné » automatique, et le tour lui-même est déjà tranché
 * par les points « simulés » du scénario affiché — seuls les tours encore à
 * venir après doivent alimenter la marge de progression restante.
 */
export function filtrerApresTour(
  predictions: ReadonlyMap<string, string>,
  rounds: string[],
  roundActuel: string,
): Map<string, string> {
  const idxActuel = rounds.indexOf(roundActuel);
  const out = new Map<string, string>();
  for (const [cle, playerId] of predictions) {
    const idx = rounds.indexOf(cle.split('|')[0]);
    if (idx !== -1 && idx > idxActuel) out.set(cle, playerId);
  }
  return out;
}

/**
 * Score d'un stock de prédictions contre une référence (le scénario en
 * cours, ou la réalité pure) : la somme des points de tour partout où la
 * prédiction correspond exactement au vainqueur de la référence à ce même
 * emplacement.
 *
 * Aucune notion de « bon cheminement » à vérifier séparément : un joueur ne
 * peut être vainqueur d'un emplacement, dans la référence, que s'il y est
 * structurellement parvenu — une prédiction bâtie sur une hypothèse déjà
 * démentie ne peut donc jamais coïncider par accident.
 */
export function scoreDuStock(
  predictions: ReadonlyMap<string, string>,
  reference: ArbreResolu,
  rounds: string[],
): number {
  let total = 0;
  for (const duel of reference.duels) {
    if (duel.vainqueur === null) continue;
    const predit = predictions.get(cleDuel(duel.round, duel.position));
    if (predit && predit === duel.vainqueur) total += pointsDuTour(rounds, duel.round);
  }
  return total;
}

/**
 * Maximum encore atteignable par un stock : les points déjà acquis sur les
 * matchs décidés, plus ceux de chaque prédiction restante encore vivante
 * (le joueur prédit n'est pas encore éliminé et peut structurellement
 * atteindre cet emplacement). « Si toutes ses prédictions restantes se
 * réalisent » — indépendant de tout scénario en cours d'exploration.
 */
export function maxAtteignable(
  predictions: ReadonlyMap<string, string>,
  matches: MatchReel[],
  rounds: string[],
  atteignables: Map<string, Set<string>>,
): number {
  const reels = vainqueursReels(matches);
  let total = 0;
  for (const [cle, predit] of predictions) {
    const round = cle.split('|')[0];
    const reel = reels.get(cle);
    if (reel !== undefined) {
      if (reel === predit) total += pointsDuTour(rounds, round);
    } else if (atteignables.get(cle)?.has(predit)) {
      total += pointsDuTour(rounds, round);
    }
  }
  return total;
}

/**
 * Max possible affiché pour un stock, au tour actuellement choisi : déjà
 * gagné (tours avant, verrouillé) + simulés (tour choisi, selon le scénario
 * affiché) + ce qui reste ENCORE atteignable sur les tours STRICTEMENT APRÈS
 * le tour choisi (`filtrerApresTour` + `maxAtteignable`).
 *
 * Jamais les tours avant (déjà comptés dans « déjà gagné » — les réadditionner
 * via `maxAtteignable`, qui ne sait pas qu'un match est déjà décidé pour de
 * bon plutôt que « encore atteignable », doublerait leurs points) ni le tour
 * choisi lui-même (déjà tranché par « simulés » selon le scénario affiché —
 * un pronostic concurrent sur ce même emplacement n'est plus qu'une
 * hypothèse écartée, pas une marge de progression restante).
 *
 * S'il ne reste aucun tour après le tour choisi (on est à la finale, le
 * dernier tour du tableau), le max possible est EXACTEMENT déjà gagné +
 * simulés, sans rien ajouter : un stock à 100 % de victoire doit alors
 * afficher un max égal à son total, jamais une marge illusoire.
 */
export function maxPossibleStock(
  dejaGagne: number,
  simules: number,
  predictions: ReadonlyMap<string, string>,
  matches: MatchReel[],
  rounds: string[],
  roundActuel: string,
  atteignables: Map<string, Set<string>>,
): number {
  const idxActuel = rounds.indexOf(roundActuel);
  if (idxActuel === -1 || idxActuel >= rounds.length - 1) return dejaGagne + simules;
  const apres = filtrerApresTour(predictions, rounds, roundActuel);
  return dejaGagne + simules + maxAtteignable(apres, matches, rounds, atteignables);
}
