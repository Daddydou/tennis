/* -------------------------------------------------------------------------- */
/*  RECHERCHE DU SCÉNARIO QUI GARANTIT LA VICTOIRE D'UN PARTICIPANT           */
/*                                                                            */
/*  Toujours pur : « garantir » se vérifie sur la structure du tableau et    */
/*  les pronostics, jamais sur une probabilité — c'est tout l'intérêt, ça    */
/*  dit ce qui est VRAI quel que soit le reste, pas ce qui est probable.     */
/* -------------------------------------------------------------------------- */

import {
  cleDuel,
  ensemblesAtteignables,
  filtrerDepuisTour,
  maxAtteignable,
  resoudreArbre,
  scoreDuStock,
  type MatchReel,
} from './bracketArbre';

/** Un événement simple : ce joueur gagne son match à ce tour (l'atteint ET
 * le remporte). Au dernier tour du tableau, ça veut dire « remporte le
 * tournoi ». */
export interface EvenementSimple {
  playerId: string;
  round: string;
}

/**
 * Séquence des emplacements (round, position) qu'occuperait un joueur à
 * chaque tour du tournoi, du premier tour à la finale — déduite une fois
 * pour toutes de sa place de départ (division de position par 2 à chaque
 * tour, la même construction que la grille de `resoudreArbre`).
 *
 * Renvoie [] si le joueur n'apparaît pas au premier tour (identifiant
 * inconnu, ou tableau non encore constitué).
 */
export function cheminDuJoueur(
  matches: MatchReel[],
  rounds: string[],
  playerId: string,
): { round: string; position: number }[] {
  const premier = rounds[0];
  if (!premier) return [];

  const matchsPremier = [...matches]
    .filter((m) => m.round === premier)
    .sort((a, b) => a.position - b.position);

  let grillePos = -1;
  for (const m of matchsPremier) {
    if (m.player1Id === playerId) {
      grillePos = m.position * 2;
      break;
    }
    if (m.player2Id === playerId) {
      grillePos = m.position * 2 + 1;
      break;
    }
  }
  if (grillePos === -1) return [];

  const chemin: { round: string; position: number }[] = [];
  for (let i = 0; i < rounds.length; i++) {
    chemin.push({ round: rounds[i], position: Math.floor(grillePos / 2 ** (i + 1)) });
  }
  return chemin;
}

/**
 * Matchs réels, augmentés d'une hypothèse : `playerId` gagne tous ses matchs
 * jusqu'à `jusquauRound` inclus (un tour déjà décidé pour de vrai avec
 * `playerId` vainqueur ne change rien). Sert à évaluer « si ce joueur va
 * aussi loin, quel devient le score garanti/plafond de chacun ».
 *
 * Renvoie `null` si l'hypothèse est déjà IMPOSSIBLE : le joueur est éliminé
 * réellement à ou avant `jusquauRound`, ou le tableau n'y est pas constitué.
 */
export function augmenterAvecVictoires(
  matches: MatchReel[],
  rounds: string[],
  playerId: string,
  jusquauRound: string,
): MatchReel[] | null {
  const idxJusquau = rounds.indexOf(jusquauRound);
  const chemin = cheminDuJoueur(matches, rounds, playerId);
  if (idxJusquau === -1 || chemin.length === 0) return null;

  const out = matches.map((m) => ({ ...m }));
  const parCle = new Map<string, MatchReel>();
  for (const m of out) parCle.set(cleDuel(m.round, m.position), m);

  for (let i = 0; i <= idxJusquau; i++) {
    const m = parCle.get(cleDuel(chemin[i].round, chemin[i].position));
    if (!m) return null;
    if (m.winnerId && m.winnerId !== playerId) return null; // déjà éliminé réellement
    m.winnerId = playerId;
  }
  return out;
}

/**
 * Combine plusieurs hypothèses de victoire (cf. `augmenterAvecVictoires`) en
 * détectant une CONTRADICTION structurelle : si deux joueurs devraient tous
 * deux être vainqueurs du même emplacement (leurs chemins se croisent avant
 * que les deux hypothèses ne soient acquises — ils se seraient affrontés),
 * la combinaison est impossible.
 */
export function augmenterAvecPlusieursVictoires(
  matches: MatchReel[],
  rounds: string[],
  evenements: EvenementSimple[],
): MatchReel[] | null {
  let courant = matches;
  for (const e of evenements) {
    const suivant = augmenterAvecVictoires(courant, rounds, e.playerId, e.round);
    if (!suivant) return null;
    courant = suivant;
  }
  return courant;
}

/** Un stock, pour la recherche de scénario garanti — mêmes champs que pour le Monte Carlo. */
export interface StockGarantie {
  id: string;
  /** Points déjà gagnés avant le tour de départ — calculés automatiquement en amont, jamais saisis à la main. */
  dejaGagne: number;
  /** Pronostic complet du stock (filtré ou non : cette fonction refiltre elle-même). */
  predictions: ReadonlyMap<string, string>;
}

