/**
 * PRONOSTICS DE CHACUN SUR LE TABLEAU D'UN MASTERS — module PUR (règles de points : lib/masters.ts).
 *
 * Pour chaque participant qui a un pronostic, dit si chaque choix est juste, raté, en partie juste ou
 * encore en attente, d'après ce qui s'est DÉJÀ passé (même logique que les points : lib/mastersPronostic.ts).
 *  - Poule : la place prévue d'une joueuse. `juste` = place exacte ; `partiel` = bien qualifiée (top 2) mais
 *    pas à cette place ; `rate` = ni l'un ni l'autre ; `attente` = poule pas finie, ou égalité non départagée.
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
