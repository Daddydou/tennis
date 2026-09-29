/**
 * INSIGHT JOUEUR — UN SEUL BADGE, AFFICHAGE UNIQUEMENT
 *
 * Priorité : Forfait (rouge) > Blessure (ambre) > Charge (gris). Rien si
 * aucun de ces flags. Ne masque ni ne désactive jamais le joueur.
 *
 * Aplat PLEIN, volontairement : dans la même ligne, BadgeSourceElo utilise
 * déjà ambre (« maison ») et rouge (« défaut ») en style contouré pâle.
 * Classes Tailwind écrites en entier (Tailwind v4 scanne le source).
 */

import { niveauBadge, type NiveauBadge, type PlayerInsight } from '@/lib/insights';

const STYLE: Record<NiveauBadge, { classes: string; libelle: string }> = {
  forfait: { classes: 'bg-red-600 text-white', libelle: 'Forfait' },
  blessure: { classes: 'bg-amber-400 text-amber-950', libelle: 'Blessure' },
  charge: { classes: 'bg-zinc-200 text-zinc-700', libelle: 'Charge' },
};

export default function InsightBadge({
  insight,
}: {
  insight: Pick<PlayerInsight, 'withdrawn' | 'injuryRisk' | 'heavyLoad' | 'summary'> | null | undefined;
}) {
  const niveau = niveauBadge(insight);
  if (!niveau) return null;
  const s = STYLE[niveau];
  return (
    <span
      className={`ml-1.5 inline-block shrink-0 rounded-md px-1.5 py-px align-middle text-[10px] font-semibold uppercase tracking-wide ${s.classes}`}
      title={insight?.summary ?? s.libelle}
    >
      {s.libelle}
    </span>
  );
}
