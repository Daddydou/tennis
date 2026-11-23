import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
// Polices fournies par des paquets npm (Fontsource) : copiées dans le site au build, aucun appel à
// Google ni au build ni chez le visiteur. (next/font/google cassait le build Vercel : « next/font/google
// queries have exactly one entry », le 23/11/2026.)
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jost/wght.css';
import './globals.css';
import { seDeconnecter } from './login/actions';
import { sessionValide } from '@/auth/garde';
import { listTournaments } from '@/db/queries';
import { LIBELLE_CATEGORIE_COURT } from '@/lib/calendrier';
import type { TournamentRow } from '@/db/queries';
import FondVivant from './FondVivant';
import IntroOuverture from './IntroOuverture';
import MenuTiroir, { type GroupeVignettes, type VignetteTournoi } from './MenuTiroir';
import { commenceDansLaSemaine, fraicheur, SURFACE_LABEL } from './tournoisUi';


export const metadata: Metadata = {
  title: 'Picks Tennis',
  description: 'Jeu de picks tennis personnel',
};

export const viewport: Viewport = { themeColor: '#07080a', colorScheme: 'dark' };

/**
 * Lu AVANT l'affichage : si l'écran d'ouverture a déjà été vu dans cette
 * session, il ne doit même pas apparaître une image (cf. IntroOuverture.tsx).
 */
const SCRIPT_INTRO =
  "try{if(sessionStorage.getItem('intro-vue'))document.documentElement.classList.add('intro-vue')}catch(e){}";

/** Combien de tournois récents dans le menu (le reste : « Tous les tournois »). */
const NB_RECENTS_MENU = 6;

function vignette(t: TournamentRow): VignetteTournoi {
  const cat = t.category ? (LIBELLE_CATEGORIE_COURT[t.category] ?? t.category) : null;
  const surface = t.surface ? (SURFACE_LABEL[t.surface] ?? t.surface) : null;
  return { id: t.id, nom: t.name, surface: t.surface, debut: t.start_date, meta: [t.tour, cat, surface].filter(Boolean).join(' · ') };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const connecte = await sessionValide();

  // Le menu tiroir n'existe qu'une fois connecté (rien à montrer sur /login).
  let groupes: GroupeVignettes[] = [];
  let tous: VignetteTournoi[] = [];
  if (connecte) {
    const tournois = await listTournaments();
    const aujourdHui = new Date().toISOString().slice(0, 10);
    const enCours = tournois.filter((t) => fraicheur(t, aujourdHui) === 'en-cours');
    const bientot = tournois.filter((t) => commenceDansLaSemaine(t, aujourdHui));
    const deja = new Set([...enCours, ...bientot].map((t) => t.id));
    const recents = tournois.filter((t) => !deja.has(t.id)).slice(0, NB_RECENTS_MENU);
    groupes = [
      { titre: 'En cours', tournois: enCours.map(vignette) },
      { titre: 'Cette semaine', tournois: bientot.map(vignette) },
      { titre: 'Derniers', tournois: recents.map(vignette) },
    ];
    tous = tournois.map(vignette);
  }

  return (
    // suppressHydrationWarning : le script ci-dessous peut ajouter `intro-vue`
    // à <html> avant React (l'ouverture a déjà été vue dans cette session).
    <html lang="fr" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_INTRO }} />
      </head>
      <body className="flex min-h-full flex-col overflow-x-clip">
        {/* Fibres et poussières qui dérivent derrière tout (canvas fixe, sans clic). */}
        <FondVivant />
        {connecte && <IntroOuverture annee={Number(new Date().toISOString().slice(0, 4))} />}
        {/* Barre du haut transparente, au-dessus des bandeaux qui glissent dessous :
            le menu à gauche, le nom au centre, la balle (accueil) à droite. */}
        <header className="relative z-30">
          <div className="mx-auto grid h-16 max-w-6xl grid-cols-[auto_1fr_auto] items-center px-2 sm:px-4">
            {connecte ? (
              <MenuTiroir
                groupes={groupes}
                tous={tous}
                deconnexion={
                  <form key="deconnexion" action={seDeconnecter}>
                    <button
                      type="submit"
                      className="titre-espace inline-flex min-h-11 items-center text-[0.7rem] text-zinc-700 transition hover:text-zinc-950"
                    >
                      Déconnexion
                    </button>
                  </form>
                }
              />
            ) : (
              <span className="size-11" aria-hidden="true" />
            )}
            <Link
              href="/"
              className="titre-espace justify-self-center pl-[0.6em] text-sm tracking-[0.6em] text-zinc-900 transition hover:text-zinc-950"
            >
              Tennis
            </Link>
            <Link
              href="/"
              aria-label="Accueil"
              className="flex size-11 items-center justify-center rounded-md transition hover:bg-white/5"
            >
              <svg width="26" height="26" viewBox="0 0 30 30" fill="none" strokeWidth="1" aria-hidden="true" className="stroke-zinc-700">
                <circle cx="15" cy="15" r="12" />
                <path d="M5 7c6 4 6 12 0 16M25 7c-6 4-6 12 0 16" />
              </svg>
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-5">{children}</main>
      </body>
    </html>
  );
}
