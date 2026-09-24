/**
 * PARSER — joueurs d'une extraction : moitiés de tableau, réconciliation des
 * identifiants avec les joueurs déjà en base, présence par tour. Cf.
 * l'en-tête de lib/parser.ts, point d'entrée qui réexporte ce fichier.
 */

import { eloDepuisRang, ELO_DEFAUT } from './elo';
import { apparierNom, indexerJoueursTableau } from './matching';
import type { DrawExtract, Half, Match, MatchPlayer, Player } from './types';

/**
 * Extrait les joueurs d'un tableau, avec leur moitié.
 *
 * La moitié se déduit du PREMIER tour uniquement : un joueur appartient
 * à la moitié haute ou basse pour toute la durée du tournoi.
 */
export function extraireJoueurs(
  extract: DrawExtract,
  ranks: Record<string, number> = {},
  elos: Record<string, { overall: number; hard: number; clay: number; grass: number }> = {}
): Record<string, Player> {
  const joueurs: Record<string, Player> = {};
  const rounds = extract.roundsFound;
  const premier = rounds[0];

  // Moitié de tableau, déduite du premier tour
  const moities: Record<string, Half> = {};
  for (const m of extract.matches) {
    if (m.round !== premier) continue;
    for (const p of m.players) {
      if (p.id && !p.isBye) moities[p.id] = m.half;
    }
  }

  for (const m of extract.matches) {
    for (const p of m.players) {
      if (!p.id || p.isBye || joueurs[p.id]) continue;

      const seed = p.seed && /^\d+$/.test(p.seed) ? parseInt(p.seed, 10) : null;
      const rank = ranks[p.id] ?? null;
      const e = elos[p.id];
      const base = e?.overall ?? (rank ? eloDepuisRang(rank) : ELO_DEFAUT);

      joueurs[p.id] = {
        id: p.id,
        tour: extract.tour,
        name: p.name,
        country: p.country,
        rank,
        seed,
        half: moities[p.id] ?? m.half,
        eloOverall: base,
        eloHard: e?.hard ?? base,
        eloClay: e?.clay ?? base,
        eloGrass: e?.grass ?? base,
      };
    }
  }

  return joueurs;
}

/**
 * RÉCONCILIATION D'IDENTITÉ — retrouver un joueur déjà connu avant d'en
 * créer un nouveau.
 *
 * Le bookmarklet reprend tel quel l'ID que le site du circuit expose sur
 * CETTE page. Pour un joueur classé, cet ID est stable d'un tournoi à
 * l'autre (l'ID officiel ATP/WTA). Pour une joueuse non classée ou
 * qualifiée, en revanche, le site sert parfois un second espace
 * d'identifiants (numérique, type Sportradar) au lieu de l'ID habituel —
 * observé sur R. Jodar en juillet (migration 0011, ID ATP vs Sportradar),
 * puis à nouveau sur neuf joueuses WTA à l'US Open de septembre : SANS ce
 * rapprochement, chaque réapparition de ce second espace recrée une ligne
 * `tn_players` neuve pour une personne déjà en base, qui repart alors avec
 * un historique vide et un Elo par défaut — silencieusement.
 *
 * La correction se fait ICI, avant toute écriture (`app/import/actions.ts`
 * ne doit jamais voir l'ID neuf) : un ID de l'extraction absent de
 * `tn_players` est rapproché par NOM (même circuit) via l'index de
 * `lib/matching.ts`, déjà éprouvé pour ce même problème côté cotes
 * (`apparierNom`). Trouvé sans ambiguïté → l'ID de l'extraction est réécrit
 * partout dans l'extrait avec l'ID existant, qui seul sera écrit en base.
 * Ambigu (plusieurs joueurs du circuit partagent ce nom, cf. les deux
 * « X. Wang », homonymes réelles et distinctes) → on ne fusionne RIEN, on
 * le signale seulement : un mauvais rapprochement serait silencieux et
 * fausserait deux historiques à la fois, pire que le défaut qu'on corrige.
 * Absent → joueur réellement nouveau, rien à faire.
 */

/** Un rapprochement effectué : l'ID de l'extraction est remplacé par l'ID déjà en base. */
export interface JoueurReconcilie {
  nom: string;
  idExtrait: string;
  idExistant: string;
}

/** Un nom qui désigne plusieurs joueurs déjà en base — volontairement PAS fusionné. */
export interface AmbiguiteReconciliation {
  nom: string;
  idExtrait: string;
  /** Noms des joueurs déjà en base qui partagent la même clé de rapprochement. */
  candidats: string[];
}

export interface ResultatReconciliation {
  /** Extrait avec les IDs réconciliés substitués — celui à écrire en base. */
  extract: DrawExtract;
  reconciliations: JoueurReconcilie[];
  ambigus: AmbiguiteReconciliation[];
}

/**
 * Réconcilie les IDs de l'extraction avec les joueurs déjà en base (même
 * circuit). `joueursExistants` doit être filtré sur `extract.tour` par
 * l'appelant : un rapprochement inter-circuits n'aurait aucun sens.
 */
export function reconcilierIdsJoueurs(
  extract: DrawExtract,
  joueursExistants: { id: string; name: string }[],
): ResultatReconciliation {
  const idsConnus = new Set(joueursExistants.map((j) => j.id));
  const index = indexerJoueursTableau(joueursExistants);

  const remap = new Map<string, string>(); // ID de l'extraction -> ID existant
  const reconciliations: JoueurReconcilie[] = [];
  const ambigus: AmbiguiteReconciliation[] = [];
  const traites = new Set<string>(); // un ID inconnu n'est testé qu'une fois

  for (const m of extract.matches) {
    for (const p of m.players) {
      if (!p.id || p.isBye || idsConnus.has(p.id) || traites.has(p.id)) continue;
      traites.add(p.id);

      const { id, echec } = apparierNom(index, p.name);
      if (id) {
        remap.set(p.id, id);
        reconciliations.push({ nom: p.name, idExtrait: p.id, idExistant: id });
      } else if (echec?.raison === 'ambigu') {
        ambigus.push({ nom: p.name, idExtrait: p.id, candidats: echec.candidats ?? [] });
      }
      // 'absent' : personne de ce nom en base pour ce circuit — vraiment nouveau.
    }
  }

  if (remap.size === 0) return { extract, reconciliations, ambigus };

  const substituer = (p: MatchPlayer): MatchPlayer =>
    p.id && remap.has(p.id) ? { ...p, id: remap.get(p.id)! } : p;

  const matches: Match[] = extract.matches.map((m) => ({
    ...m,
    players: [substituer(m.players[0]), substituer(m.players[1])],
  }));

  return { extract: { ...extract, matches }, reconciliations, ambigus };
}

/** Joueurs effectivement en lice à chaque tour, byes exclus. */
export function joueursParTour(extract: DrawExtract): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of extract.matches) {
    // Un exempté ne joue pas : le picker à ce tour rapporte 0
    if (m.status === 'bye') continue;
    for (const p of m.players) {
      if (p.id && !p.isBye) (out[m.round] ??= []).push(p.id);
    }
  }
  return out;
}

/** Adversaire d'un joueur à un tour donné. */
export function adversaireDe(
  extract: DrawExtract,
  playerId: string,
  round: string
): string | null {
  for (const m of extract.matches) {
    if (m.round !== round) continue;
    const idx = m.players.findIndex((p) => p.id === playerId);
    if (idx === -1) continue;
    return m.players[1 - idx].id;
  }
  return null;
}
