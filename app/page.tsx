import Link from 'next/link';
import { listTournaments } from '@/supabase/queries';
import { LIBELLE_CATEGORIE_COURT } from '@/lib/calendrier';

export const dynamic = 'force-dynamic';

const SURFACE_LABEL: Record<string, string> = {
  hard: 'Dur',
  clay: 'Terre',
  grass: 'Gazon',
  carpet: 'Moquette',
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DEUX INFORMATIONS, DEUX SUPPORTS VISUELS — LE SEUL ENDROIT À MODIFIER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le CIRCUIT porte le fond de la ligne (ou de la carte) : c'est ce qu'on lit
 * de plus loin, et c'est la question qu'on se pose en premier devant la liste
 * — tournoi masculin ou féminin ?
 *
 * La SURFACE, elle, tient dans une pastille : un point de couleur + son nom.
 * Les deux ne peuvent pas partager le même canal, sinon un tournoi ATP sur dur
 * (bleu sur bleu) effacerait l'un des deux.
 *
 * Le fond reste PÂLE — teinte -100 en clair, aplat très transparent en sombre :
 * c'est un aplat qui court sous du texte, pas un aplat de badge. Mesuré sur les
 * pixels rendus, le nom d'un tournoi y est à 13:1 au pire, le texte secondaire
 * à 6,3:1, la puce de circuit à 4,7:1 — tous au-dessus du seuil AA (4,5:1). La
 * pastille de surface, saturée et cerclée, ressort dessus sans lutter avec eux.
 *
 * ACCESSIBILITÉ. La couleur ne porte JAMAIS seule l'information : le circuit
 * est aussi écrit en toutes lettres dans une puce (« ATP » / « WTA »), et la
 * surface est écrite à côté de son point. Bleu et magenta se confondent chez
 * une partie des daltoniens — le texte, lui, ne se confond pas.
 */
interface JeuCircuit {
  /** Aplat de fond de la ligne / carte. */
  fond: string;
  /** Barre d'accent de la carte (mobile) — un aplat. */
  barre: string;
  /** Barre d'accent de la ligne (tableau) — une bordure gauche. */
  barreBordure: string;
  /** Puce portant le nom du circuit. */
  puce: string;
}

// Les classes sont écrites EN TOUTES LETTRES : Tailwind lit les sources en
// texte, une classe recomposée à l'exécution (`bg-${x}-500`) n'existerait
// jamais dans le CSS produit.
const CIRCUIT: Record<string, JeuCircuit> = {
  ATP: {
    // En sombre, le bleu marine (-950) se confondait avec le fond de page,
    // quand le magenta ressortait : à indice égal, un magenta est bien plus
    // coloré qu'un bleu. On remonte donc le bleu d'un cran pour que les deux
    // aplats pèsent pareil.
    fond: 'bg-blue-100 dark:bg-blue-900/35',
    barre: 'bg-blue-500 dark:bg-blue-400',
    barreBordure: 'border-l-blue-500 dark:border-l-blue-400',
    puce: 'bg-blue-600 text-white dark:bg-blue-400 dark:text-blue-950',
  },
  WTA: {
    fond: 'bg-fuchsia-100 dark:bg-fuchsia-950/40',
    barre: 'bg-fuchsia-500 dark:bg-fuchsia-400',
    barreBordure: 'border-l-fuchsia-500 dark:border-l-fuchsia-400',
    puce: 'bg-fuchsia-600 text-white dark:bg-fuchsia-400 dark:text-fuchsia-950',
  },
};

/** Circuit inconnu : un gris neutre, jamais la couleur d'un autre circuit. */
const CIRCUIT_INCONNU: JeuCircuit = {
  fond: 'bg-zinc-100 dark:bg-zinc-900/60',
  barre: 'bg-zinc-400 dark:bg-zinc-600',
  barreBordure: 'border-l-zinc-400 dark:border-l-zinc-600',
  puce: 'bg-zinc-600 text-white dark:bg-zinc-400 dark:text-zinc-950',
};

const circuitDe = (tour: string | null) =>
  (tour && CIRCUIT[tour]) || CIRCUIT_INCONNU;

/** Ocre pour la terre, bleu pour le dur, vert pour le gazon. */
const SURFACE_POINT: Record<string, string> = {
  clay: 'bg-amber-500',
  hard: 'bg-sky-500',
  grass: 'bg-emerald-500',
  // La moquette a quitté le circuit ; un gris suffit, et il laisse le magenta
  // au circuit féminin.
  carpet: 'bg-slate-400',
};

const STATUT_LABEL: Record<string, string> = {
  upcoming: 'À venir',
  running: 'En cours',
  completed: 'Terminé',
};

/** Texte secondaire, assez foncé pour rester lisible SUR un fond teinté. */
const TEXTE_SECONDAIRE = 'text-zinc-600 dark:text-zinc-400';

/**
 * Surface : un point coloré et son nom, dans une pastille neutre.
 *
 * La pastille est volontairement incolore (bordure grise, fond translucide) :
 * posée sur un fond bleu comme sur un fond magenta, elle se lit pareil.
 */
function BadgeSurface({ surface }: { surface: string | null }) {
  if (!surface) return <span className="text-zinc-500">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-zinc-400/40 bg-white/60 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:border-zinc-500/40 dark:bg-zinc-950/40 dark:text-zinc-200">
      <span
        className={`size-2 shrink-0 rounded-full ${
          SURFACE_POINT[surface] ?? 'bg-zinc-400'
        }`}
        aria-hidden="true"
      />
      {SURFACE_LABEL[surface] ?? surface}
    </span>
  );
}

