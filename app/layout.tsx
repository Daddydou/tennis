import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { seDeconnecter } from './login/actions';
import { sessionValide } from '@/auth/garde';
import NavGlobale from './NavGlobale';

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
        {/* Barre blanche sur le fond gris très clair de la page : le même
            écart de luminance qui « surélève » les cartes (cf. app/ui.tsx),
            plus un filet fin en dessous — jamais une bordure épaisse. */}
        <header className="bg-white shadow-[0_1px_0_rgba(0,0,0,0.06)]">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-2 sm:px-4">
            <Link
              href="/"
              className="flex min-h-11 shrink-0 items-center rounded-xl px-2 font-semibold tracking-tight transition active:scale-[0.97] hover:bg-zinc-100"
            >
              🎾 Picks Tennis
            </Link>
            <NavGlobale />
            {connecte && (
              <form action={seDeconnecter} className="ml-auto">
                <button
                  type="submit"
                  className="flex min-h-11 items-center rounded-xl px-2.5 text-sm text-zinc-600 transition active:scale-[0.97] hover:bg-zinc-100 hover:text-zinc-900"
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
