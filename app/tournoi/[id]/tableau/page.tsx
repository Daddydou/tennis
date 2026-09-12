import { notFound } from 'next/navigation';
import TournoiNav from '../TournoiNav';
import { carte } from '@/app/ui';
import {
  getTournament,
  getMatchRows,
  getPlayerRows,
  type MatchRow,
  type PlayerRow,
} from '@/supabase/queries';

export const dynamic = 'force-dynamic';

/**
 * Statut : libellé + couleur, JAMAIS la couleur seule (cf. app/page.tsx pour
 * la même règle sur circuit/surface). Reprend les teintes déjà en usage
 * ailleurs dans l'app pour le même sens : ciel pour un bye (bracket.tsx),
 * émeraude pour « en cours »/actif, ambre pour une fin irrégulière (w.o.,
 * abandon — dans le même registre que le repli Elo « maison »), zinc neutre
 * pour un match qui n'a pas encore commencé.
 */
const STATUT_BADGE: Record<string, { label: string; classes: string }> = {
  scheduled: { label: 'À jouer', classes: 'text-zinc-400' },
  live: { label: 'En cours', classes: 'text-emerald-600 dark:text-emerald-400' },
  walkover: { label: 'W.O.', classes: 'text-amber-600 dark:text-amber-400' },
  retired: { label: 'Abandon', classes: 'text-amber-600 dark:text-amber-400' },
  bye: { label: 'Bye', classes: 'text-sky-600 dark:text-sky-400' },
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
  perdant,
  bye,
  sets,
}: {
  nom: string;
  gagnant: boolean;
  /** Le match est décidé et ce n'est pas le vainqueur — s'efface au profit du nom en gras. */
  perdant: boolean;
  bye: boolean;
  sets: string[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex-1 truncate ${
          gagnant
            ? 'font-semibold text-zinc-900 dark:text-zinc-100'
            : bye || perdant
              ? 'text-zinc-400 dark:text-zinc-500'
              : ''
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
  const decide = m.winner_id != null;

  return (
    <div className={`px-3 py-2.5 ${carte}`}>
      <LigneJoueur
        nom={nomJoueur(m.player1_id, byId)}
        gagnant={decide && m.winner_id === m.player1_id}
        perdant={decide && m.winner_id !== m.player1_id}
        bye={m.player1_id === null}
        sets={p1sets}
      />
      <LigneJoueur
        nom={nomJoueur(m.player2_id, byId)}
        gagnant={decide && m.winner_id === m.player2_id}
        perdant={decide && m.winner_id !== m.player2_id}
        bye={m.player2_id === null}
        sets={p2sets}
      />
      {badge && (
        <div className={`mt-1.5 text-[10px] font-medium uppercase tracking-wide ${badge.classes}`}>
          {badge.label}
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
                <h2 className="border-b-2 border-lime-400/70 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-lime-500/40">
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
