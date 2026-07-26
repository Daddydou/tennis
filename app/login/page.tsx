import { redirect } from 'next/navigation';
import { seConnecter } from './actions';
import { sessionValide } from '@/auth/garde';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erreur?: string }>;
}) {
  // Le proxy laisse /login passer sans cookie : c'est ici qu'on renvoie un
  // visiteur déjà connecté vers l'app.
  if (await sessionValide()) redirect('/');

  const { next, erreur } = await searchParams;

  return (
    <div className="mx-auto max-w-xs space-y-4 py-16">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Accès privé</h1>
        <p className="text-sm text-zinc-500">
          Cet outil est personnel. Mot de passe requis.
        </p>
      </div>

      <form action={seConnecter} className="space-y-3">
        <input type="hidden" name="next" value={next ?? ''} />
        <input
          type="password"
          name="motDePasse"
          placeholder="Mot de passe"
          autoFocus
          autoComplete="current-password"
          className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <button
          type="submit"
          className="w-full rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Entrer
        </button>
      </form>

      {erreur && (
        <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Mot de passe incorrect.
        </p>
      )}
    </div>
  );
}
