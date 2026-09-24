import type { PickRow } from '@/db/queries';

const HALF_LABEL_COURT: Record<string, string> = { top: 'haut', bottom: 'bas' };

/** Récapitulatif du participant sélectionné (jamais pour moi). */
export default function RecapParticipant({
  recap,
  nomJoueur,
}: {
  recap: {
    nomParticipant: string;
    total: number;
    picksTries: PickRow[];
    disponibles: { playerId: string; nom: string; rang: number | null }[];
  };
  nomJoueur: (pid: string) => string;
}) {
  return (
    <div className="space-y-3 rounded-2xl bg-white p-3 shadow-card">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{recap.nomParticipant}</h2>
        <span className="text-sm font-semibold tabular-nums">
          {recap.total} <span className="font-normal text-zinc-500">pts</span>
        </span>
      </div>

      {recap.picksTries.length === 0 ? (
        <p className="text-xs text-zinc-500">Aucun pick pour l&apos;instant.</p>
      ) : (
        <ul className="space-y-0.5 text-xs">
          {recap.picksTries.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span className="truncate text-zinc-600">
                {p.round}
                {p.half ? ` (${HALF_LABEL_COURT[p.half]})` : ''} — {nomJoueur(p.player_id)}
              </span>
              <span className="tabular-nums text-zinc-500">{p.points ?? '—'}</span>
            </li>
          ))}
        </ul>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-zinc-500">
          {recap.disponibles.length} encore en lice et disponible(s)
        </summary>
        {recap.disponibles.length === 0 ? (
          <p className="mt-1 text-zinc-400">Aucun.</p>
        ) : (
          <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-zinc-600 sm:grid-cols-3">
            {recap.disponibles.map((d) => (
              <li key={d.playerId} className="truncate">
                {d.nom}
                {d.rang ? <span className="text-zinc-400"> #{d.rang}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
