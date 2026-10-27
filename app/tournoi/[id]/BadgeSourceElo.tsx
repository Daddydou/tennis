/**
 * PROVENANCE D'UN ELO — GARDE-FOU VISUEL
 *
 * Extrait de l'écran Picks pour être partagé avec l'écran Fantasy, à
 * comportement identique. Les deux écrans classent des joueurs sur des Elo
 * résolus par rapprochement de noms (cf. db/elo.ts) : un joueur fort
 * affiché en « défaut » ou en « ambigu » signale une correspondance ratée, et
 * doit sauter aux yeux des deux côtés.
 */

import type { SourceElo } from '@/db/elo';

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
      'border-amber-300 bg-amber-50 text-amber-700',
    libelle: 'import',
    titre:
      'Aucune correspondance dans la base d’Elo : Elo calculé sur les seuls tournois importés ici.',
  },
  defaut: {
    classes:
      'border-red-300 bg-red-50 text-red-700',
    libelle: 'défaut',
    titre: 'Ni Elo Tennis Abstract ni Elo maison : valeur par défaut. À vérifier.',
  },
  ambigu: {
    classes:
      'border-violet-300 bg-violet-50 text-violet-700',
    libelle: 'ambigu',
    titre:
      'Plusieurs joueurs Tennis Abstract portent ce nom : aucun n’a été choisi.',
  },
};

/** Couleur de l'Elo lui-même, assortie à sa source. */
export function classeElo(source: SourceElo): string {
  return source === 'defaut'
    ? 'text-red-600'
    : source === 'ambigu'
      ? 'text-violet-600'
      : source === 'maison'
        ? 'text-amber-700'
        : 'text-zinc-900';
}

/**
 * Comparaison de noms insensible aux accents, à la casse et à la ponctuation,
 * qui accepte aussi un prénom réduit à son initiale (« C. Ruud » = « Casper
 * Ruud ») : seul un nom VRAIMENT différent mérite d'être affiché.
 */
export function memeNom(a: string, b: string): boolean {
  // Après NFD, les accents sont des caractères séparés, retirés ici avec la
  // ponctuation ; on garde les séparateurs pour découper prénom / nom.
  const mots = (s: string) =>
    s
      .normalize('NFD')
      .toLowerCase()
      .replace(/[^a-z\s.-]/g, '')
      .split(/[\s.-]+/)
      .filter(Boolean);
  const ma = mots(a);
  const mb = mots(b);
  if (ma.join('') === mb.join('')) return true;
  const [pa, ...ra] = ma;
  const [pb, ...rb] = mb;
  return (
    !!pa && !!pb && ra.length > 0 && ra.join('') === rb.join('') && (pa.length === 1 || pb.length === 1) && pa[0] === pb[0]
  );
}

export default function BadgeSourceElo({
  source,
  taName,
  candidats,
  nom,
}: {
  source: SourceElo;
  taName: string | null;
  /** Homonymes non départagés (source `ambigu`) : « Nom (slug) ». */
  candidats: string[];
  /**
   * Nom du joueur chez nous. Fourni, le nom Tennis Abstract ne s'affiche que
   * s'il DIFFÈRE — c'est le seul cas où il révèle quelque chose (un
   * rapprochement douteux) ; identique, il n'était que du bruit illisible.
   */
  nom?: string;
}) {
  if (source === 'ta') {
    if (!taName || (nom && memeNom(nom, taName))) return null;
    return (
      <span
        className="max-w-32 truncate text-xs text-zinc-500"
        title={`Elo trouvé sous le nom Tennis Abstract : ${taName}`}
      >
        TA : {taName}
      </span>
    );
  }

  const s = STYLE_BADGE[source];
  return (
    <span className="shrink-0">
      <span
        className={`rounded-md border px-1.5 text-xs font-medium ${s.classes}`}
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
