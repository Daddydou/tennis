'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ONGLETS, ONGLETS_MASTERS, ongletDe, vueDe } from './onglets';

/**
 * Onglets du tournoi, rendus UNE fois par le layout du tournoi : ils restent
 * affichés pendant qu'un onglet se charge. L'onglet actif se déduit de l'URL.
 *
 * Façon frise du guide Dark : une ligne fine, chaque onglet un point avec son
 * nom au-dessus ; l'onglet actif est un point jaune qui rayonne. Quand
 * l'onglet a deux vues (Tableau | Résultats, Bracket : Le jeu | Prédictions),
 * elles pendent sous son point, reliées par un pointillé — une branche d'arbre.
 * Au téléphone, la frise défile horizontalement plutôt que de se tasser.
 */
export default function TournoiNav({ id, masters = false }: { id: string; masters?: boolean }) {
  const segment = usePathname().split('/')[3] ?? '';
  const active = ongletDe(segment);
  const onglets = masters ? ONGLETS_MASTERS : ONGLETS;
  const vueActive = vueDe(segment);
  const colonnes = { gridTemplateColumns: `repeat(${onglets.length}, minmax(0, 1fr))` };
  const indexActif = onglets.findIndex((o) => o.key === active);
  const vues = masters ? [] : (onglets[indexActif]?.vues ?? []);
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <nav aria-label="Onglets du tournoi" className="min-w-[21rem] sm:min-w-[30rem]">
        <ul className="relative grid" style={colonnes}>
          <li aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[2.6rem] h-px bg-white/30" />
          {onglets.map((o) => {
            const actif = o.key === active;
            return (
              <li key={o.key} className="flex justify-center">
                <Link
                  href={o.href(id)}
                  aria-current={actif ? 'page' : undefined}
                  className="group flex min-h-14 flex-col items-center gap-3 px-2 pt-2 transition active:scale-[0.97]"
                >
                  <span
                    className={`titre-espace whitespace-nowrap pl-[0.3em] text-[0.7rem] max-sm:pl-0 max-sm:text-[0.65rem] max-sm:tracking-[0.08em] ${
                      actif ? 'font-normal text-zinc-950' : 'text-zinc-600 group-hover:text-zinc-900'
                    }`}
                  >
                    {o.label}
                  </span>
                  <span className="flex size-3.5 items-center justify-center">
                    <span
                      className={
                        actif
                          ? 'size-3 rounded-full bg-accent shadow-[0_0_14px_3px_rgba(215,242,90,.45)]'
                          : 'size-1.5 rounded-full bg-zinc-600 transition group-hover:size-2.5 group-hover:bg-zinc-900'
                      }
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {/* Les vues pendent sous le point de l'onglet actif (même colonne). */}
      {vues.length > 0 && (
        <div className="grid min-w-[21rem] sm:min-w-[30rem]" style={colonnes}>
          <nav aria-label="Vues" className="flex flex-col items-center" style={{ gridColumnStart: indexActif + 1 }}>
            <span aria-hidden="true" className="h-3 border-l border-dotted border-white/45" />
            <div className="flex gap-1.5">
              {vues.map((v) => {
                const courante = vueActive === v.segment;
                return (
                  <Link
                    key={v.segment}
                    href={`/tournoi/${id}/${v.segment}`}
                    aria-current={courante ? 'page' : undefined}
                    className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 text-xs transition active:scale-[0.97] ${
                      courante ? 'text-zinc-950 ring-1 ring-white/55' : 'text-zinc-600 ring-1 ring-white/12 hover:text-zinc-900'
                    }`}
                  >
                    {v.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
