import { initiale } from '@/lib/tableauVue';
import type { Verdict, VerdictMatch } from '@/lib/davisVues';

/** Fond d'une pastille de participant selon le verdict (même code couleur que le Tableau : vert juste, rouge raté, gris en attente). */
const STYLE: Record<Verdict | VerdictMatch, string> = {
  juste: 'bg-emerald-600 text-encre',
  complet: 'bg-emerald-600 text-encre',
  nation: 'bg-amber-500 text-encre',
  rate: 'bg-red-600 text-encre',
  attente: 'bg-zinc-200 text-zinc-700',
  sans: 'bg-zinc-100 text-zinc-500',
  vide: 'bg-zinc-100 text-zinc-500',
};

/** Le verdict en toutes lettres : la couleur n'est jamais seule à porter le sens. */
export const LIBELLE_VERDICT_DAVIS: Record<Verdict | VerdictMatch, string> = {
  juste: 'juste',
  complet: 'nation et score justes',
  nation: 'nation juste, score raté',
  rate: 'raté',
  attente: 'en attente',
  sans: 'double non joué',
  vide: 'rien pronostiqué',
};

/** Pastille ronde : l'initiale du participant, colorée selon le verdict. */
export function PastilleDavis({ nom, verdict, detail }: { nom: string; verdict: Verdict | VerdictMatch; detail: string }) {
  return (
    <span
      title={`${nom} : ${detail} (${LIBELLE_VERDICT_DAVIS[verdict]})`}
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold leading-none ${STYLE[verdict]}`}
    >
      {initiale(nom)}
      <span className="sr-only">{` : ${nom}, ${detail} (${LIBELLE_VERDICT_DAVIS[verdict]})`}</span>
    </span>
  );
}
