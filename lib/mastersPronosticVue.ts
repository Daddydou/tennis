/**
 * PRONOSTICS DE CHACUN SUR LE TABLEAU D'UN MASTERS — module PUR (règles de points : lib/masters.ts).
 *
 * Pour chaque participant qui a un pronostic, dit si chaque choix est juste, raté, en partie juste ou
 * encore en attente, d'après ce qui s'est DÉJÀ passé (même logique que les points : lib/mastersPronostic.ts).
 *  - Poule : la place prévue d'une joueuse. `juste` = place exacte ; `partiel` = bien qualifiée (top 2) mais
 *    pas à cette place ; `rate` = ni l'un ni l'autre ; `attente` = pas encore certain (places encore possibles, voir `placesPossibles`).
 *  - Finaliste et championne : `juste` / `rate` dès que c'est CERTAIN (finalistes connus, demie perdue,
 *    éliminée en poule, finale jouée), sinon `attente`.
 */
import type { PronosticMasters } from './masters';
import { reelDepuisVue } from './mastersPronostic';
import type { PouleVue, VueMasters } from './mastersVue';

export type VerdictMasters = 'juste' | 'partiel' | 'rate' | 'attente';

/** Un participant et son pronostic (null = rien de saisi). */
export interface ParticipantPronostic {
  /** Clé stable : l'id du participant, ou « moi ». */
  cle: string;
  nom: string;
  pronostic: PronosticMasters | null;
}

/** Associe à chaque participant (null = moi) son pronostic enregistré, ou null. */
export function pronosticsParParticipant(
  stockes: { participantId: string | null; pronostic: PronosticMasters }[],
  participants: { id: string | null; nom: string }[],
): ParticipantPronostic[] {
  return participants.map((p) => ({
    cle: p.id ?? 'moi',
    nom: p.nom,
    pronostic: stockes.find((s) => s.participantId === p.id)?.pronostic ?? null,
  }));
}

/**
 * Places que chaque joueuse peut encore prendre dans sa poule (clé = id), d'après les VICTOIRES seulement :
 * on essaie toutes les issues des matchs restants (au plus 2^6). À égalité de victoires, la joueuse peut finir
 * à n'importe quelle place du groupe d'égalité (le départage sera connu plus tard : on ne devine rien).
 * Une seule place possible = place acquise. Null si la poule n'a pas 4 joueuses.
 */
export function placesPossibles(poule: PouleVue): Map<string, number[]> | null {
  const ids = poule.joueurs;
  if (ids.length !== 4) return null;
  const vues = new Map<string, number>();
  const victoires = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const j of poule.journees) {
    for (const m of j.matchs) {
      if (!m.player1Id || !m.player2Id || !m.winnerId) continue;
      vues.set([m.player1Id, m.player2Id].sort().join('|'), 1);
      victoires.set(m.winnerId, (victoires.get(m.winnerId) ?? 0) + 1);
    }
  }
  // Les paires pas encore jouées (même si leur ligne n'existe pas encore dans les journées).
  const restantes: [string, string][] = [];
  for (let a = 0; a < 4; a++) {
    for (let b = a + 1; b < 4; b++) {
      if (!vues.has([ids[a], ids[b]].sort().join('|'))) restantes.push([ids[a], ids[b]]);
    }
  }
  const possibles = new Map<string, Set<number>>(ids.map((id) => [id, new Set<number>()]));
  for (let masque = 0; masque < 2 ** restantes.length; masque++) {
    const v = new Map(victoires);
    restantes.forEach(([x, y], i) => {
      const gagnant = masque & (1 << i) ? y : x;
      v.set(gagnant, (v.get(gagnant) ?? 0) + 1);
    });
    for (const id of ids) {
      const w = v.get(id) ?? 0;
      const devant = ids.filter((o) => (v.get(o) ?? 0) > w).length;
      const egaux = ids.filter((o) => (v.get(o) ?? 0) === w).length;
      for (let r = devant + 1; r <= devant + egaux; r++) possibles.get(id)?.add(r);
    }
  }
  return new Map([...possibles].map(([id, s]) => [id, [...s].sort((a, b) => a - b)]));
}

/**
 * Verdict d'une place prévue d'après les places encore possibles de la joueuse : coloré dès que c'est CERTAIN
 * (place acquise ; place prévue devenue impossible ET sort de qualification joué), sinon `attente`.
 */
