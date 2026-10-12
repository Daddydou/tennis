/**
 * PONT BRACKET DE THOMAS -> PRONOSTICS DU SIMULATEUR
 *
 * Traduit les pronostics de l'app de Thomas (tn_bracket_externe_*, cf.
 * lib/thomasApi.ts) en lignes tn_bracket_round_picks, la table que lit le
 * Bracket du Simulateur (et qu'alimentent aussi la saisie manuelle et
 * l'import Game Tracker). Module PUR : l'écriture vit dans
 * db/bracketExternePont.ts.
 *
 * CORRESPONDANCE, vérifiée sur l'US Open WTA 2026 (cf. tests) :
 *   - tour `t` de Thomas  = rounds[t − 1 + décalage] chez nous, où
 *     décalage = rounds.length − log2(drawSize) (0 quand les deux tableaux
 *     ont la même taille) ;
 *   - `match_index`       = `position` (0-based des deux côtés, même ordre
 *     de tableau : le match i du tour t couvre les positions
 *     [i·2^t + 1, (i+1)·2^t]) ;
 *   - position de tableau p (1..drawSize) = joueur du PREMIER tour couvert,
 *     match floor((p−1)/2), player1 si p impair, player2 si p pair.
 *
 * Jamais par `apiPlayerId` : il diffère de notre player_id pour une partie
 * des joueuses (5 sur 128 à l'US Open WTA 2026). La position, elle, ne
 * ment pas — mais on la RECOUPE quand même avec le nom (`verifierJoueurs`) :
 * un seul désaccord et le tournoi entier est refusé, rien n'est écrit.
 *
 * Participants : même mapping pseudo -> stock que l'import Game Tracker
 * (`resoudreParticipant`, lib/bracketImport.ts) — une seule source de vérité.
 */
import { resoudreParticipant } from './bracketImport';
import { clesCandidates } from './matching';
import { estExemption, estNonDesignee, estPlaceSansNom, nomJoueurThomas, type BracketThomas } from './thomasApi';

/** Un match du tableau interne (tn_matches), réduit à ce dont le pont a besoin. */
export interface MatchInterne {
  round: string;
  position: number;
  player1Id: string | null;
  player2Id: string | null;
  /** tn_matches.status ; 'bye' = duel d'exemption, jamais pronostiqué. */
  status?: string | null;
}

/** Un pronostic à écrire dans tn_bracket_round_picks (participantId null = moi). */
export interface PronosticDerive {
  participantId: string | null;
  round: string;
  position: number;
  playerId: string;
}

/** Une ligne déjà présente dans tn_bracket_round_picks. */
export interface PronosticExistant extends PronosticDerive {
  id: string;
}

export type CorrespondanceTours =
  | { ok: true; decalage: number; premierRound: string; roundDuTour: (tour: number) => string }
  | { ok: false; erreur: string };

/** Tour de Thomas -> code de tour interne, ou erreur si les deux tableaux ne se superposent pas. */
export function correspondanceTours(drawSize: number, rounds: string[]): CorrespondanceTours {
  const nbTours = Math.log2(drawSize);
  if (!Number.isInteger(nbTours) || drawSize < 2) {
    return { ok: false, erreur: `drawSize ${drawSize} de Thomas n'est pas une puissance de 2.` };
  }
  const decalage = rounds.length - nbTours;
  if (decalage < 0) {
    return {
      ok: false,
      erreur: `tableau de Thomas (${drawSize}, ${nbTours} tours) plus grand que le nôtre (${rounds.length} tours : ${rounds.join(', ') || 'aucun'}).`,
    };
  }
  return {
    ok: true,
    decalage,
    premierRound: rounds[decalage],
    roundDuTour: (tour) => rounds[tour - 1 + decalage],
  };
}

/** Joueur interne à la position de tableau `p` (1-based), ou null (exemption, match absent). */
export function joueurDePosition(p: number, premierTour: Map<number, MatchInterne>): string | null {
  const m = premierTour.get(Math.floor((p - 1) / 2));
  if (!m) return null;
  return p % 2 === 1 ? m.player1Id : m.player2Id;
}

/**
 * Le même joueur ? Au moins une clé de nom commune (« Xinyu WANG » / « X. Wang »),
 * prénom et nom de Thomas pris dans les DEUX ordres : pour un nom chinois,
 * l'ordre varie d'une source à l'autre (« Bu YUNCHAOKETE » chez Thomas,
 * « Y. Bu » chez nous, Shanghai 2026).
 */
