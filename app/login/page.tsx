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
        <label htmlFor="mot-de-passe" className="block text-sm font-medium text-zinc-700">
          Mot de passe
        </label>
        <input
          id="mot-de-passe"
          type="password"
          name="motDePasse"
          aria-invalid={erreur ? true : undefined}
          aria-describedby={erreur ? 'erreur-connexion' : undefined}
          autoFocus
          autoComplete="current-password"
          className={`w-full ${champTexte}`}
        />
        <button type="submit" className={`w-full ${boutonPrimaire}`}>
          Entrer
        </button>
      </form>

      {erreur && (
        <p id="erreur-connexion" role="alert" className="rounded-xl bg-red-50 p-2 text-sm text-red-900">
          Mot de passe incorrect. Vérifie les majuscules et réessaie.
        </p>
      )}
    </div>
  );
}
