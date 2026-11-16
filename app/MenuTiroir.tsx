'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { retenirOrigine } from './origineEntonnoir';
import FondTournoi from './FondTournoi';
import { GROUPES } from './navigation';

/**
 * MENU TIROIR — la navigation globale, façon guide de la série Dark.
 *
 * Un bouton « deux traits » en haut à gauche ouvre un panneau qui glisse
 * depuis la gauche : un champ de recherche, puis des sections en accordéon.
 * « Tournois » (ouverte par défaut) montre les tournois en vignettes, chacune
 * avec son court dessiné ; « Outils » liste les pages d'outils.
 *
 * Accessibilité : vrai <dialog> modal (piège le focus, Échap ferme, le reste
 * de la page devient inerte), sections en <button aria-expanded>. Le panneau
 * se referme tout seul quand on change de page.
 */

export type VignetteTournoi = {
  id: string;
  nom: string;
  surface: string | null;
  /** Date de début (choisit la photo du lieu). */
  debut: string | null;
  /** « ATP · M1000 · Dur » — déjà écrit en toutes lettres côté serveur. */
  meta: string;
};

export type GroupeVignettes = { titre: string; tournois: VignetteTournoi[] };

const outils = GROUPES.find((g) => g.cle === 'outils')?.liens ?? [];

function Vignette({ t, fermer }: { t: VignetteTournoi; fermer: () => void }) {
  const pathname = usePathname();
  const href = `/tournoi/${t.id}`;
  return (
    <Link
      href={href}
      // Le tournoi s'ouvrira depuis cette photo (origineEntonnoir.ts) ; rien à faire si on y est déjà.
      onClick={(e) => {
        // Ouvert dans un autre onglet du navigateur (Ctrl, Cmd, Maj, clic du milieu) : rien ne s'ouvre ici.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        if (pathname === href || pathname.startsWith(`${href}/`)) return;
        const photo = e.currentTarget.querySelector('[data-origine]');
        if (!photo) return;
        retenirOrigine('tournoi', photo);
        // Le menu se range tout de suite : on voit le point lumineux attendre la page.
        fermer();
      }}
      className="group flex min-w-0 flex-col gap-1.5"
    >
      <span data-origine className="relative block aspect-square overflow-hidden rounded-sm ring-1 ring-white/10 transition group-hover:ring-white/40">
        <FondTournoi nom={t.nom} surface={t.surface} debut={t.debut} variante="vignette" />
        <span className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-black/50" aria-hidden="true" />
      </span>
      <span className="truncate text-xs leading-tight text-zinc-900 group-hover:text-zinc-950">{t.nom}</span>
      <span className="-mt-1 truncate text-[0.7rem] leading-tight text-zinc-500">{t.meta}</span>
    </Link>
  );
}

function Section({
  titre,
  ouvert,
  basculer,
  children,
}: {
  titre: string;
  ouvert: boolean;
  basculer: () => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="border-b border-white/8">
      <button
        type="button"
        aria-expanded={ouvert}
        aria-controls={id}
        onClick={basculer}
        className="titre-espace flex min-h-16 w-full items-center justify-between px-8 text-sm text-zinc-900 transition hover:text-zinc-950"
      >
        <span>{titre}</span>
        <span aria-hidden="true" className="text-base font-light tracking-normal text-zinc-500">
          {ouvert ? '–' : '+'}
        </span>
      </button>
      <div id={id} hidden={!ouvert} className="px-8 pb-6">
        {children}
      </div>
    </div>
  );
}

