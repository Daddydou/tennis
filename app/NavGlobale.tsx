'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Navigation globale. Chaque lien a sa propre zone tactile de 44px (pas
 * seulement son texte) — au téléphone, le header reste la seule navigation
 * globale. La page en cours est marquée (aria-current + texte foncé et
 * gras) : sans ça, rien ne disait où l'on se trouvait.
 */
const LIENS: { href: string; label: string; actifSi: (p: string) => boolean }[] = [
  { href: '/', label: 'Tournois', actifSi: (p) => p === '/' || p.startsWith('/tournoi') },
  { href: '/import', label: 'Importer', actifSi: (p) => p.startsWith('/import') },
  { href: '/face-a-face', label: 'Face-à-face', actifSi: (p) => p.startsWith('/face-a-face') },
  { href: '/bilan', label: 'Bilan', actifSi: (p) => p.startsWith('/bilan') },
  { href: '/fantasy', label: 'Fantasy saison', actifSi: (p) => p.startsWith('/fantasy') },
  { href: '/calibration', label: 'Calibration', actifSi: (p) => p.startsWith('/calibration') },
  { href: '/participants', label: 'Participants', actifSi: (p) => p.startsWith('/participants') },
  { href: '/procedures', label: 'Procédures', actifSi: (p) => p.startsWith('/procedures') },
];

export default function NavGlobale() {
  const pathname = usePathname() ?? '/';
  return (
    <nav
      aria-label="Navigation principale"
      className="flex min-w-0 overflow-x-auto overflow-y-hidden text-sm *:shrink-0 *:whitespace-nowrap"
    >
      {LIENS.map((l) => {
        const actif = l.actifSi(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={actif ? 'page' : undefined}
            className={`flex min-h-11 items-center rounded-xl px-2.5 transition active:scale-[0.97] hover:bg-zinc-100 hover:text-zinc-900 ${
              actif ? 'font-semibold text-zinc-900' : 'text-zinc-600'
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