function memeNom(prenom: string | null, nom: string | null, nomInterne: string): boolean {
  const cles = new Set(clesCandidates(nomInterne));
  return [`${prenom} ${nom}`, `${nom} ${prenom}`].some((n) => clesCandidates(n).some((c) => cles.has(c)));
}

/**
 * Recoupe chaque joueur de Thomas avec le joueur interne à la même position.
 * Une place sans nom chez Thomas (exemption, ou lucky loser pas encore
 * désignée) doit être une place VIDE chez nous.
 * Renvoie la liste des désaccords (vide = tableaux superposables).
 */
export function verifierJoueurs(
  b: BracketThomas,
  premierTour: Map<number, MatchInterne>,
  nomsInternes: Map<string, string>,
): string[] {
  const erreurs: string[] = [];
  for (const j of b.joueurs) {
    const nomThomas = nomJoueurThomas(j);
    const id = joueurDePosition(j.position, premierTour);
    if (estPlaceSansNom(j)) {
      const quoi = estExemption(j) ? 'exemption' : 'lucky loser non désignée';
      if (id !== null) erreurs.push(`Position ${j.position} : ${quoi} chez Thomas, ${nomsInternes.get(id) ?? id} chez nous.`);
      continue;
    }
    if (id === null) {
      erreurs.push(`Position ${j.position} (${nomThomas}) : aucun joueur à cette place chez nous.`);
      continue;
    }
    const nomInterne = nomsInternes.get(id);
    if (!nomInterne || !memeNom(j.prenom, j.nom, nomInterne)) {
      erreurs.push(`Position ${j.position} : ${nomThomas} chez Thomas, ${nomInterne ?? id} chez nous.`);
    }
  }
  return erreurs;
}

export type Derivation =
  | {
      ok: true;
      pronostics: PronosticDerive[];
      /** Pseudos de Thomas sans stock chez nous : leurs pronostics sont ignorés. */
      pseudosInconnus: string[];
      /** Pronostics sans position (rien de choisi) : ignorés. */
      sansPronostic: number;
      /**
       * Duels d'exemption chez nous (tn_matches.status = 'bye') : ignorés,
       * pronostics compris. Ils ne rapportent rien chez Thomas, et le Bracket
       * du Simulateur compterait des points sur un pronostic écrit là.
       */
      exemptionsIgnorees: number;
      /**
       * Pronostics sur une lucky loser pas encore désignée : NON écrits
       * (player_id ne peut pas être nul). Une synchro ultérieure les écrira
       * quand la place sera nommée chez Thomas et chez nous.
       */
      enAttenteNonDesignee: number;
      /**
       * Duels d'exemption CHEZ NOUS (status 'bye') où Thomas n'a pas de BYE :
       * le match se jouera (Wuhan 2026, match 5 : Parry contre une LL à
       * nommer). Ignorés comme les autres, mais signalés à part — PAS dans
       * `exemptionsIgnorees` — car c'est notre tableau qu'il faut réimporter.
       */
      byesSuspects: ByeSuspect[];
    }
  | { ok: false; erreurs: string[] };

export interface ByeSuspect {
  /** Index du match au premier tour (= tn_matches.position). */
  match: number;
  /** Positions de tableau vides chez nous, occupées par une joueuse chez Thomas. */
  positions: number[];
  /** Pronostics (avec position) des participants connus, ignorés sur ce duel. */
  pronosticsIgnores: number;
}

/**
 * Tous les pronostics de Thomas, traduits en emplacements internes. Refuse
 * en bloc (aucun pronostic) si les tours ou les joueurs ne se superposent
 * pas : mieux vaut ne rien écrire qu'écrire au mauvais emplacement.
 */
