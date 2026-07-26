import Link from 'next/link';
import { notFound } from 'next/navigation';
import TournoiNav from '../TournoiNav';
import PickBoard, { type Colonne, type Candidat } from './PickBoard';
import { getPicks, loadEngineData, surfacePourElo } from '@/supabase/queries';
import { getProjections } from '@/supabase/projections';
import { genererSlots, recommanderPourTour } from '@/lib/optimizer';
import { eloEffectif } from '@/lib/elo';
import { adversaireDe } from '@/lib/parser';
import type { DrawExtract, Half, Player, Slot } from '@/lib/types';

export const dynamic = 'force-dynamic';

const HALF_LABEL: Record<string, string> = {
  top: 'Moitié haute',
  bottom: 'Moitié basse',
};

export default async function PicksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ round?: string }>;
}) {
  const { id } = await params;
  const { round: roundParam } = await searchParams;

  const engine = await loadEngineData(id);
  if (!engine) notFound();
  const { tournament, matches, players } = engine;
  const rounds = tournament.rounds ?? [];

  const picks = await getPicks(id);

  // Slots du tournoi (2/tour jusqu'aux QF, puis 1 en SF et F → 12 au total)
  const slots = genererSlots(rounds);
  const slotsParRound = new Map<string, Slot[]>();
  for (const s of slots) {
    const a = slotsParRound.get(s.round) ?? [];
    a.push(s);
    slotsParRound.set(s.round, a);
  }

  const picksFaitsParRound = new Map<string, number>();
  for (const p of picks) {
    picksFaitsParRound.set(p.round, (picksFaitsParRound.get(p.round) ?? 0) + 1);
  }
  const requis = (r: string) => slotsParRound.get(r)?.length ?? 0;
  const faits = (r: string) => picksFaitsParRound.get(r) ?? 0;

  // Tour courant = premier tour dont les picks ne sont pas tous posés
  const tourCourant =
    rounds.find((r) => faits(r) < requis(r)) ?? rounds[rounds.length - 1] ?? null;

  const roundSelectionne =
    roundParam && rounds.includes(roundParam) ? roundParam : tourCourant;

  // Projections Monte Carlo À PARTIR DU TOUR AFFICHÉ (simulerDepuis) : seuls les
  // survivants réels de ce tour sont simulés. Lues depuis le cache tn_projections
  // (indexé par from_round), ou calculées puis mises en cache au premier accès.
  let esperances: Record<string, Record<string, number>> = {};
  if (roundSelectionne) {
    const proj = await getProjections(engine, roundSelectionne);
    esperances = proj.esperances;
  }

  // Elo effectif (pondéré surface, 0.6), cohérent avec la simulation. Sert à
  // afficher l'écart d'Elo joueur − adversaire = meilleur indicateur de mismatch.
  const surfElo = surfacePourElo(tournament.surface);
  const eloSurfaceDe = (p: Player) =>
    surfElo === 'clay' ? p.eloClay : surfElo === 'grass' ? p.eloGrass : p.eloHard;
  const effElo = (p: Player) => eloEffectif(p.eloOverall, eloSurfaceDe(p), 0.6);

  const dejaUtilises = new Set(picks.map((p) => p.player_id));

  // adversaireDe ne lit que .matches ; on lui passe un extract minimal.
  const extractLike = { matches } as unknown as DrawExtract;

  const colonnes: Colonne[] = [];
  if (roundSelectionne) {
    const slotsDuRound = slotsParRound.get(roundSelectionne) ?? [];
    for (const slot of slotsDuRound) {
      const half = slot.half as Half | null;
      const pickExistant = picks.find(
        (p) => p.round === roundSelectionne && (p.half ?? null) === half,
      );

      // Toutes les recommandations du slot (dejaUtilises vide), puis on grise
      // les joueurs déjà pris ailleurs.
      const reco = recommanderPourTour(
        esperances,
        players,
        roundSelectionne,
        half,
        new Set<string>(),
        30,
      );

      const candidats: Candidat[] = reco.map((r) => {
        const advId = adversaireDe(extractLike, r.playerId, roundSelectionne);
        const advP = advId ? players[advId] : undefined;
        const adv = advP?.name ?? advId ?? null;
        const p = players[r.playerId];
        const utilise =
          dejaUtilises.has(r.playerId) && r.playerId !== pickExistant?.player_id;
        return {
          playerId: r.playerId,
          nom: r.playerName,
          rang: p?.rank ?? null,
          adversaire: adv,
          // Écart d'Elo effectif joueur − adversaire (indicateur de mismatch).
          ecartElo: p && advP ? Math.round(effElo(p) - effElo(advP)) : null,
          ePoints: r.ePoints,
          utilise,
        };
      });

      colonnes.push({
        half,
        label: half ? HALF_LABEL[half] : 'Un seul pick',
        pickActuel: pickExistant?.player_id ?? null,
        candidats,
      });
    }
  }

  const totalPicks = slots.length;
  const totalFaits = picks.length;

  return (
    <div className="space-y-5">
      <TournoiNav id={id} nom={tournament.name} active="picks" />

      {/* Sélecteur de tour */}
      <div className="flex flex-wrap items-center gap-2">
        {rounds.map((r) => {
          const complet = faits(r) >= requis(r) && requis(r) > 0;
          const actif = r === roundSelectionne;
          return (
            <Link
              key={r}
              href={`/tournoi/${id}/picks?round=${r}`}
              className={`rounded border px-2.5 py-1 text-xs ${
                actif
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
              }`}
            >
              {r} {complet ? '✓' : `${faits(r)}/${requis(r)}`}
            </Link>
          );
        })}
        <span className="ml-auto text-xs text-zinc-500">
          {totalFaits}/{totalPicks} picks
        </span>
      </div>

      {!roundSelectionne ? (
        <p className="text-sm text-zinc-500">Aucun tour à picker.</p>
      ) : colonnes.every((c) => c.candidats.length === 0) ? (
        <p className="text-sm text-zinc-500">
          Aucun joueur disponible pour ce tour (données de tableau manquantes ou
          tour non encore constitué).
        </p>
      ) : (
        <PickBoard
          tournamentId={id}
          round={roundSelectionne}
          colonnes={colonnes}
        />
      )}
    </div>
  );
}
