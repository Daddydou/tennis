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
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-2.5">
            <Link href="/" className="font-semibold tracking-tight">
              🎾 Picks Tennis
            </Link>
            <nav className="flex gap-4 text-sm text-zinc-500">
              <Link href="/" className="hover:text-zinc-900 dark:hover:text-zinc-100">
                Tournois
              </Link>
              <Link
                href="/import"
                className="hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Importer
              </Link>
            </nav>
            {connecte && (
              <form action={seDeconnecter} className="ml-auto">
                <button
                  type="submit"
                  className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
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
