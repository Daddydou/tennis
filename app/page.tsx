import Link from 'next/link';
import { listTournaments } from '@/db/queries';
import { LIBELLE_CATEGORIE_COURT } from '@/lib/calendrier';
import type { TournamentRow } from '@/db/queries';
import { boutonPrimaire, carte, lienBouton, zoneTactile } from './ui';

export const dynamic = 'force-dynamic';

const SURFACE_LABEL: Record<string, string> = {
  hard: 'Dur',
  clay: 'Terre',
  grass: 'Gazon',
  carpet: 'Moquette',
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CIRCUIT ET SURFACE — LE SEUL ENDROIT À MODIFIER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le CIRCUIT se lit à deux endroits : une barre de 4px au bord gauche de la
 * ligne (ou de la carte), et une puce écrite en toutes lettres (« ATP » /
 * « WTA »). Les lignes elles-mêmes restent BLANCHES : teintées en bleu, elles
 * faisaient du bleu d'action le fond de 80 % de la liste (DESIGN.md, « La
 * règle du bleu qui agit »). Barre + puce suffisent à répondre à « tournoi
 * masculin ou féminin ? » au premier coup d'œil.
 *
 * La SURFACE tient dans une pastille : un point de couleur + son nom.
 *
 * ACCESSIBILITÉ. La couleur ne porte JAMAIS seule l'information : le circuit
 * est écrit dans sa puce, la surface à côté de son point. Bleu et magenta se
 * confondent chez une partie des daltoniens — le texte, lui, ne se confond pas.
 */
interface JeuCircuit {
  /** Barre d'accent de la carte — un aplat. */
  barre: string;
  /** Barre d'accent de la ligne (tableau) — une bordure gauche. */
  barreBordure: string;
  /** Puce portant le nom du circuit. */
  puce: string;
}

// Les classes sont écrites EN TOUTES LETTRES : Tailwind lit les sources en
// texte, une classe recomposée à l'exécution n'existerait jamais dans le CSS.
const CIRCUIT: Record<string, JeuCircuit> = {
  ATP: {
    barre: 'bg-blue-600',
    barreBordure: 'border-l-blue-600',
    puce: 'bg-blue-600 text-white',
  },
  WTA: {
    barre: 'bg-fuchsia-600',
    barreBordure: 'border-l-fuchsia-600',
    puce: 'bg-fuchsia-600 text-white',
  },
};

/** Circuit inconnu : un gris neutre, jamais la couleur d'un autre circuit. */
const CIRCUIT_INCONNU: JeuCircuit = {
  barre: 'bg-zinc-400',
  barreBordure: 'border-l-zinc-400',
  puce: 'bg-zinc-600 text-white',
};

const circuitDe = (tour: string | null) =>
  (tour && CIRCUIT[tour]) || CIRCUIT_INCONNU;

/** Ocre pour la terre, ciel pour le dur, vert pour le gazon. */
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

/**
 * Un tournoi dure au plus deux semaines (Grand Chelem). Toujours « En cours »
 * trois semaines après son début, c'est que son statut n'a pas été remis à
 * jour (dernier import manqué) : on le signale au lieu de le mêler aux vrais.
 */
const JOURS_AVANT_PERIME = 21;

function joursDepuis(iso: string | null, aujourdHui: string): number | null {
  if (!iso) return null;
  const ms = Date.parse(`${aujourdHui}T00:00:00Z`) - Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(ms) ? null : Math.floor(ms / 86_400_000);
}

type Fraicheur = 'en-cours' | 'perime' | 'autre';

function fraicheur(t: TournamentRow, aujourdHui: string): Fraicheur {
  if (t.status !== 'running') return 'autre';
  const j = joursDepuis(t.start_date, aujourdHui);
  return j !== null && j > JOURS_AVANT_PERIME ? 'perime' : 'en-cours';
}

/** Statut lisible ; un « En cours » périmé est signalé en ambre (avertissement). */
function Statut({ t, f }: { t: TournamentRow; f: Fraicheur }) {
  if (f === 'perime') {
    return (
      <span
        className="font-medium text-amber-700"
        title={`Marqué « En cours » depuis plus de ${JOURS_AVANT_PERIME} jours : un import a sans doute été manqué.`}
      >
        En cours ?
      </span>
    );
  }
  return <>{STATUT_LABEL[t.status] ?? t.status}</>;
}

/** Surface : un point coloré et son nom, dans une pastille neutre. */
function BadgeSurface({ surface }: { surface: string | null }) {
  if (!surface) return <span className="text-zinc-500">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
      <span
        className={`size-2 shrink-0 rounded-full ${SURFACE_POINT[surface] ?? 'bg-zinc-400'}`}
        aria-hidden="true"
      />
      {SURFACE_LABEL[surface] ?? surface}
    </span>
  );
}