function verdictDepuisPossibles(rang: number, possibles: number[] | undefined): VerdictMasters {
  if (!possibles || possibles.length === 0) return 'attente';
  const min = possibles[0];
  const max = possibles[possibles.length - 1];
  const qualifieeSure = max <= 2;
  const eliminSure = min > 2;
  if (min === max) {
    if (min === rang) return 'juste';
    return rang <= 2 && qualifieeSure ? 'partiel' : 'rate';
  }
  if (possibles.includes(rang)) return 'attente';
  // La place prévue est impossible : raté seulement si on sait déjà qu'elle n'est pas « bien qualifiée » non plus.
  if (rang <= 2) return qualifieeSure ? 'partiel' : eliminSure ? 'rate' : 'attente';
  return qualifieeSure ? 'rate' : 'attente';
}

export interface PastillePoule {
  cle: string;
  nom: string;
  /** Place prévue, de 1 à 4. */
  rang: number;
  verdict: VerdictMasters;
}

/**
 * Pastilles d'une poule : pour chaque joueuse (clé = id), la place que chaque participant lui a prévue.
 * `classementPrevu` de chaque participant est celui de CETTE poule.
 */
export function pastillesPoule(
  poule: PouleVue,
  participants: { cle: string; nom: string; classementPrevu: string[] | null }[],
): Map<string, PastillePoule[]> {
  const reel =
    poule.terminee && poule.classement.length === 4 && !poule.classement.some((l) => l.egalite) ? poule.classement.map((l) => l.playerId) : null;
  // Poule pas finie (ou égalité non départagée) : on colore quand même ce qui est déjà CERTAIN.
  const possibles = reel ? null : placesPossibles(poule);
  const sortie = new Map<string, PastillePoule[]>();
  for (const p of participants) {
    if (!p.classementPrevu) continue;
    p.classementPrevu.forEach((id, i) => {
      const rang = i + 1;
      let verdict: VerdictMasters = 'attente';
      if (reel) {
        if (reel[i] === id) verdict = 'juste';
        else if (rang <= 2 && reel.slice(0, 2).includes(id)) verdict = 'partiel';
        else verdict = 'rate';
      } else if (possibles) {
        verdict = verdictDepuisPossibles(rang, possibles.get(id));
      }
      const liste = sortie.get(id) ?? [];
      liste.push({ cle: p.cle, nom: p.nom, rang, verdict });
      sortie.set(id, liste);
    });
  }
  return sortie;
}

export interface ChoixPhaseFinale {
  joueurId: string;
  verdict: VerdictMasters;
}

export interface LignePhaseFinale {
  cle: string;
  nom: string;
  /** Les deux finalistes pronostiqués (vainqueurs des demies). */
  finalistes: ChoixPhaseFinale[];
  champion: ChoixPhaseFinale;
}

/** La joueuse est-elle déjà éliminée à coup sûr (poule terminée sans elle dans le top 2, demie ou finale perdue) ? */
function eliminee(vue: VueMasters, id: string): boolean {
  const sienne = [vue.poules.A, vue.poules.B].find((p) => p.joueurs.includes(id));
  if (sienne?.qualifies && !sienne.qualifies.includes(id)) return true;
  // Poule pas finie : déjà éliminée si, quoi qu'il arrive, elle ne peut plus finir dans les deux premières.
  const places = sienne ? placesPossibles(sienne)?.get(id) : undefined;
  if (places && places[0] > 2) return true;
  const perdueDemi = vue.demis.some((d) => d.match?.winnerId && (d.player1Id === id || d.player2Id === id) && d.match.winnerId !== id);
  if (perdueDemi) return true;
  return vue.championId !== null && vue.championId !== id && (vue.finale.player1Id === id || vue.finale.player2Id === id);
}

export function lignesPhaseFinale(vue: VueMasters, participants: ParticipantPronostic[]): LignePhaseFinale[] {
  const finalistes = reelDepuisVue(vue).finalistes;
  const gagneUneDemi = (id: string) => vue.demis.some((d) => d.match?.winnerId === id);

  const verdictFinaliste = (id: string): VerdictMasters => {
    if (finalistes?.includes(id) || gagneUneDemi(id)) return 'juste';
    if (finalistes || eliminee(vue, id)) return 'rate';
    return 'attente';
  };
  const verdictChampion = (id: string): VerdictMasters => {
    if (vue.championId !== null) return vue.championId === id ? 'juste' : 'rate';
    return eliminee(vue, id) ? 'rate' : 'attente';
  };

  return participants
    .filter((p): p is ParticipantPronostic & { pronostic: PronosticMasters } => p.pronostic !== null)
    .map((p) => ({
      cle: p.cle,
      nom: p.nom,
      finalistes: p.pronostic.vainqueursDemis.map((id) => ({ joueurId: id, verdict: verdictFinaliste(id) })),
      champion: { joueurId: p.pronostic.champion, verdict: verdictChampion(p.pronostic.champion) },
    }));
}
