import Link from 'next/link';
import { sessionValide } from '@/auth/garde';
import { listerTournoisThomas } from '@/externe/thomasClient';
import { supabaseAnon } from '@/db/anon';
import CarteThomas, { type TournoiInterne } from './CarteThomas';

export const dynamic = 'force-dynamic';

/**
 * Bracket de Thomas, depuis le téléphone : la liste de ses tournois, et pour
 * chacun « Aperçu » / « Synchroniser ». Remplace le terminal
 * (npm run sync:bracket-thomas), qui reste utilisable.
 */
export default async function PageThomas() {
  if (!(await sessionValide())) {
    return <p className="text-sm text-zinc-500">Connecte-toi pour synchroniser le bracket de Thomas.</p>;
  }

  const entete = (
    <div>
      <h1 className="text-lg font-semibold">Bracket de Thomas</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Copie ses tournois (lecture seule chez lui) et reporte les pronostics de Moi, Laki et Thomas dans le
        Simulateur du tournoi lié. « Aperçu » ne change rien ; « Synchroniser » écrit.{' '}
        <Link href="/import" className="underline">
          Retour à l&apos;import
        </Link>
      </p>
    </div>
  );

  if (!process.env.THOMAS_API_KEY) {
    return (
      <div className="max-w-3xl space-y-4">
        {entete}
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          La variable <code>THOMAS_API_KEY</code> n&apos;est pas configurée sur ce déploiement (Vercel).
        </p>
      </div>
    );
  }

  const sb = supabaseAnon();
  const [thomas, { data: synchros, error: eS }, { data: internes, error: eI }] = await Promise.all([
    listerTournoisThomas(null).then(
      (l) => ({ ok: true as const, l }),
      (e: Error) => ({ ok: false as const, message: e.message }),
    ),
    sb.from('tn_bracket_externe_tournois').select('id, updated_at, tournament_id_interne'),
    sb.from('tn_tournaments').select('id, name, start_date').order('start_date', { ascending: false, nullsFirst: false }).limit(40),
  ]);

  if (!thomas.ok || eS || eI) {
    return (
      <div className="max-w-3xl space-y-4">
        {entete}
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">
          Lecture impossible : {!thomas.ok ? thomas.message : (eS ?? eI)?.message}
        </p>
      </div>
    );
  }

  const parId = new Map((synchros ?? []).map((s) => [s.id as string, s]));
  const liste = [...thomas.l].sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
  const choix: TournoiInterne[] = (internes ?? []).map((t) => ({ id: t.id as string, nom: t.name as string }));

  return (
    <div className="max-w-3xl space-y-4">
      {entete}
      {liste.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucun tournoi chez Thomas.</p>
      ) : (
        <ul className="space-y-3">
          {liste.map((t) => {
            const s = parId.get(t.id);
            return (
              <CarteThomas
                key={t.id}
                id={t.id}
                nom={t.nom ?? t.id}
                majThomas={t.updatedAt}
                derniereSynchro={(s?.updated_at as string | undefined) ?? null}
                interne={(s?.tournament_id_interne as string | null | undefined) ?? null}
                internes={choix}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