/** Circuit écrit en toutes lettres — la barre seule ne suffit pas. */
function PuceCircuit({ tour }: { tour: string | null }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold tracking-wide ${
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

function categorie(t: TournamentRow): string {
  return t.category ? LIBELLE_CATEGORIE_COURT[t.category] ?? t.category : '—';
}

/** Liens d'un tournoi : vraies zones tactiles de 44px, au bureau comme au téléphone. */
function LiensTournoi({ id }: { id: string }) {
  const lien = `${zoneTactile} rounded-xl px-2 text-sm text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900`;
  return (
    <div className="-ml-2 flex flex-wrap">
      <Link href={`/tournoi/${id}/tableau`} className={lien}>Tableau</Link>
      <Link href={`/tournoi/${id}/picks`} className={lien}>Picks</Link>
      <Link href={`/tournoi/${id}/resultats`} className={lien}>Résultats</Link>
    </div>
  );
}

export default async function Home() {
  const tournois = await listTournaments();
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const enCours = tournois.filter((t) => fraicheur(t, aujourdHui) === 'en-cours');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Tournois</h1>
        <Link href="/import" className={boutonPrimaire}>
          Importer un tableau
        </Link>
      </div>

      {tournois.length === 0 ? (
        <p className="text-sm text-zinc-600">
          Aucun tournoi. Commence par{' '}
          <Link href="/import" className="font-medium text-blue-600 underline underline-offset-2">
            importer un tableau
          </Link>
          .
        </p>
      ) : (
        <>
          {/* ── En cours : le point de départ. Un tournoi = une carte, avec
              l'accès direct à ses picks, sans chercher dans la liste. ── */}
          {enCours.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-sm font-semibold">En cours</h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {enCours.map((t) => (
                  <li key={t.id} className={`relative overflow-hidden pl-1 ${carte}`}>
                    <span
                      className={`absolute inset-y-0 left-0 w-1 ${circuitDe(t.tour).barre}`}
                      aria-hidden="true"
                    />
                    <div className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/tournoi/${t.id}`} className="text-base font-semibold hover:underline">
                          {t.name}
                        </Link>
                        <PuceCircuit tour={t.tour} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600">
                        <BadgeSurface surface={t.surface} />
                        <span>
                          {categorie(t)}
                          {t.best_of ? ` · ${t.best_of} sets` : ''} · depuis le {formatDate(t.start_date)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Link href={`/tournoi/${t.id}`} className={lienBouton}>
                          Ouvrir
                        </Link>
                        <Link href={`/tournoi/${t.id}/picks`} className={lienBouton}>
                          Mes picks
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-2.5">
            <h2 className="text-sm font-semibold">Tous les tournois</h2>

            {/* Téléphone : une carte par tournoi. Les huit colonnes du tableau
                débordaient de l'écran. */}
            <ul className="space-y-2 sm:hidden">
              {tournois.map((t) => {
                const f = fraicheur(t, aujourdHui);
                return (
                  <li key={t.id} className={`relative overflow-hidden pl-1 ${carte}`}>
                    <span
                      className={`absolute inset-y-0 left-0 w-1 ${circuitDe(t.tour).barre}`}
                      aria-hidden="true"
                    />
                    <div className="space-y-1.5 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/tournoi/${t.id}`} className="font-semibold hover:underline">
                          {t.name}
                        </Link>
                        <PuceCircuit tour={t.tour} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600">
                        <BadgeSurface surface={t.surface} />
                        <span>
                          {categorie(t)}
                          {t.best_of ? ` · ${t.best_of} sets` : ''}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-600">
                        {formatDate(t.start_date)} · <Statut t={t} f={f} />
                      </div>
                      <LiensTournoi id={t.id} />
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Écran large : le tableau dense, dans une carte, lignes blanches. */}
            <div className={`hidden overflow-hidden sm:block ${carte}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-600">
                    <th className="py-2.5 pl-4 pr-3 font-medium">Début</th>
                    <th className="py-2.5 pr-3 font-medium">Tournoi</th>
                    <th className="py-2.5 pr-3 font-medium">Circuit</th>
                    <th className="py-2.5 pr-3 font-medium">Catégorie</th>
                    <th className="py-2.5 pr-3 font-medium">Surface</th>
                    <th className="py-2.5 pr-3 font-medium">Format</th>
                    <th className="py-2.5 pr-3 font-medium">Statut</th>
                    <th className="py-2.5 pr-3 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {tournois.map((t) => {
                    const f = fraicheur(t, aujourdHui);
                    return (
                      <tr key={t.id} className="hover:bg-zinc-50">
                        <td
                          className={`border-l-4 py-1 pl-3 pr-3 whitespace-nowrap tabular-nums text-zinc-600 ${circuitDe(t.tour).barreBordure}`}
                        >
                          {formatDate(t.start_date)}
                        </td>
                        <td className="py-1 pr-3">
                          <Link href={`/tournoi/${t.id}`} className="font-medium hover:underline">
                            {t.name}
                          </Link>
                        </td>
                        <td className="py-1 pr-3">
                          <PuceCircuit tour={t.tour} />
                        </td>
                        <td className="py-1 pr-3 whitespace-nowrap text-zinc-600">{categorie(t)}</td>
                        <td className="py-1 pr-3">
                          <BadgeSurface surface={t.surface} />
                        </td>
                        <td className="py-1 pr-3 whitespace-nowrap text-zinc-600">
                          {t.best_of ? `${t.best_of} sets` : '—'}
                        </td>
                        <td className="py-1 pr-3 whitespace-nowrap text-zinc-600">
                          <Statut t={t} f={f} />
                        </td>
                        <td className="py-1 pr-3">
                          <LiensTournoi id={t.id} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
