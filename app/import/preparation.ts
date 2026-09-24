/**
 * Mise en forme d'une extraction avant écriture en base — fonctions pures,
 * sans I/O. Module ordinaire, volontairement PAS `'use server'` : ses exports
 * ne doivent pas devenir des Server Actions appelables depuis le navigateur.
 */

import type { Match } from '@/lib/types';

export const DRAW_FROM_ROUND: Record<string, number> = {
  R128: 128,
  R64: 64,
  R32: 32,
  R16: 16,
  QF: 8,
  SF: 4,
  F: 2,
};

/**
 * Nom affiché d'un tournoi.
 *
 * Priorité au libellé du référentiel (`lib/calendrier.ts`) : « canadian-open »
 * est l'Open du Canada, « china-open » Pékin — le slug seul induirait en
 * erreur. À défaut, on l'embellit ; et si l'extraction n'a même pas de slug,
 * on renvoie null pour que l'appelant décide (cf. `nomTournoi`).
 */
function prettifyName(slug: string | null): string | null {
  if (!slug) return null;
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Un slug non reconnu s'affiche BRUT plutôt que sous un nom générique : voir
 * « wuhan-open 2026 » dans la liste des tournois dit quelle fiche ajouter au
 * calendrier, là où « Tournoi 2026 » ne disait rien. Le générique ne reste
 * que pour une extraction sans slug du tout.
 */
export function nomTournoi(nomFiche: string | null, slug: string | null): string {
  return nomFiche ?? prettifyName(slug) ?? 'Tournoi';
}

/** Sets orientés joueur1 : [{g1,g2,tb1,tb2}], sets vides ignorés. */
export function setsJson(m: Match) {
  const [p1, p2] = m.players;
  const n = Math.max(p1.sets.length, p2.sets.length);
  const out: { g1: number | null; g2: number | null; tb1: number | null; tb2: number | null }[] =
    [];
  for (let i = 0; i < n; i++) {
    const g1 = p1.sets[i]?.games ?? null;
    const g2 = p2.sets[i]?.games ?? null;
    if (g1 === null && g2 === null) continue;
    out.push({
      g1,
      g2,
      tb1: p1.sets[i]?.tiebreak ?? null,
      tb2: p2.sets[i]?.tiebreak ?? null,
    });
  }
  return out;
}
