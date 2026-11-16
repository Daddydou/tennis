import { PHOTOS } from '../photosTournois';

export const metadata = { title: 'Crédits — Picks Tennis' };

/**
 * CRÉDITS DES PHOTOS — chaque photo de tournoi vient de Wikimedia Commons,
 * sous licence libre : auteur, licence et lien vers la page d'origine.
 */
export default function CreditsPage() {
  const photos = [...PHOTOS].sort((a, b) => a.lieu.localeCompare(b.lieu, 'fr'));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="animate-titre text-2xl text-zinc-950">Crédits</h1>
        <p className="text-sm text-zinc-600">
          Les photos des tournois viennent de Wikimedia Commons, sous licence libre (Creative Commons). Elles sont
          affichées assombries ; cliquer sur un lieu ouvre la page d&apos;origine (auteur, licence complète).
        </p>
      </header>
      <ul className="cascade divide-y divide-white/8">
        {photos.map((p) => (
          <li key={p.cle} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
            <a href={p.page} target="_blank" rel="noreferrer" className="text-sm text-zinc-900 hover:text-accent">
              {p.lieu}
            </a>
            <span className="text-xs text-zinc-600">
              {p.auteur} · {p.licence}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