export function deriverPronostics(
  b: BracketThomas,
  rounds: string[],
  matchsPremierTour: MatchInterne[],
  nomsInternes: Map<string, string>,
  participants: { id: string; name: string }[],
): Derivation {
  const tours = correspondanceTours(b.tournoi.drawSize, rounds);
  if (!tours.ok) return { ok: false, erreurs: [tours.erreur] };

  const premierTour = new Map(
    matchsPremierTour.filter((m) => m.round === tours.premierRound).map((m) => [m.position, m]),
  );
  const erreurs = verifierJoueurs(b, premierTour, nomsInternes);
  if (erreurs.length) return { ok: false, erreurs };

  const stockDe = new Map<string, string | null>();
  const pseudosInconnus: string[] = [];
  for (const p of b.participants) {
    const r = resoudreParticipant(p.pseudo, participants);
    if (r.ok) stockDe.set(p.userId, r.stockId);
    else pseudosInconnus.push(p.pseudo);
  }

  const exemptions = new Set(b.joueurs.filter(estExemption).map((j) => j.position));
  const nonDesignees = new Set(b.joueurs.filter(estNonDesignee).map((j) => j.position));
  const duelsBye = new Set(matchsPremierTour.filter((m) => m.status === 'bye').map((m) => `${m.round}|${m.position}`));
  const pronostics: PronosticDerive[] = [];
  let sansPronostic = 0;
  let exemptionsIgnorees = 0;
  let enAttenteNonDesignee = 0;
  const byesSuspects: ByeSuspect[] = [];
  for (const t of b.tours) {
    const round = tours.roundDuTour(t.tour);
    for (const m of t.matchs) {
      if (duelsBye.has(`${round}|${m.index}`)) {
        // Au premier tour, le match `index` réunit les positions 2·index+1 et
        // 2·index+2 : sans BYE chez Thomas parmi elles, l'exemption est la nôtre seule.
        const places = [2 * m.index + 1, 2 * m.index + 2];
        if (t.tour === 1 && !places.some((p) => exemptions.has(p))) {
          byesSuspects.push({
            match: m.index,
            positions: places.filter((p) => joueurDePosition(p, premierTour) === null),
            pronosticsIgnores: m.pronostics.filter((p) => stockDe.has(p.userId) && p.position !== null).length,
          });
        } else {
          exemptionsIgnorees++;
        }
        continue;
      }
      for (const p of m.pronostics) {
        if (!stockDe.has(p.userId)) continue;
        if (p.position === null) {
          sansPronostic++;
          continue;
        }
        // Lucky loser pas encore désignée : pronostic valide, mais sans
        // joueur à écrire. Compté, pas refusé.
        if (nonDesignees.has(p.position)) {
          enAttenteNonDesignee++;
          continue;
        }
        // Une exemption n'est jamais un « joueur » à proposer : déjà refusé
        // par validerBracket, revérifié ici car une place vide chez nous
        // donnerait un pronostic sans joueur.
        const playerId = exemptions.has(p.position) ? null : joueurDePosition(p.position, premierTour);
        if (playerId === null) {
          erreurs.push(`Tour ${t.tour}, match ${m.index} : pronostic en position ${p.position}, sans joueur (exemption).`);
          continue;
        }
        pronostics.push({ participantId: stockDe.get(p.userId)!, round, position: m.index, playerId });
      }
    }
  }
  if (erreurs.length) return { ok: false, erreurs };
  return { ok: true, pronostics, pseudosInconnus, sansPronostic, exemptionsIgnorees, enAttenteNonDesignee, byesSuspects };
}

const cle = (p: { participantId: string | null; round: string; position: number }) =>
  `${p.participantId ?? ''}|${p.round}|${p.position}`;

export interface Ecart {
  participantId: string | null;
  round: string;
  position: number;
  /** Ce qui est en base (saisie manuelle, Game Tracker, ou synchro antérieure). */
  interne: string;
  /** Ce que dit l'API de Thomas. */
  thomas: string;
}

export interface PlanEcriture {
  aInserer: PronosticDerive[];
  /** Vide sauf avec `ecraser` : les écarts y passent alors. */
  aModifier: { id: string; playerId: string }[];
  identiques: number;
  /** Emplacements où la base et Thomas divergent. */
  ecarts: Ecart[];
}

/**
 * Ce qu'il faut écrire, emplacement par emplacement :
 *   - vide chez nous            -> insertion ;
 *   - même joueur               -> rien (rejouer ne change rien) ;
 *   - autre joueur              -> écart SIGNALÉ, jamais écrasé, sauf
 *     `ecraser` (la valeur de Thomas remplace alors la nôtre).
 * Jamais de suppression : un emplacement absent chez Thomas reste tel quel.
 */
export function planifierEcriture(
  derives: PronosticDerive[],
  existants: PronosticExistant[],
  ecraser: boolean,
): PlanEcriture {
  const parCle = new Map(existants.map((e) => [cle(e), e]));
  const plan: PlanEcriture = { aInserer: [], aModifier: [], identiques: 0, ecarts: [] };
  for (const d of derives) {
    const e = parCle.get(cle(d));
    if (!e) plan.aInserer.push(d);
    else if (e.playerId === d.playerId) plan.identiques++;
    else {
      plan.ecarts.push({ participantId: d.participantId, round: d.round, position: d.position, interne: e.playerId, thomas: d.playerId });
      if (ecraser) plan.aModifier.push({ id: e.id, playerId: d.playerId });
    }
  }
  return plan;
}
