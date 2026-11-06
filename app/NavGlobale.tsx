'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GROUPES, groupeActif, lienActif } from './navigation';

/**
 * Navigation globale en 4 entrées (Accueil, Tournois, Saison, Outils), plus
 * une sous-barre quand on est dans Saison ou Outils. Chaque lien a sa propre
 * zone tactile de 44px. La page en cours est marquée (aria-current + texte
 * foncé et gras) : sans ça, rien ne disait où l'on se trouvait.
 *
 * `deconnexion` est le formulaire de déconnexion (Server Action) fourni par le
 * layout, seulement si la session est valide : on l'affiche dans la sous-barre
 * Outils.
 */
const LIEN =
  'flex min-h-11 items-center rounded-xl px-2.5 transition active:scale-[0.97] hover:bg-zinc-100 hover:text-zinc-900';

export default function NavGlobale({ deconnexion }: { deconnexion?: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const groupe = groupeActif(pathname);
  const sousLien = groupe ? lienActif(groupe, pathname) : null;

  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="flex min-w-0 overflow-x-auto overflow-y-hidden text-sm *:shrink-0 *:whitespace-nowrap"
      >
        {GROUPES.map((g) => {
          const actif = groupe?.cle === g.cle;
          return (
            <Link
              key={g.cle}
              href={g.href}
              aria-current={actif ? 'page' : undefined}
              className={`${LIEN} ${actif ? 'font-semibold text-zinc-900' : 'text-zinc-600'}`}
            >
              {g.label}
            </Link>
          );
        })}
      </nav>
      {groupe && groupe.liens.length > 0 && (
        <div className="basis-full border-t border-zinc-100">
          <nav
            aria-label={groupe.label}
            className="flex min-w-0 items-center overflow-x-auto overflow-y-hidden text-sm *:shrink-0 *:whitespace-nowrap"
          >
            {groupe.liens.map((l) => {
              const actif = sousLien === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={actif ? 'page' : undefined}
                  className={`${LIEN} ${actif ? 'font-semibold text-zinc-900' : 'text-zinc-600'}`}
                >
                  {l.label}
                </Link>
              );
            })}
            {groupe.cle === 'outils' && deconnexion ? (
              <div className="ml-auto pl-2">{deconnexion}</div>
            ) : null}
          </nav>
        </div>
      )}
    </>
  );
}
