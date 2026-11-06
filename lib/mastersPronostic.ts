/**
 * POINTS DES PRONOSTICS ET CLASSEMENT D'UN MASTERS — module PUR (règles : lib/masters.ts).
 *
 * Le pronostic (classer les poules, vainqueur des demies, championne) se note sur ce qui est DÉJÀ connu :
 * les places des poules quand la poule est terminée et que son classement est sans égalité, les finalistes
 * quand les deux demies sont jouées, la championne quand la finale l'est. Total du tournoi =
 * points du pronostic + points des picks ; les ex æquo partagent le rang (1, 1, 3).
 */
import { pointsPronostic, type PointsPronostic, type PronosticMasters, type ReelMasters } from './masters';
import type { PouleVue, VueMasters } from './mastersVue';

/** Ce qui s'est réellement passé, d'après la vue du tournoi (null = pas encore connu ou pas départageable). */
export function reelDepuisVue(vue: VueMasters): ReelMasters {
  const classement = (p: PouleVue): string[] | null => (p.terminee && p.classement.length === 4 && !p.classement.some((l) => l.egalite) ? p.classement.map((l) => l.playerId) : null);
  const gagnants = vue.demis.map((d) => d.match?.winnerId ?? null);
  return {
    classementA: classement(vue.poules.A),
    classementB: classement(vue.poules.B),
    finalistes: gagnants[0] && gagnants[1] ? [gagnants[0], gagnants[1]] : null,
    champion: vue.championId,
  };
}

/**
 * Le pronostic ferme au PREMIER MATCH du tournoi : dès qu'un match est commencé ou joué, ou que l'heure du
 * premier match programmé est passée.
 */
export function pronosticFerme(matchs: { status: string; scheduledAt?: string | null }[], maintenant: Date): boolean {
  if (matchs.some((m) => m.status !== 'scheduled' && m.status !== 'bye')) return true;
  const heures = matchs.map((m) => (m.scheduledAt ? new Date(m.scheduledAt).getTime() : NaN)).filter((t) => Number.isFinite(t));
  return heures.length > 0 && Math.min(...heures) <= maintenant.getTime();
}

export interface LigneTournoi {
  /** Nom affiché (« Moi », « Laki », « Thomas »). */
  nom: string;
  /** Points du pronostic, null si aucun pronostic enregistré. */
  pronostic: PointsPronostic | null;
  picks: number;
  total: number;
  /** Rang du classement ; les ex æquo partagent le rang. */
  rang: number;
}

export function classerTournoi(
  participants: { nom: string; pronostic: PronosticMasters | null; picks: number }[],
  reel: ReelMasters,
): LigneTournoi[] {
  const lignes = participants.map((p) => {
    const pts = p.pronostic ? pointsPronostic(p.pronostic, reel) : null;
    return { nom: p.nom, pronostic: pts, picks: p.picks, total: (pts?.total ?? 0) + p.picks, rang: 0 };
  });
  lignes.sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom, 'fr'));
  lignes.forEach((l, i) => {
    l.rang = i > 0 && l.total === lignes[i - 1].total ? lignes[i - 1].rang : i + 1;
  });
  return lignes;
}