/** Circuit écrit en toutes lettres — le fond seul ne suffit pas. */
function PuceCircuit({ tour }: { tour: string | null }) {
  return (
    <span
      className={`inline-block shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold tracking-wide ${
        circuitDe(tour).puce
      }`}
    >
      {tour ?? '—'}
    </span>
  );
}

/** 'YYYY-MM-DD' → '3 mars 2026'. Pas de Date() : évite tout décalage de fuseau. */
const MOIS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, j] = iso.slice(0, 10).split('-');
  const mois = MOIS[Number(m) - 1];
  return mois ? `${Number(j)} ${mois} ${a}` : iso;
}

export default async function Home() {
  const tournois = await listTournaments();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Tournois</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/fantasy"
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            Fantasy — prédit vs réalisé
          </Link>
          <Link
            href="/calibration"
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            Calibration Elo
          </Link>
          <Link
            href="/import/elo"
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            Elo Tennis Abstract
          </Link>
          <Link
            href="/import"
            className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Importer un tableau
          </Link>
        </div>
      </div>

      {tournois.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Aucun tournoi. Commence par{' '}
          <Link href="/import" className="underline">
            importer un tableau
          </Link>
          .
        </p>
      ) : (
        <>
          {/* Téléphone : une carte par tournoi. Les huit colonnes du tableau
              débordaient de l'écran — surface tronquée, statut et actions hors
              champ, noms coupés sur trois lignes. */}
          <ul className="space-y-2 sm:hidden">
            {tournois.map((t) => {
              const c = circuitDe(t.tour);
              return (
                <li
                  key={t.id}
                  className={`relative overflow-hidden rounded-lg border border-zinc-200 pl-4 dark:border-zinc-800 ${c.fond}`}
                >
                  {/* Barre d'accent : un aplat, pas une bordure — une bordure
                      de côté se ferait écraser par la couleur des autres. */}
                  <span
                    className={`absolute inset-y-0 left-0 w-1.5 ${c.barre}`}
                    aria-hidden="true"
                  />
                  <div className="space-y-1.5 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/tournoi/${t.id}`}
                        className="font-semibold hover:underline"
                      >
                        {t.name}
                      </Link>
                      <PuceCircuit tour={t.tour} />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <BadgeSurface surface={t.surface} />
                      <span className={`text-xs ${TEXTE_SECONDAIRE}`}>
                        {t.category
                          ? LIBELLE_CATEGORIE_COURT[t.category] ?? t.category
                          : '—'}
                        {t.best_of ? ` · ${t.best_of} sets` : ''}
                      </span>
                    </div>

                    <div className={`text-xs ${TEXTE_SECONDAIRE}`}>
                      {formatDate(t.start_date)} ·{' '}
                      {STATUT_LABEL[t.status] ?? t.status}
                    </div>

                    <div className="flex gap-4 pt-0.5 text-xs">
                      <Link href={`/tournoi/${t.id}`} className="underline-offset-2 hover:underline">
                        Tableau
                      </Link>
                      <Link href={`/tournoi/${t.id}/picks`} className="underline-offset-2 hover:underline">
                        Picks
                      </Link>
                      <Link href={`/tournoi/${t.id}/resultats`} className="underline-offset-2 hover:underline">
                        Résultats
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Écran large : le tableau dense, inchangé dans ses colonnes. */}
          <table className="hidden w-full text-sm sm:table">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <th className="py-2 pl-3 pr-3 font-medium">Début</th>
                <th className="py-2 pr-3 font-medium">Tournoi</th>
                <th className="py-2 pr-3 font-medium">Circuit</th>
                <th className="py-2 pr-3 font-medium">Catégorie</th>
                <th className="py-2 pr-3 font-medium">Surface</th>
                <th className="py-2 pr-3 font-medium">Format</th>
                <th className="py-2 pr-3 font-medium">Statut</th>
                <th className="py-2 pr-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tournois.map((t) => {
                const c = circuitDe(t.tour);
                return (
                  <tr
                    key={t.id}
                    className={`border-b border-zinc-200/70 dark:border-zinc-800/70 ${c.fond}`}
                  >
                    <td
                      className={`border-l-4 py-2 pl-3 pr-3 whitespace-nowrap tabular-nums ${TEXTE_SECONDAIRE} ${c.barreBordure}`}
                    >
                      {formatDate(t.start_date)}
                    </td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/tournoi/${t.id}`}
                        className="font-medium hover:underline"
                      >
                        {t.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <PuceCircuit tour={t.tour} />
                    </td>
                    <td className={`py-2 pr-3 whitespace-nowrap ${TEXTE_SECONDAIRE}`}>
                      {t.category
                        ? LIBELLE_CATEGORIE_COURT[t.category] ?? t.category
                        : '—'}
                    </td>
                    <td className="py-2 pr-3">
                      <BadgeSurface surface={t.surface} />
                    </td>
                    <td className={`py-2 pr-3 whitespace-nowrap ${TEXTE_SECONDAIRE}`}>
                      {t.best_of ? `${t.best_of} sets` : '—'}
                    </td>
                    <td className={`py-2 pr-3 ${TEXTE_SECONDAIRE}`}>
                      {STATUT_LABEL[t.status] ?? t.status}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-3 text-xs">
                        <Link href={`/tournoi/${t.id}`} className={`hover:underline ${TEXTE_SECONDAIRE}`}>
                          Tableau
                        </Link>
                        <Link href={`/tournoi/${t.id}/picks`} className={`hover:underline ${TEXTE_SECONDAIRE}`}>
                          Picks
                        </Link>
                        <Link href={`/tournoi/${t.id}/resultats`} className={`hover:underline ${TEXTE_SECONDAIRE}`}>
                          Résultats
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
