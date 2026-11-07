import Link from 'next/link';
import { LIBELLE_CATEGORIE_COURT } from '@/lib/calendrier';
import { estMasters } from '@/lib/masters';
import type { TournamentRow } from '@/db/queries';
import { carte, lienBouton, zoneTactile } from './ui';

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
    barre: 'bg-accent',
    barreBordure: 'border-l-blue-600',
    puce: 'bg-accent text-white',
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

export function fraicheur(t: TournamentRow, aujourdHui: string): Fraicheur {
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

/**
 * Colonnes de la liste « Tous les tournois » dès `sm` (même gabarit pour
 * l'en-tête et pour chaque ligne). Au téléphone, la ligne est une carte
 * empilée (flex) : le gabarit ne s'applique pas.
 */
const GRILLE =
  'sm:grid sm:grid-cols-[7.5rem_minmax(0,1fr)_3.5rem_6rem_5.5rem_4.5rem_6rem_auto] sm:items-center sm:gap-x-3';

/** Liens d'un tournoi : vraies zones tactiles de 44px, au bureau comme au téléphone. */
function LiensTournoi({ id, masters }: { id: string; masters: boolean }) {
  const lien = `${zoneTactile} rounded-xl px-2 text-sm text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900`;
  // Un Masters (WTA Finals) n'a qu'un écran : Tableau, Picks et Résultats
  // renvoient tous à son Dashboard. Un seul lien, pas trois qui mènent au même endroit.
  if (masters) {
    return (
      <div className="-ml-2 flex flex-wrap">
        <Link href={`/tournoi/${id}`} className={lien}>Dashboard</Link>
      </div>
    );
  }
  return (
    <div className="-ml-2 flex flex-wrap">
      <Link href={`/tournoi/${id}/tableau`} className={lien}>Tableau</Link>
      <Link href={`/tournoi/${id}/picks`} className={lien}>Picks</Link>
      <Link href={`/tournoi/${id}/resultats`} className={lien}>Résultats</Link>
    </div>
  );
}

/** À venir, et début dans les 7 jours (aujourd'hui compris). */
const JOURS_AVANT_DEBUT = 7;

export function commenceDansLaSemaine(t: TournamentRow, aujourdHui: string): boolean {
  if (t.status !== 'upcoming') return false;
  const j = joursDepuis(t.start_date, aujourdHui);
  return j !== null && j <= 0 && j >= -JOURS_AVANT_DEBUT;
}

/** Ce que je dois encore poser (calculé côté serveur, cf. db/picksAPoser.ts). */
export type PicksAPoserCarte = { tour: string; reste: number };

/** Libellé de la carte : le même que l'en-tête de l'écran Picks. */
export function libellePicksAPoser(p: PicksAPoserCarte): string {
  return p.reste === 0
    ? `Tour ${p.tour} : picks posés ✓`
    : `Tour ${p.tour} : ${p.reste} pick${p.reste > 1 ? 's' : ''} à poser`;
}

/** Carte d'un tournoi en cours ou qui démarre dans la semaine. */
export function CarteTournoi({
  t,
  debut,
  aPoser,
}: {
  t: TournamentRow;
  debut: 'depuis le' | 'début le';
  aPoser?: PicksAPoserCarte | null;
}) {
  const masters = estMasters(t.rounds);
  return (
    <li className={`relative overflow-hidden pl-1 ${carte}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${circuitDe(t.tour).barre}`} aria-hidden="true" />
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
            {t.best_of ? ` · ${t.best_of} sets` : ''} · {debut} {formatDate(t.start_date)}
          </span>
        </div>
        {aPoser && (
          <p
            className={`text-sm ${aPoser.reste > 0 ? 'font-semibold text-amber-900' : 'text-zinc-600'}`}
            data-testid="picks-a-poser"
          >
            {libellePicksAPoser(aPoser)}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href={`/tournoi/${t.id}`} className={lienBouton}>
            Ouvrir
          </Link>
          {/* Un Masters n'a pas d'écran Picks à part : ils se posent dans son Dashboard. */}
          {!masters && (
            <Link href={`/tournoi/${t.id}/picks`} className={lienBouton}>
              Mes picks
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * La liste des tournois : UNE seule pour tous les écrans (cartes empilées au
 * téléphone, lignes d'un tableau dès `sm`). Sert l'accueil (les derniers) et
 * la page /tournois (tous).
 */
export function ListeTournois({ tournois, aujourdHui }: { tournois: TournamentRow[]; aujourdHui: string }) {
  return (
    <div className={`overflow-hidden ${carte}`}>
      <div
        className={`hidden border-b border-zinc-200 py-2.5 pl-4 pr-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-600 ${GRILLE}`}
      >
        <span className="sm:order-1">Début</span>
        <span className="sm:order-2">Tournoi</span>
        <span className="sm:order-3">Circuit</span>
        <span className="sm:order-4">Catégorie</span>
        <span className="sm:order-5">Surface</span>
        <span className="sm:order-6">Format</span>
        <span className="sm:order-7">Statut</span>
        <span className="sm:order-8 sr-only">Actions</span>
      </div>
      <ul className="divide-y divide-zinc-100">
        {tournois.map((t) => {
          const f = fraicheur(t, aujourdHui);
          return (
            <li
              key={t.id}
              className={`flex flex-wrap items-center gap-x-2 gap-y-1 border-l-4 py-2 pl-3 pr-3 text-sm hover:bg-zinc-50 ${GRILLE} ${circuitDe(t.tour).barreBordure}`}
            >
              <Link
                href={`/tournoi/${t.id}`}
                className="order-1 min-w-0 basis-[calc(100%-3.5rem)] font-semibold hover:underline sm:order-2 sm:basis-auto sm:font-medium"
              >
                {t.name}
              </Link>
              <span className="order-2 sm:order-3">
                <PuceCircuit tour={t.tour} />
              </span>
              <span className="order-3 sm:order-5">
                <BadgeSurface surface={t.surface} />
              </span>
              <span className="order-4 whitespace-nowrap text-xs text-zinc-600 sm:order-4 sm:text-sm">
                {categorie(t)}
              </span>
              <span className="order-5 whitespace-nowrap text-xs text-zinc-600 sm:order-6 sm:text-sm">
                {t.best_of ? `${t.best_of} sets` : '—'}
              </span>
              <span className="order-6 whitespace-nowrap text-xs tabular-nums text-zinc-600 sm:order-1 sm:text-sm">
                {formatDate(t.start_date)}
              </span>
              <span className="order-7 whitespace-nowrap text-xs text-zinc-600 sm:order-7 sm:text-sm">
                <Statut t={t} f={f} />
              </span>
              <span className="order-8 w-full sm:order-8 sm:w-auto">
                <LiensTournoi id={t.id} masters={estMasters(t.rounds)} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