export default function MenuTiroir({
  groupes,
  tous,
  deconnexion,
}: {
  groupes: GroupeVignettes[];
  tous: VignetteTournoi[];
  deconnexion?: ReactNode;
}) {
  const dialogue = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  // Le menu est ouvert « sur une page » : changer de page le referme tout seul,
  // sans effet ni état à remettre à zéro.
  const [ouvertSur, setOuvertSur] = useState<string | null>(null);
  const ouvert = ouvertSur === pathname;
  const setOuvert = (o: boolean) => setOuvertSur(o ? pathname : null);
  const [section, setSection] = useState<'tournois' | 'outils' | null>('tournois');
  const [recherche, setRecherche] = useState('');

  // Ouvre / ferme le vrai <dialog> (focus piégé et Échap fournis par le navigateur).
  useEffect(() => {
    const d = dialogue.current;
    if (!d) return;
    if (ouvert && !d.open) d.showModal();
    if (!ouvert && d.open) d.close();
  }, [ouvert]);

  const resultats = useMemo(() => {
    const q = recherche
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
    if (!q) return null;
    return tous
      .filter((t) => `${t.nom} ${t.meta}`.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().includes(q))
      .slice(0, 12);
  }, [recherche, tous]);

  const basculer = (s: 'tournois' | 'outils') => setSection((x) => (x === s ? null : s));

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-label="Ouvrir le menu"
        aria-haspopup="dialog"
        className="flex size-11 items-center justify-center rounded-md transition hover:bg-white/5 active:scale-[0.97]"
      >
        <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true" className="stroke-zinc-800">
          <path d="M0 1h22M0 11h22" strokeWidth="1.2" />
        </svg>
      </button>

      <dialog
        ref={dialogue}
        aria-label="Menu"
        onClose={() => setOuvert(false)}
        onClick={(e) => {
          // Un clic sur le voile (hors du panneau) referme.
          if (e.target === e.currentTarget) setOuvert(false);
        }}
        className="tiroir m-0 h-dvh max-h-none w-full max-w-md overflow-hidden border-r border-white/8 bg-[#050607] p-0 text-zinc-800 open:flex open:flex-col"
      >
        <div className="flex justify-end px-5 pt-5">
          <button
            type="button"
            onClick={() => setOuvert(false)}
            aria-label="Fermer le menu"
            className="flex size-11 items-center justify-center rounded-md text-zinc-700 transition hover:bg-white/5 hover:text-zinc-950"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
              <path d="M3 3l14 14M17 3L3 17" />
            </svg>
          </button>
        </div>

        <div className="border-b border-white/8 px-8 pb-6 pt-2">
          <label className="flex items-center gap-3 border-b border-white/20 pb-2 focus-within:border-accent">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true" className="shrink-0 text-zinc-600">
              <circle cx="7" cy="7" r="5" />
              <path d="M11 11l4 4" />
            </svg>
            <span className="sr-only">Rechercher un tournoi</span>
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Tournoi, surface, catégorie…"
              className="min-h-9 min-w-0 flex-1 bg-transparent text-sm text-zinc-950 outline-none placeholder:text-zinc-500"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {resultats ? (
            <div className="px-8 py-6">
              {resultats.length === 0 ? (
                <p className="text-sm text-zinc-600">Aucun tournoi ne correspond.</p>
              ) : (
                <div className="cascade grid grid-cols-3 gap-4">
                  {resultats.map((t) => (
                    <Vignette key={t.id} t={t} fermer={() => setOuvert(false)} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <Section titre="Tournois" ouvert={section === 'tournois'} basculer={() => basculer('tournois')}>
                <div className="cascade space-y-6">
                  {groupes
                    .filter((g) => g.tournois.length > 0)
                    .map((g) => (
                      <div key={g.titre} className="space-y-3">
                        <p className="titre-espace text-[0.7rem] text-zinc-500">{g.titre}</p>
                        <div className="grid grid-cols-3 gap-4">
                          {g.tournois.map((t) => (
                            <Vignette key={t.id} t={t} fermer={() => setOuvert(false)} />
                          ))}
                        </div>
                      </div>
                    ))}
                  <Link href="/tournois" className="titre-espace inline-flex min-h-11 items-center text-xs text-accent hover:text-zinc-950">
                    Tous les tournois →
                  </Link>
                </div>
              </Section>
              <Section titre="Outils" ouvert={section === 'outils'} basculer={() => basculer('outils')}>
                <ul className="cascade">
                  {outils.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        aria-current={pathname.startsWith(l.href) ? 'page' : undefined}
                        className="flex min-h-11 items-center text-sm text-zinc-700 transition hover:text-zinc-950 aria-[current=page]:text-accent"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            </>
          )}
        </div>

        <div className="flex items-center gap-6 border-t border-white/8 px-8 py-4">
          <Link href="/" className="titre-espace inline-flex min-h-11 items-center text-[0.7rem] text-zinc-700 hover:text-zinc-950">
            Accueil
          </Link>
          <Link href="/credits" className="titre-espace inline-flex min-h-11 items-center text-[0.7rem] text-zinc-700 hover:text-zinc-950">
            Crédits
          </Link>
          {deconnexion}
        </div>
      </dialog>
    </>
  );
}
