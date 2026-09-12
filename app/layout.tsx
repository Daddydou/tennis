import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { seDeconnecter } from './login/actions';
import { sessionValide } from '@/auth/garde';

export const metadata: Metadata = {
  title: 'Picks Tennis',
  description: 'Jeu de picks tennis personnel',
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const connecte = await sessionValide();
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-2 sm:px-4">
            <Link
              href="/"
              className="flex min-h-11 shrink-0 items-center rounded-md px-2 font-semibold tracking-tight transition active:scale-[0.97] hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              🎾 Picks Tennis
            </Link>
            {/* Chaque lien a sa propre zone tactile de 44px, pas seulement le
                texte qu'il contient — important au téléphone, où le header
                reste la seule navigation globale. */}
            <nav className="flex text-sm text-zinc-500">
              <Link
                href="/"
                className="flex min-h-11 items-center rounded-md px-2.5 transition active:scale-[0.97] hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              >
                Tournois
              </Link>
              <Link
                href="/import"
                className="flex min-h-11 items-center rounded-md px-2.5 transition active:scale-[0.97] hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              >
                Importer
              </Link>
              <Link
                href="/participants"
                className="flex min-h-11 items-center rounded-md px-2.5 transition active:scale-[0.97] hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              >
                Participants
              </Link>
            </nav>
            {connecte && (
              <form action={seDeconnecter} className="ml-auto">
                <button
                  type="submit"
                  className="flex min-h-11 items-center rounded-md px-2.5 text-sm text-zinc-500 transition active:scale-[0.97] hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                >
                  Déconnexion
                </button>
              </form>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">{children}</main>
      </body>
    </html>
  );
}
