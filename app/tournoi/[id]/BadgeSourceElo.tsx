/**
 * PROVENANCE D'UN ELO — GARDE-FOU VISUEL
 *
 * Extrait de l'écran Picks pour être partagé avec l'écran Fantasy, à
 * comportement identique. Les deux écrans classent des joueurs sur des Elo
 * résolus par rapprochement de noms (cf. supabase/elo.ts) : un joueur fort
 * affiché en « défaut » ou en « ambigu » signale une correspondance ratée, et
 * doit sauter aux yeux des deux côtés.
 */

import type { SourceElo } from '@/supabase/elo';

/**
 * Un Elo Tennis Abstract est la normale : il ne porte aucune marque, juste le
 * nom apparié en gris pâle. Seuls les replis sont signalés.
 */
const STYLE_BADGE: Record<
  Exclude<SourceElo, 'ta'>,
  { classes: string; libelle: string; titre: string }
> = {
  maison: {
    classes:
      'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
    libelle: 'maison',
    titre:
      'Aucune correspondance Tennis Abstract : Elo calculé sur les seuls tournois importés ici.',
  },
  defaut: {
    classes:
      'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
    libelle: 'défaut',
    titre: 'Ni Elo Tennis Abstract ni Elo maison : valeur par défaut. À vérifier.',
  },
  ambigu: {
    classes:
      'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300',
    libelle: 'ambigu',
    titre:
      'Plusieurs joueurs Tennis Abstract portent ce nom : aucun n’a été choisi.',
  },
};

/** Couleur de l'Elo lui-même, assortie à sa source. */
export function classeElo(source: SourceElo): string {
  return source === 'defaut'
    ? 'text-red-600 dark:text-red-400'
    : source === 'ambigu'
      ? 'text-violet-600 dark:text-violet-400'
      : source === 'maison'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-zinc-900 dark:text-zinc-100';
}

export default function BadgeSourceElo({
  source,
  taName,
  candidats,
}: {
  source: SourceElo;
  taName: string | null;
  /** Homonymes non départagés (source `ambigu`) : « Nom (slug) ». */
  candidats: string[];
}) {
  if (source === 'ta') {
    return taName ? (
      <span
        className="w-14 truncate text-right text-[10px] text-zinc-300 dark:text-zinc-700"
        title={`Tennis Abstract : ${taName}`}
      >
        {taName}
      </span>
    ) : (
      <span className="w-14" />
    );
  }

  const s = STYLE_BADGE[source];
  return (
    <span className="w-14 text-right">
      <span
        className={`rounded border px-1 py-px text-[10px] font-medium ${s.classes}`}
        title={
          candidats.length
            ? `${s.titre} Candidats : ${candidats.join(', ')}. Déclarer le bon ta_slug dans ta_name_exceptions.`
            : s.titre
        }
      >
        {s.libelle}
      </span>
    </span>
  );
}
