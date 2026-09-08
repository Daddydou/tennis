/**
 * SIMULATEUR DE POINTS DE BRACKET
 *
 * Jeu distinct des picks et du Fantasy : chaque participant prédit le
 * VAINQUEUR DE CHAQUE MATCH du tableau, à partir d'un tour de départ choisi
 * (les quarts, par exemple). Une bonne prédiction rapporte 2^(numéro du tour
 * − 1) points, le numéro se comptant depuis le PREMIER TOUR DU TOURNOI — 1er
 * tour 1 pt, 2e tour 2 pts, 4, 8, 16, 32, 64 en finale sur un tableau de 128.
 *
 * Module PUR : ni I/O, ni Supabase, ni Elo — jamais de probabilité ici (cf.
 * lib/montecarlo.ts pour la partie tirage au sort). Il ne connaît que la
 * structure du tableau (qui joue qui, à quelle position) et des résultats,
 * réels ou hypothétiques.
 *
 * DEUX ARBRES DE NATURE DIFFÉRENTE partagent ce module :
 *   - le BRACKET RÉEL/SCÉNARIO (`resoudreArbre`) : UNE seule ligne de jeu
 *     cohérente — chaque tour découle du precédent par cascade (qui a gagné
 *     alimente qui affronte qui ensuite). C'est la référence contre laquelle
 *     on note tout le monde, réelle jusqu'à un point puis hypothétique au-delà
 *     (clics du scénario interactif, ou tirage Monte Carlo).
 *   - les PRONOSTICS d'un participant (`tn_bracket_predictions`, lus tels
 *     quels) : une prédiction INDÉPENDANTE par emplacement, jamais cascadée.
 *     Prédire qui gagnera la finale n'exige pas d'avoir correctement deviné
 *     les demies — chaque emplacement se juge seul (`scoreDuStock`), ce qui
 *     est aussi ce qui rend une prédiction sur un joueur déjà éliminé
 *     automatiquement nulle, sans code spécial : il ne peut plus être
 *     vainqueur d'aucun emplacement réel/simulé.
 *
 * Un match déjà joué verrouille TOUJOURS son vrai vainqueur dans l'arbre
 * réel/scénario, quel que soit `choix` — « les matchs déjà joués comptent
 * leurs vrais résultats ».
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

/* -------------------------------------------------------------------------- */
/*  RECHERCHE DU SCÉNARIO QUI GARANTIT LA VICTOIRE D'UN PARTICIPANT           */
/*                                                                            */
/*  Toujours pur : « garantir » se vérifie sur la structure du tableau et    */
/*  les pronostics, jamais sur une probabilité — c'est tout l'intérêt, ça    */
/*  dit ce qui est VRAI quel que soit le reste, pas ce qui est probable.     */
/* -------------------------------------------------------------------------- */

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
 * Carte de pronostics « virtuelle » pour un stock à ANCRE UNIQUE : le
 * joueur ancre occupe, par construction, tous SES PROPRES emplacements du
 * tableau à partir du tour de départ (son chemin, déterministe, cf.
 * `cheminDuJoueur`) — sans qu'il soit besoin de stocker un pronostic par
 * tour. Directement réutilisable par `scoreDuStock` / `maxAtteignable` /
 * `chercherScenariosGagnants`, qui ne connaissent qu'une carte plate
 * emplacement → joueur prédit : le modèle à ancre unique n'est donc qu'une
 * façon particulière de CONSTRUIRE cette carte, tout le reste du moteur
 * (score, plafond, recherche de scénario) reste inchangé.
 *
 * Si le joueur n'est pas trouvé au premier tour (identifiant inconnu,
 * tableau non constitué), la carte est vide — aucun pronostic à noter.
 */
export function predictionsDepuisAncre(
  matches: MatchReel[],
  rounds: string[],
  roundDepart: string,
  ancreId: string,
): Map<string, string> {
  const idxDepart = rounds.indexOf(roundDepart);
  const out = new Map<string, string>();
  if (idxDepart === -1) return out;
  for (const { round, position } of cheminDuJoueur(matches, rounds, ancreId)) {
    if (rounds.indexOf(round) >= idxDepart) out.set(cleDuel(round, position), ancreId);
  }
  return out;
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
  /** Points déjà gagnés avant le tour de départ — saisie manuelle. */
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
