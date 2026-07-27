import Link from 'next/link';
import { notFound } from 'next/navigation';
import TournoiNav from '../TournoiNav';
import PickBoard, { type Colonne, type Candidat } from './PickBoard';
import {
  etatsSlots,
  getPicks,
  loadEngineData,
  surfacePourElo,
} from '@/supabase/queries';
import { getProjections } from '@/supabase/projections';
import {
  cleDeNom,
  compterSources,
  eloEffectifResolu,
  type ElosResolus,
} from '@/supabase/elo';
import { genererSlots, recommanderPourTour } from '@/lib/optimizer';
import { adversaireDe } from '@/lib/parser';
import type { DrawExtract, Half, Slot } from '@/lib/types';

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
  const { tournament, matches, matchRows, players, playerRows, elos } = engine;
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

  // Un slot dont tous les survivants sont déjà pickés ailleurs ne peut pas être
  // rempli : c'est un état valide du jeu (contrainte d'unicité), pas une
  // erreur. Il sort du décompte, sinon le tour resterait éternellement
  // incomplet et bloquerait la progression.
  const etats = etatsSlots(slots, matchRows, picks);
  const etatDe = new Map(
    etats.map((e) => [`${e.round}|${e.half ?? ''}`, e] as const),
  );
  const estImpossible = (round: string, half: Half | null) =>
    etatDe.get(`${round}|${half ?? ''}`)?.impossible ?? false;

  const picksFaitsParRound = new Map<string, number>();
  for (const p of picks) {
    picksFaitsParRound.set(p.round, (picksFaitsParRound.get(p.round) ?? 0) + 1);
  }
  /** Slots réellement remplissables : les impossibles sont neutralisés. */
  const requis = (r: string) =>
    (slotsParRound.get(r) ?? []).filter(
      (s) => !estImpossible(s.round, s.half as Half | null),
    ).length;
  const faits = (r: string) => picksFaitsParRound.get(r) ?? 0;
  const neutralises = (r: string) =>
    (slotsParRound.get(r) ?? []).length - requis(r);

  // Tour courant = premier tour dont les picks remplissables ne sont pas
  // tous posés.
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

  // Elo effectif (pondéré surface, 0.6), exactement celui que la simulation
  // utilise. Sert à afficher la valeur elle-même, sa source, et l'écart
  // joueur − adversaire (meilleur indicateur de mismatch).
  const surfElo = surfacePourElo(tournament.surface);
  const effElo = (pid: string): number | null => {
    const e = elos[pid] as ElosResolus | undefined;
    return e ? eloEffectifResolu(e, surfElo) : null;
  };

  // Répartition des sources sur TOUS les joueurs du tournoi (pas seulement les
  // survivants du tour affiché) : c'est le tableau entier qu'on veut contrôler.
  const sources = compterSources(elos);
  const aCompleter = playerRows
    .filter((p) => elos[p.id] && elos[p.id].source !== 'ta')
    .map((p) => ({
      nom: p.name,
      cle: cleDeNom(p.name),
      source: elos[p.id].source,
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom));

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
        const elo = effElo(r.playerId);
        const eloAdv = advId ? effElo(advId) : null;
        const resolu = elos[r.playerId] as ElosResolus | undefined;
        return {
          playerId: r.playerId,
          nom: r.playerName,
          rang: p?.rank ?? null,
          adversaire: adv,
          // Elo effectif utilisé par la simulation, et d'où il vient.
          elo: elo === null ? null : Math.round(elo),
          sourceElo: resolu?.source ?? 'defaut',
          taName: resolu?.taName ?? null,
          // Écart d'Elo effectif joueur − adversaire (indicateur de mismatch).
          ecartElo:
            elo !== null && eloAdv !== null ? Math.round(elo - eloAdv) : null,
          ePoints: r.ePoints,
          utilise,
        };
      });

      colonnes.push({
        half,
        label: half ? HALF_LABEL[half] : 'Un seul pick',
        pickActuel: pickExistant?.player_id ?? null,
        impossible: estImpossible(roundSelectionne, half),
        candidats,
      });
    }
  }

  const totalNeutralises = rounds.reduce((s, r) => s + neutralises(r), 0);
  const totalPossibles = slots.length - totalNeutralises;
  const totalFaits = picks.length;

  return (
    <div className="space-y-5">
      <TournoiNav id={id} nom={tournament.name} active="picks" />

      {/* Provenance des Elo du tableau. Un joueur fort en « maison » ou en
          « défaut » signale une correspondance de nom à corriger. */}
      <details className="rounded border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800">
        <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {sources.ta}
          </span>{' '}
          joueur(s) sur {sources.total} avec Elo Tennis Abstract,{' '}
          <span
            className={
              sources.maison > 0 ? 'font-medium text-amber-600 dark:text-amber-400' : ''
            }
          >
            {sources.maison}
          </span>{' '}
          en repli maison,{' '}
          <span
            className={
              sources.defaut > 0 ? 'font-medium text-red-600 dark:text-red-400' : ''
            }
          >
            {sources.defaut}
          </span>{' '}
          en défaut
          {aCompleter.length > 0 && (
            <span className="ml-1 text-zinc-400">— détail</span>
          )}
        </summary>

        {aCompleter.length === 0 ? (
          <p className="mt-2 text-zinc-500">
            Tous les joueurs du tableau ont un Elo Tennis Abstract.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-zinc-500">
              Sans correspondance Tennis Abstract. Beaucoup sont des
              spécialistes de double ou des joueurs inactifs, absents du
              rapport — pour les autres, ajouter la clé ci-dessous dans{' '}
              <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">
                ta_name_exceptions
              </code>
              .
            </p>
            <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
              {aCompleter.map((j) => (
                <li key={j.cle} className="flex items-baseline gap-2">
                  <span
                    className={
                      j.source === 'defaut'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }
                  >
                    {j.source === 'defaut' ? 'défaut' : 'maison'}
                  </span>
                  <span className="text-zinc-700 dark:text-zinc-300">{j.nom}</span>
                  <code className="text-zinc-400">{j.cle}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </details>

      {/* Sélecteur de tour */}
      <div className="flex flex-wrap items-center gap-2">
        {rounds.map((r) => {
          // requis(r) === 0 : tous les slots du tour sont neutralisés — le tour
          // est complet, il n'y avait rien à y poser.
          const complet = faits(r) >= requis(r);
          const nt = neutralises(r);
          const actif = r === roundSelectionne;
          return (
            <Link
              key={r}
              href={`/tournoi/${id}/picks?round=${r}`}
              title={
                nt > 0
                  ? `${nt} slot(s) sans pick possible : tous les survivants étaient déjà utilisés`
                  : undefined
              }
              className={`rounded border px-2.5 py-1 text-xs ${
                actif
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
              }`}
            >
              {r} {complet ? '✓' : `${faits(r)}/${requis(r)}`}
              {nt > 0 && <span className="ml-0.5 opacity-60">·{nt}∅</span>}
            </Link>
          );
        })}
        <span className="ml-auto text-xs text-zinc-500">
          {totalFaits}/{totalPossibles} picks
          {totalNeutralises > 0 && (
            <span className="ml-1 text-zinc-400">
              ({totalNeutralises} sans pick possible)
            </span>
          )}
        </span>
      </div>

      {!roundSelectionne ? (
        <p className="text-sm text-zinc-500">Aucun tour à picker.</p>
      ) : colonnes.every((c) => c.candidats.length === 0 && !c.impossible) ? (
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
