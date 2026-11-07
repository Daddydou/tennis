'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { filtreSecondaire } from '@/app/ui';
import { ONGLETS, ongletDe, vueDe } from './onglets';

/**
 * Titre et onglets du tournoi, rendus UNE fois par le layout du tournoi :
 * ils restent affichés pendant qu'un onglet se charge (seul le contenu passe
 * au squelette de ./loading.tsx). L'onglet actif se déduit de l'URL.
 *
 * Cinq onglets (Dashboard, Tableau, Picks, Bracket, Fantasy). Deux d'entre
 * eux ont deux vues, affichées sous la barre : Tableau (Tableau | Résultats)
 * et Bracket (Le jeu | Prédictions). Les URLs de chaque vue n'ont pas changé.
 */
export default function TournoiNav({ id, nom, masters = false }: { id: string; nom: string; masters?: boolean }) {
  const segment = usePathname().split('/')[3] ?? '';
  const active = ongletDe(segment);
  const vues = masters ? [] : (ONGLETS.find((o) => o.key === active)?.vues ?? []);
  const vueActive = vueDe(segment);
  return (
    <div className="space-y-2">
      <h1 className="text-lg font-semibold">{nom}</h1>
      {/* Cinq onglets tiennent presque dans la largeur d'un téléphone : la barre
          défile quand même horizontalement plutôt que de passer à la ligne, ce
          qui garde l'onglet actif et ses voisins à portée de pouce. */}
      <nav aria-label="Onglets du tournoi" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-zinc-200 text-sm">
        {ONGLETS.filter((o) => !masters || o.key === 'dashboard').map((o) => (
          <Link
            key={o.key}
            href={o.href(id)}
            aria-current={o.key === active ? 'page' : undefined}
            className={`-mb-px flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 transition active:scale-[0.97] ${
              o.key === active
                ? 'border-accent font-semibold text-accent'
                : 'border-transparent text-zinc-600 hover:text-zinc-900'
            }`}
          >
            {o.label}
          </Link>
        ))}
      </nav>
      {vues.length > 0 && (
        <nav aria-label="Vues" className="flex flex-wrap gap-1">
          {vues.map((v) => (
            <Link
              key={v.segment}
              href={`/tournoi/${id}/${v.segment}`}
              aria-current={vueActive === v.segment ? 'page' : undefined}
              className={filtreSecondaire(vueActive === v.segment)}
            >
              {v.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
