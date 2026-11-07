import type { ReactNode } from 'react';
import { carte } from '@/app/ui';
import { cleStock, type StockStat } from '@/lib/stats/commun';

/**
 * ONGLET STATISTIQUES — petits composants d'affichage partagés par les sept vues.
 * Rien ici ne calcule : tout est reçu déjà calculé (lib/stats/*).
 */

/* -------------------------------------------------------------------------- */
/*  Formats                                                                    */
/* -------------------------------------------------------------------------- */

export function pct(x: number | null | undefined, decimales = 0): string {
  return x === null || x === undefined ? '—' : `${(x * 100).toFixed(decimales)} %`;
}

export function nb(x: number | null | undefined, decimales = 0): string {
  if (x === null || x === undefined) return '—';
  return x.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/** Nombre avec son signe (+3, −2) : pour les écarts. */
export function signe(x: number | null | undefined, decimales = 0): string {
  if (x === null || x === undefined) return '—';
  const texte = Math.abs(x).toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  return `${x > 0 ? '+' : x < 0 ? '−' : ''}${texte}`;
}

/** Couleur d'un écart : sarcelle quand il est positif, framboise quand il est négatif (rôles « points »). */
export function classeEcart(x: number | null | undefined): string {
  if (x === null || x === undefined || x === 0) return '';
  return x > 0 ? 'text-juste' : 'text-rate';
}

/** Surfaces : les teintes déjà en usage dans l'app (ciel dur, ambre terre, émeraude gazon). */
export function classeSurface(libelle: string): string {
  if (libelle === 'Dur') return 'text-sky-700';
  if (libelle === 'Terre battue') return 'text-amber-700';
  if (libelle === 'Gazon') return 'text-emerald-700';
  return 'text-zinc-600';
}

export const LIBELLE_TOUR: Record<string, string> = {
  '1ST_ROUND_QUALIFYING': 'Qualifs 1',
  '2ND_ROUND_QUALIFYING': 'Qualifs 2',
  J1: 'Poules 1',
  J2: 'Poules 2',
  J3: 'Poules 3',
  R128: '1er tour (128)',
  R64: '1er tour (64)',
  R32: '32es',
  R16: '16es',
  QF: 'Quarts',
  SF: 'Demis',
  F: 'Finale',
};

export const libelleTour = (round: string) => LIBELLE_TOUR[round] ?? round;

/* -------------------------------------------------------------------------- */
/*  Blocs                                                                      */
/* -------------------------------------------------------------------------- */

/** Une statistique : numéro (pour s'y référer), titre, phrase d'explication, contenu. */
export function Section({
  num,
  titre,
  aide,
  children,
}: {
  num: string;
  titre: string;
  aide?: string;
  children: ReactNode;
}) {
  return (
    <section className={`space-y-2 p-3 ${carte}`}>
      <div>
        <h2 className="text-sm font-semibold text-titre">
          <span className="mr-1.5 text-xs font-medium tabular-nums text-zinc-500">#{num}</span>
          {titre}
        </h2>
        {aide && <p className="mt-0.5 text-xs text-zinc-500">{aide}</p>}
      </div>
      {children}
    </section>
  );
}

export function Vide({ children = 'Pas encore assez de données pour cette statistique.' }: { children?: ReactNode }) {
  return <p className="text-sm text-zinc-500">{children}</p>;
}

/** Tableau compact. La première colonne est alignée à gauche, les autres à droite. */
export function Tableau({
  colonnes,
  lignes,
  gauche = 1,
}: {
  colonnes: string[];
  lignes: ReactNode[][];
  /** Nombre de colonnes alignées à gauche. */
  gauche?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-zinc-500">
            {colonnes.map((c, i) => (
              <th key={i} className={`py-1 pr-3 font-medium ${i < gauche ? 'text-left' : 'text-right'}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne, i) => (
            <tr key={i} className="border-t border-zinc-100">
              {ligne.map((cell, j) => (
                <td key={j} className={`py-1.5 pr-3 ${j < gauche ? 'text-left' : 'text-right tabular-nums'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Barre horizontale 0–1 (largeur fixe), pour lire un taux d'un coup d'œil. */
export function Barre({ valeur, titre }: { valeur: number | null; titre?: string }) {
  const largeur = valeur === null ? 0 : Math.max(0, Math.min(1, valeur)) * 100;
  return (
    <span
      role="img"
      aria-label={titre ?? pct(valeur)}
      className="inline-block h-2 w-16 overflow-hidden rounded-full bg-zinc-200 align-middle"
    >
      <span className="block h-full rounded-full bg-accent" style={{ width: `${largeur}%` }} />
    </span>
  );
}

/** Taux avec sa barre : « 62 % ▮▮▮▯ ». */
export function TauxBarre({ valeur }: { valeur: number | null }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      {pct(valeur)}
      <Barre valeur={valeur} />
    </span>
  );
}

/** Une grosse valeur avec son libellé (chiffres-clés en tête de section). */
export function Chiffre({ libelle, valeur, aide }: { libelle: string; valeur: ReactNode; aide?: string }) {
  return (
    <div className="min-w-[7rem] rounded-xl bg-zinc-100 px-3 py-2">
      <div className="text-lg font-semibold tabular-nums text-titre">{valeur}</div>
      <div className="text-xs text-zinc-600">{libelle}</div>
      {aide && <div className="text-[11px] text-zinc-500">{aide}</div>}
    </div>
  );
}

export function Chiffres({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

/** Nom d'un joueur du groupe : « Moi » en bleu « mon joueur », les autres en texte normal. */
export function NomStock({ stock }: { stock: Pick<StockStat, 'id' | 'nom'> }) {
  return <span className={stock.id === null ? 'font-semibold text-moi' : 'font-medium'}>{stock.nom}</span>;
}

/* -------------------------------------------------------------------------- */
/*  Courbe des points cumulés                                                  */
/* -------------------------------------------------------------------------- */

/** Style de trait de chaque stock : la couleur ne porte pas seule la différence (trait plein / tirets / points). */
const TRAITS = [
  { couleur: '#0b4f9c', tirets: undefined, epaisseur: 3 },
  { couleur: '#475569', tirets: '7 4', epaisseur: 2.5 },
  { couleur: '#1e293b', tirets: '1.5 4', epaisseur: 3 },
];

export function CourbeCumuls({
  etiquettes,
  series,
}: {
  etiquettes: string[];
  series: { cle: string; nom: string; valeurs: number[] }[];
}) {
  const L = 640;
  const H = 230;
  const m = { g: 40, d: 12, h: 12, b: 24 };
  const n = etiquettes.length;
  const max = Math.max(1, ...series.flatMap((s) => s.valeurs));
  const x = (i: number) => m.g + (n <= 1 ? 0 : (i / (n - 1)) * (L - m.g - m.d));
  const y = (v: number) => H - m.b - (v / max) * (H - m.h - m.b);
  const graduations = [0, 0.5, 1].map((f) => Math.round(max * f));
  return (
    <div>
      <svg viewBox={`0 0 ${L} ${H}`} className="w-full" role="img" aria-label="Points cumulés après chaque tournoi">
        {graduations.map((g) => (
          <g key={g}>
            <line x1={m.g} x2={L - m.d} y1={y(g)} y2={y(g)} stroke="#e4e4e7" />
            <text x={m.g - 6} y={y(g) + 4} textAnchor="end" fontSize="11" fill="#566274">
              {g}
            </text>
          </g>
        ))}
        {series.map((s, k) => {
          const t = TRAITS[k % TRAITS.length];
          return (
            <g key={s.cle}>
              <polyline
                fill="none"
                stroke={t.couleur}
                strokeWidth={t.epaisseur}
                strokeDasharray={t.tirets}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={s.valeurs.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
              />
              {s.valeurs.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={t.couleur}>
                  <title>{`${s.nom} — ${etiquettes[i]} : ${v} pts`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        <text x={m.g} y={H - 6} fontSize="11" fill="#566274">
          {n > 0 ? `1er : ${etiquettes[0]}` : ''}
        </text>
        <text x={L - m.d} y={H - 6} fontSize="11" fill="#566274" textAnchor="end">
          {n > 1 ? `dernier : ${etiquettes[n - 1]}` : ''}
        </text>
      </svg>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {series.map((s, k) => {
          const t = TRAITS[k % TRAITS.length];
          return (
            <li key={s.cle} className="inline-flex items-center gap-1.5">
              <svg width="28" height="8" aria-hidden="true">
                <line x1="1" x2="27" y1="4" y2="4" stroke={t.couleur} strokeWidth={t.epaisseur} strokeDasharray={t.tirets} strokeLinecap="round" />
              </svg>
              {s.nom} <span className="tabular-nums text-zinc-500">({nb(s.valeurs[s.valeurs.length - 1] ?? 0)} pts)</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { cleStock };
