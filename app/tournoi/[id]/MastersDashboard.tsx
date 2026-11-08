import { carte } from '@/app/ui';
import { getParticipants, getTousLesPicks, type TournamentRow } from '@/db/queries';
import BoutonResultatsMasters from './BoutonResultatsMasters';

/**
 * Dashboard d'un tournoi au format Masters (ATP Finals, WTA Finals) : la synthèse. Le détail est dans les
 * onglets Tableau (poules, classements, demies, finale), Picks (propositions, joueuses, adversaires, Elo,
 * qui a pické qui, envoi à Game Tracker) et Pronostic (poules, demies, championne) : MastersEcrans.tsx.
 * Les onglets Bracket et Fantasy n'ont pas de sens pour ce format (pas de tableau à élimination directe).
 */
export default async function MastersDashboard({ id, tournoi }: { id: string; tournoi: TournamentRow }) {
  const [participants, picks] = await Promise.all([getParticipants(), getTousLesPicks(id)]);

  const points = new Map<string | null, number>();
  for (const p of picks) points.set(p.participant_id ?? null, (points.get(p.participant_id ?? null) ?? 0) + (p.points ?? 0));
  const classement = [{ id: null as string | null, nom: 'Moi' }, ...participants.map((p) => ({ id: p.id as string | null, nom: p.name }))]
    .map((s) => ({ ...s, pts: points.get(s.id) ?? 0 }))
    .sort((a, b) => b.pts - a.pts);

  const termine = tournoi.status === 'completed';

  return (
    <div className="space-y-4" data-testid="masters-dashboard">
      <p className="text-sm text-zinc-600">
        {tournoi.name} : deux poules de 4 (trois journées), les deux premières de chaque poule jouent des demies croisées, puis la finale.
      </p>

      {!termine && <BoutonResultatsMasters tournamentId={id} />}

      <section className="space-y-2.5">
        <h2 className="text-sm font-semibold">Classement des picks</h2>
        {classement.map((l, i) => (
          <div key={l.id ?? 'moi'} className={`${carte} flex items-center gap-x-4 p-3 pl-4`}>
            <span className="w-5 shrink-0 text-sm tabular-nums text-zinc-500">{i + 1}.</span>
            <span className="flex-1 truncate text-base font-semibold">{l.nom}</span>
            <span className="ml-auto flex shrink-0 items-baseline gap-1.5">
              <span className="text-2xl font-bold tabular-nums leading-none">{l.pts}</span>
              <span className="text-xs text-zinc-500">pts</span>
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
