import { initiale } from '@/lib/tableauVue';
import {
  LIBELLE_STATUT_PICK,
  teinteParticipant,
  type PastillePickTour,
  type ResultatLigne,
  type ResultatPick,
  type StatutPick,
  type TeinteParticipant,
} from '@/lib/pastillesPicks';

/**
 * Composants partagés de la grammaire « statuts, résultats, participants » (DESIGN.md).
 * Les couleurs viennent des jetons de app/globals.css ; les classes sont écrites EN TOUTES LETTRES
 * (Tailwind lit les sources en texte). La couleur ne porte jamais seule : icône + mot toujours présents.
 */

/* ── Résultat d'un match : fond de la ligne ── */

const LIGNE: Record<ResultatLigne, string> = {
  gagne: 'border-gagne-bord bg-gagne-fond text-gagne-texte',
  perdu: 'border-perdu-bord bg-perdu-fond text-perdu-texte',
  a_jouer: 'border-zinc-200 bg-white text-zinc-900',
};

export const classeLigneResultat = (r: ResultatLigne) => `rounded-xl border px-2.5 py-1.5 ${LIGNE[r]}`;

const MOT_LIGNE: Record<ResultatLigne, string> = { gagne: 'Gagné', perdu: 'Perdu', a_jouer: 'À jouer' };

/** ✓ Gagné / ✗ Perdu / À jouer : l'icône et le mot, jamais la couleur seule. */
export function EtiquetteResultat({ r }: { r: ResultatLigne }) {
  if (r === 'a_jouer') return <span className="text-xs font-medium text-zinc-600">{MOT_LIGNE[r]}</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold">
      <span aria-hidden="true">{r === 'gagne' ? '✓' : '✗'}</span>
      {MOT_LIGNE[r]}
    </span>
  );
}

/* ── Participant : un point rond avec l'initiale ── */

const POINT: Record<TeinteParticipant, string> = {
  moi: 'bg-participant-moi',
  laki: 'bg-participant-laki',
  thomas: 'bg-participant-thomas',
  autre: 'bg-participant-autre',
};

/** Le point rond du participant : le même partout (pastilles, sélecteurs, en-têtes). */
export function PuceParticipant({ nom }: { nom: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full ring-1 ring-white text-[0.65rem] font-bold leading-none text-white ${POINT[teinteParticipant(nom)]}`}
    >
      {initiale(nom)}
    </span>
  );
}

/* ── Pastille d'un pick dans le bloc de SA journée ── */

const MOT_PICK: Record<ResultatPick, string> = { juste: 'juste', rate: 'raté', attente: 'en attente' };

function IconeHorloge() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.2 1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Une pastille : point du participant + nom + ✓ (juste), ✗ (raté) ou horloge (en attente). */
export function PastillePick({ p }: { p: PastillePickTour }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white py-0.5 pl-0.5 pr-2 text-xs font-medium text-zinc-900">
      <PuceParticipant nom={p.participant} />
      {p.participant}
      {p.resultat === 'juste' && (
        <span aria-hidden="true" className="font-bold text-coche">
          ✓
        </span>
      )}
      {p.resultat === 'rate' && (
        <span aria-hidden="true" className="font-bold text-croix">
          ✗
        </span>
      )}
      {p.resultat === 'attente' && <IconeHorloge />}
      <span className="sr-only">{` : pick ${MOT_PICK[p.resultat]}`}</span>
    </span>
  );
}

/* ── Statut d'un pick : posé / réservé / à poser / verrouillé ── */

const STATUT: Record<StatutPick, string> = {
  pose: 'bg-statut-pose-fond text-statut-pose-texte',
  reserve: 'bg-statut-reserve-fond text-statut-reserve-texte',
  a_poser: 'border border-dashed border-zinc-500 bg-transparent text-zinc-700',
  verrouille: 'bg-statut-verrou-fond text-statut-verrou-texte',
};

function IconeStatut({ statut }: { statut: StatutPick }) {
  const commun = { viewBox: '0 0 16 16', className: 'size-3.5 shrink-0', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, 'aria-hidden': true } as const;
  if (statut === 'pose')
    return (
      <svg {...commun}>
        <path d="M3 8.5l3.2 3L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (statut === 'verrouille')
    return (
      <svg {...commun}>
        <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
        <path d="M5.5 7V5.5a2.5 2.5 0 015 0V7" />
      </svg>
    );
  return null;
}

/** La puce de statut d'un pick (la même partout). `libelle` remplace le mot par défaut quand le contexte en dit plus. */
export function ChipStatutPick({ statut, libelle, grand = false }: { statut: StatutPick; libelle?: string; grand?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${grand ? 'text-sm' : 'text-xs'} ${STATUT[statut]}`}>
      <IconeStatut statut={statut} />
      {libelle ?? LIBELLE_STATUT_PICK[statut]}
    </span>
  );
}
