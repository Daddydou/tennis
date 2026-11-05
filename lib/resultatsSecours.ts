/**
 * RÉSULTATS DE SECOURS — reprendre chez Thomas un résultat que notre source n'a pas encore.
 *
 * Nos résultats viennent de l'API tennis (import automatique, plan gratuit : un passage toutes les
 * 5 h 30 au plus, et la source elle-même a du retard). Game Tracker / l'app de Thomas, eux, ont le
 * résultat dès la fin du match. Résultat : Bracket et Picks calculés chez nous en retard sur eux
 * (Paris 2026 : Fritz bat Fils, 16 points absents chez nous pendant plus d'une heure).
 *
 * Ce module PUR décide quoi reprendre. Règles de prudence :
 *   - on ne REMPLIT que : un match sans vainqueur chez nous (statut `scheduled` ou `live`) ;
 *     jamais un vainqueur déjà connu, jamais un duel d'exemption ;
 *   - le vainqueur de Thomas doit être l'un des DEUX joueurs de notre match, retrouvé par le nom
 *     (`joueurDeThomas`) : sinon on ignore, on ne devine pas ;
 *   - le vainqueur avance dans le match suivant SEULEMENT si sa place y est vide ;
 *   - le prochain import officiel (source API) réécrit le match : la valeur de secours n'est
 *     qu'un relais, jamais définitive.
 * L'écriture vit dans db/resultatsSecoursThomas.ts.
 */
import { correspondanceTours, joueurDeThomas, type MatchInterne } from './bracketExternePont';
import { estPlaceSansNom, type BracketThomas } from './thomasApi';

/** Un match interne avec son vainqueur (tn_matches.winner_id). */
export interface MatchAvecVainqueur extends MatchInterne {
  winnerId: string | null;
}

/** Un set tel que le stocke tn_matches.sets : `g1` = jeux du joueur 1 de NOTRE match. */
export interface SetSecours {
  g1: number;
  g2: number;
  tb1: number | null;
  tb2: number | null;
}

export type StatutSecours = 'completed' | 'walkover' | 'retired';

export interface ResultatSecours {
  round: string;
  position: number;
  winnerId: string;
  status: StatutSecours;
  sets: SetSecours[];
  /** Place du vainqueur dans le match suivant, à remplir si elle est vide. */
  suivant: { round: string; position: number; colonne: 'player1_id' | 'player2_id' } | null;
}

/**
 * Score de Thomas (« 7-5 3-6 6-4 », « 7-6(3) 6-4 », « w/o », « 6-3 2-1 ret. ») -> sets de notre base.
 * Thomas écrit chaque set DU POINT DE VUE DU VAINQUEUR (jeux du vainqueur d'abord) ; le nombre entre
 * parenthèses est le tie-break du perdant du set, rangé du côté qui a le moins de jeux.
 */
export function lireScoreThomas(
  score: string | null,
  vainqueurEstJoueur1: boolean,
): { status: StatutSecours; sets: SetSecours[] } {
  const texte = (score ?? '').trim();
  if (/^w\/?o/i.test(texte)) return { status: 'walkover', sets: [] };
  const sets: SetSecours[] = [];
  for (const jeton of texte.split(/\s+/)) {
    const m = /^(\d+)-(\d+)(?:\((\d+)\))?$/.exec(jeton);
    if (!m) continue;
    const vainqueur = Number(m[1]);
    const perdant = Number(m[2]);
    const g1 = vainqueurEstJoueur1 ? vainqueur : perdant;
    const g2 = vainqueurEstJoueur1 ? perdant : vainqueur;
    const tb = m[3] !== undefined ? Number(m[3]) : null;
    sets.push({ g1, g2, tb1: tb !== null && g1 < g2 ? tb : null, tb2: tb !== null && g1 >= g2 ? tb : null });
  }
  return { status: /ret|abn|aband/i.test(texte) ? 'retired' : 'completed', sets };
}

export type PlanSecours =
  | { ok: true; resultats: ResultatSecours[]; ignores: string[] }
  | { ok: false; erreurs: string[] };

export function resultatsDeSecours(
  b: BracketThomas,
  rounds: string[],
  matchs: MatchAvecVainqueur[],
  nomsInternes: Map<string, string>,
): PlanSecours {
  const tours = correspondanceTours(b.tournoi.drawSize, rounds);
  if (!tours.ok) return { ok: false, erreurs: [tours.erreur] };

  const premierTour = new Map(matchs.filter((m) => m.round === tours.premierRound).map((m) => [m.position, m]));
  // Joueur interne de chaque position de tableau de Thomas, retrouvé par le nom.
  const idParPosition = new Map<number, string | null>();
  for (const j of b.joueurs) {
    if (!estPlaceSansNom(j)) idParPosition.set(j.position, joueurDeThomas(j, premierTour, nomsInternes));
  }

  const resultats: ResultatSecours[] = [];
  const ignores: string[] = [];
  for (const t of b.tours) {
    const round = tours.roundDuTour(t.tour);
    const suivantRound = rounds[rounds.indexOf(round) + 1] ?? null;
    for (const m of t.matchs) {
      if (m.vainqueur === null) continue;
      const interne = matchs.find((x) => x.round === round && x.position === m.index);
      // Rien à reprendre : match absent, exemption, ou déjà tranché chez nous.
      if (!interne || interne.status === 'bye' || interne.winnerId !== null) continue;
      if (interne.status && interne.status !== 'scheduled' && interne.status !== 'live') continue;

      const nom = `${round}, match ${m.index}`;
      const winnerId = idParPosition.get(m.vainqueur) ?? null;
      if (!winnerId) {
        ignores.push(`${nom} : vainqueur de Thomas (position ${m.vainqueur}) introuvable chez nous.`);
        continue;
      }
      if (winnerId !== interne.player1Id && winnerId !== interne.player2Id) {
        ignores.push(`${nom} : le vainqueur de Thomas n'est pas l'un des deux joueurs de notre match.`);
        continue;
      }
      const { status, sets } = lireScoreThomas(m.score, winnerId === interne.player1Id);
      resultats.push({
        round,
        position: m.index,
        winnerId,
        status,
        sets,
        suivant: suivantRound
          ? { round: suivantRound, position: Math.floor(m.index / 2), colonne: m.index % 2 === 0 ? 'player1_id' : 'player2_id' }
          : null,
      });
    }
  }
  return { ok: true, resultats, ignores };
}
