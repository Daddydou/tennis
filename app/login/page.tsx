import { redirect } from 'next/navigation';
import { seConnecter } from './actions';
import { sessionValide } from '@/auth/garde';
import { boutonPrimaire, champTexte } from '@/app/ui';

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
          className={`w-full ${champTexte}`}
        />
        <button type="submit" className={`w-full ${boutonPrimaire}`}>
          Entrer
        </button>
      </form>

      {erreur && (
        <p className="rounded-xl bg-red-50 p-2 text-sm text-red-900">
          Mot de passe incorrect.
        </p>
      )}
    </div>
  );
}