/**
 * Le score du stock `idCible` est-il GARANTI supérieur à celui de tous les
 * autres, quel que soit le reste des résultats, une fois l'hypothèse
 * `matchesAugmentes` posée ? Le stock visé ne reçoit QUE son score minimum
 * garanti (rien d'autre ne lui est acquis) ; chaque autre reçoit son score
 * MAXIMUM possible — la comparaison la plus défavorable qui puisse exister
 * pour le stock visé.
 */
function garantitVictoire(
  matchesAugmentes: MatchReel[],
  rounds: string[],
  roundDepart: string,
  stocks: StockGarantie[],
  idCible: string,
): boolean {
  const reference = resoudreArbre(matchesAugmentes, rounds, () => null);
  const atteignables = ensemblesAtteignables(matchesAugmentes, rounds);

  const cible = stocks.find((s) => s.id === idCible)!;
  const predsCible = filtrerDepuisTour(cible.predictions, rounds, roundDepart);
  const minCible = cible.dejaGagne + scoreDuStock(predsCible, reference, rounds);

  return stocks.every((s) => {
    if (s.id === idCible) return true;
    const preds = filtrerDepuisTour(s.predictions, rounds, roundDepart);
    const maxAutre = s.dejaGagne + maxAtteignable(preds, matchesAugmentes, rounds, atteignables);
    return minCible > maxAutre;
  });
}

/**
 * Au-delà de ce nombre de candidats simples, la recherche de COMBINAISONS
 * (coût quadratique) est abandonnée — seuls les événements simples restent
 * testés. Choisi pour rester instantané même sur un tableau de 128 : avec
 * des pronostics typiquement posés sur une poignée de joueurs par stock (les
 * seuls candidats retenus, cf. plus bas), ce plafond n'est atteint qu'au cas
 * extrême d'un pronostic complet renseigné dès le premier tour d'un grand
 * chelem. Approche documentée plutôt qu'une heuristique approximative,
 * jamais nécessaire à l'usage réel du jeu (tour de départ choisi tard, champ
 * de candidats déjà restreint par les éliminations).
 */
const LIMITE_CANDIDATS_COMBINAISONS = 60;

/**
 * Pour chaque stock, cherche un événement simple (« X gagne son match au
 * tour R », y compris « remporte le tournoi » au dernier tour) ou, à défaut,
 * une combinaison de deux événements portant sur deux joueurs DIFFÉRENTS,
 * qui GARANTIT sa victoire finale quel que soit le reste des résultats. Un
 * événement simple est toujours préféré à une combinaison. Absence de
 * résultat pour un stock = rien ne garantit sa victoire, même en combinant
 * deux événements — la situation reste trop ouverte pour se prononcer.
 *
 * Recherche restreinte aux joueurs qui apparaissent dans au moins un
 * pronostic à partir du tour de départ : un joueur que personne n'a prédit
 * ne peut jamais différencier deux scores, quelle que soit son issue — le
 * retenir comme candidat ne testerait jamais rien d'utile. C'est cette seule
 * restriction, pas un tri par probabilité, qui ramène la recherche à
 * quelques dizaines de candidats en pratique (cf. `LIMITE_CANDIDATS_COMBINAISONS`
 * pour le filet de sécurité au-delà).
 */
export function chercherScenariosGagnants(
  matches: MatchReel[],
  rounds: string[],
  roundDepart: string,
  stocks: StockGarantie[],
): Map<string, EvenementSimple[]> {
  const out = new Map<string, EvenementSimple[]>();
  if (stocks.length < 2) return out;

  const idxDepart = rounds.indexOf(roundDepart);
  if (idxDepart === -1) return out;
  const roundsRestants = rounds.slice(idxDepart);

  const joueursPertinents = new Set<string>();
  for (const s of stocks) {
    for (const playerId of filtrerDepuisTour(s.predictions, rounds, roundDepart).values()) {
      joueursPertinents.add(playerId);
    }
  }

  interface Candidat {
    evenement: EvenementSimple;
    matches: MatchReel[];
  }
  const candidats: Candidat[] = [];
  for (const playerId of joueursPertinents) {
    for (const round of roundsRestants) {
      const augmentes = augmenterAvecVictoires(matches, rounds, playerId, round);
      if (augmentes) candidats.push({ evenement: { playerId, round }, matches: augmentes });
    }
  }

  for (const s of stocks) {
    const simple = candidats.find((c) => garantitVictoire(c.matches, rounds, roundDepart, stocks, s.id));
    if (simple) {
      out.set(s.id, [simple.evenement]);
      continue;
    }

    if (candidats.length > LIMITE_CANDIDATS_COMBINAISONS) continue;

    combo: for (let i = 0; i < candidats.length; i++) {
      for (let j = i + 1; j < candidats.length; j++) {
        const a = candidats[i];
        const b = candidats[j];
        // Le même joueur à deux tours se ramène à l'événement le plus fort,
        // déjà couvert par la passe « simple » ci-dessus.
        if (a.evenement.playerId === b.evenement.playerId) continue;
        const combine = augmenterAvecPlusieursVictoires(matches, rounds, [a.evenement, b.evenement]);
        if (!combine) continue; // chemins incompatibles (se seraient affrontés)
        if (garantitVictoire(combine, rounds, roundDepart, stocks, s.id)) {
          out.set(s.id, [a.evenement, b.evenement]);
          break combo;
        }
      }
    }
  }

  return out;
}
