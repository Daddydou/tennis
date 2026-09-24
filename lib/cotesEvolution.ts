/**
 * ÉVOLUTION DES COTES AVANT UN MATCH — séries reconstituées à partir des
 * captures successives de `tn_odds_historique` (migration 0020).
 *
 * Module PUR. Seules les captures ANTÉRIEURES au coup d'envoi comptent : une
 * cote live (match commencé) raconte le score, pas l'avis du marché avant le
 * match — même règle que `coteUtilisable` (lib/cotes.ts).
 *
 * Chaque point est la probabilité (déjà dévigorisée, consensus médian) que
 * le joueur A gagne ; A est le « domicile » de The Odds API, arbitraire.
 */

export interface CaptureCote {
  eventId: string;
  nomA: string;
  nomB: string;
  commenceTime: string | null;
  probaA: number | null;
  captureLe: string;
}

export interface SerieCote {
  eventId: string;
  nomA: string;
  nomB: string;
  commenceTime: string | null;
  /** Du plus ancien au plus récent. Jamais vide. */
  points: { captureLe: string; probaA: number }[];
  /** Dernière − première probabilité de A. 0 avec une seule capture. */
  variation: number;
}

/** La capture a-t-elle été faite avant le coup d'envoi ? Sans heure connue : oui. */
function avantLeMatch(c: CaptureCote): boolean {
  if (!c.commenceTime) return true;
  return new Date(c.captureLe).getTime() < new Date(c.commenceTime).getTime();
}

/**
 * Une série par rencontre, triées par heure de coup d'envoi (sans heure en
 * dernier). Une rencontre sans aucune capture exploitable — pas de consensus,
 * ou captures toutes prises pendant le match — n'a pas de série.
 */
export function seriesCotes(captures: CaptureCote[]): SerieCote[] {
  const parMatch = new Map<string, CaptureCote[]>();
  for (const c of captures) {
    if (c.probaA === null || !avantLeMatch(c)) continue;
    const l = parMatch.get(c.eventId) ?? [];
    l.push(c);
    parMatch.set(c.eventId, l);
  }

  const series: SerieCote[] = [];
  for (const [eventId, liste] of parMatch) {
    liste.sort((a, b) => a.captureLe.localeCompare(b.captureLe));
    const derniere = liste[liste.length - 1];
    const points = liste.map((c) => ({ captureLe: c.captureLe, probaA: c.probaA! }));
    series.push({
      eventId,
      // Les noms et l'heure de la capture la plus récente : l'API peut
      // corriger un horaire entre deux captures.
      nomA: derniere.nomA,
      nomB: derniere.nomB,
      commenceTime: derniere.commenceTime,
      points,
      variation: points[points.length - 1].probaA - points[0].probaA,
    });
  }

  return series.sort((a, b) => {
    if (a.commenceTime === b.commenceTime) return a.nomA.localeCompare(b.nomA);
    if (a.commenceTime === null) return 1;
    if (b.commenceTime === null) return -1;
    return a.commenceTime.localeCompare(b.commenceTime);
  });
}
