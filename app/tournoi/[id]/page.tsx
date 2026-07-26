import { notFound } from 'next/navigation';
import TournoiNav from './TournoiNav';
import {
  getTournament,
  getMatchRows,
  getPlayerRows,
  type MatchRow,
  type PlayerRow,
} from '@/supabase/queries';

export const dynamic = 'force-dynamic';

const STATUT_BADGE: Record<string, string> = {
  scheduled: 'À jouer',
  live: 'En cours',
  walkover: 'W.O.',
  retired: 'Abandon',
  bye: 'Bye',
};

function nomJoueur(id: string | null, byId: Map<string, PlayerRow>): string {
  if (!id) return 'BYE';
  return byId.get(id)?.name ?? id;
}

/** Jeux d'un set pour un côté, avec tie-break du perdant en exposant. */
function celluleSet(
  g: number | null,
  gAdv: number | null,
  tbPerdant: number | null | undefined,
): string {
  if (g === null) return '';
  if (g > (gAdv ?? -1) && tbPerdant != null) return `${g}`;
  if (g < (gAdv ?? 999) && tbPerdant != null) return `${g}⁽${tbPerdant}⁾`;
  return `${g}`;
}

function LigneJoueur({
  nom,
  gagnant,
  bye,
  sets,
}: {
  nom: string;
  gagnant: boolean;
  bye: boolean;
  sets: string[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex-1 truncate ${
          gagnant ? 'font-semibold' : bye ? 'text-zinc-400' : ''
        }`}
      >
        {nom}
      </span>
      <div className="flex gap-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
        {sets.map((s, i) => (
          <span key={i} className="w-5 text-right tabular-nums">
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function CarteMatch({
  m,
  byId,
}: {
  m: MatchRow;
  byId: Map<string, PlayerRow>;
}) {
  const sets = m.sets ?? [];
  const p1sets = sets.map((s) => celluleSet(s.g1, s.g2, s.tb2));
  const p2sets = sets.map((s) => celluleSet(s.g2, s.g1, s.tb1));
  const badge = STATUT_BADGE[m.status];

  return (
    <div className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <LigneJoueur
        nom={nomJoueur(m.player1_id, byId)}
        gagnant={m.winner_id != null && m.winner_id === m.player1_id}
        bye={m.player1_id === null}
        sets={p1sets}
      />
      <LigneJoueur
        nom={nomJoueur(m.player2_id, byId)}
        gagnant={m.winner_id != null && m.winner_id === m.player2_id}
        bye={m.player2_id === null}
        sets={p2sets}
      />
      {badge && (
        <div className="mt-1 text-[10px] uppercase tracking-wide text-zinc-400">
          {badge}
        </div>
      )}
    </div>
  );
}

export default async function TableauPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tournoi = await getTournament(id);
  if (!tournoi) notFound();

  const matchRows = await getMatchRows(id);
  const ids = new Set<string>();
  for (const m of matchRows) {
    if (m.player1_id) ids.add(m.player1_id);
    if (m.player2_id) ids.add(m.player2_id);
  }
  const players = await getPlayerRows([...ids]);
  const byId = new Map(players.map((p) => [p.id, p]));

  const rounds = tournoi.rounds ?? [];
  const parRound = new Map<string, MatchRow[]>();
  for (const m of matchRows) {
    const arr = parRound.get(m.round) ?? [];
    arr.push(m);
    parRound.set(m.round, arr);
  }

  return (
    <div className="space-y-5">
      <TournoiNav id={id} nom={tournoi.name} active="tableau" />

      {matchRows.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucun match importé.</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {rounds.map((r) => {
            const ms = (parRound.get(r) ?? []).sort(
              (a, b) => (a.position ?? 0) - (b.position ?? 0),
            );
            if (ms.length === 0) return null;
            return (
              <div key={r} className="w-64 shrink-0 space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {r} · {ms.length}
                </h2>
                {ms.map((m) => (
                  <CarteMatch key={m.id} m={m} byId={byId} />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
