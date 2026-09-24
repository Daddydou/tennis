import Link from 'next/link';
import { notFound } from 'next/navigation';
import TournoiNav from '../../TournoiNav';
import ScenarioFantasy, { type DuelReglable } from './ScenarioFantasy';
import { pilleSelecteur } from '@/app/ui';
import { loadEngineData, surfacePourElo, tourCourantMatches } from '@/db/queries';
import { equipeEvaluee, fantasyEnCache } from '@/db/fantasy';
import { chargerBlendProduction } from '@/db/cotesBlend';
import { POIDS_SURFACE } from '@/db/elo';
import { eloEffectif, pVictoire } from '@/lib/elo';
import { cleDuelJoueurs } from '@/lib/fantasyScenario';
import { STATUTS_DECIDES } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * « ET SI » — ajuster les probabilités des matchs d'un tour et voir l'effet
 * sur le score final projeté de l'équipe Fantasy, qui, elle, reste figée.
 * Bac à sable de lecture : rien n'est enregistré (cf. ./actions.ts).
 */
export default async function ScenarioFantasyPage({
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
  const { tournament, matches, matchRows, players } = engine;
  const rounds = tournament.rounds ?? [];

  // Un tour n'est réglable que si tous ses duels sont constitués : on ne peut
  // pas fixer la probabilité d'un match dont un joueur est encore inconnu.
  const constitues = rounds.filter((r) => {
    const duTour = matches.filter((m) => m.round === r && m.status !== 'bye');
    return duTour.length > 0 && duTour.every((m) => m.players[0].id && m.players[1].id);
  });
  const courant = tourCourantMatches(matchRows, rounds);
  const round =
    roundParam && constitues.includes(roundParam)
      ? roundParam
      : courant && constitues.includes(courant)
        ? courant
        : (constitues[constitues.length - 1] ?? null);

  const fantasy = await fantasyEnCache(engine);
  const equipe = fantasy ? equipeEvaluee(engine, fantasy) : null;
  const idsEquipe = new Set(
    (equipe?.membres ?? []).map((m) => m.playerId).filter((p): p is string => p !== null),
  );

  // Probabilité de départ de chaque duel : exactement le modèle de production
  // (Elo effectif pondéré surface, mélangé aux cotes s'il y en a).
  const surface = surfacePourElo(tournament.surface);
  const { probabiliteMatch } = await chargerBlendProduction(id);
  const eloDe = (pid: string) => {
    const p = players[pid];
    if (!p) return 1500;
    const s = surface === 'clay' ? p.eloClay : surface === 'grass' ? p.eloGrass : p.eloHard;
    return eloEffectif(p.eloOverall, s, POIDS_SURFACE);
  };

  const duels: DuelReglable[] = round
    ? matches
        .filter((m) => m.round === round && m.status !== 'bye')
        .map((m) => {
          const a = m.players[0].id!;
          const b = m.players[1].id!;
          const pA = probabiliteMatch(a, b, pVictoire(eloDe(a), eloDe(b)));
          // La clé est ordonnée : on exprime tout du point de vue du premier id.
          const [premier, second] = a < b ? [a, b] : [b, a];
          const vainqueur = STATUTS_DECIDES.includes(m.status)
            ? (m.players.find((p) => p.winner)?.id ?? null)
            : null;
          return {
            cle: cleDuelJoueurs(a, b),
            nomPremier: players[premier]?.name ?? premier,
            nomSecond: players[second]?.name ?? second,
            pBase: a < b ? pA : 1 - pA,
            vainqueurReel: vainqueur === null ? null : vainqueur === premier ? 'premier' : 'second',
            equipe: idsEquipe.has(premier) || idsEquipe.has(second),
          } satisfies DuelReglable;
        })
        // Les matchs de mon équipe d'abord : ce sont eux qui bougent le score.
        .sort((x, y) => Number(y.equipe) - Number(x.equipe))
    : [];

  return (
    <div className="space-y-5">
      <TournoiNav id={id} nom={tournament.name} active="fantasy" />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Et si… — simulateur Fantasy</h1>
        <p className="text-sm text-zinc-500">
          Ajuste les probabilités des matchs d&apos;un tour et regarde comment bouge
          le score final projeté de ton équipe. L&apos;équipe reste celle composée au
          tirage, et <strong>rien n&apos;est enregistré</strong>.{' '}
          <Link href={`/tournoi/${id}/fantasy`} className="underline">
            Retour à l&apos;équipe
          </Link>
        </p>
      </div>

      {!fantasy ? (
        <p className="text-sm text-amber-700">
          L&apos;équipe Fantasy n&apos;est pas encore calculée pour ce tournoi : ouvre
          l&apos;onglet Fantasy, puis reviens ici dans quelques secondes.
        </p>
      ) : !round ? (
        <p className="text-sm text-zinc-500">Aucun tour constitué : rien à régler.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {constitues.map((r) => (
              <Link
                key={r}
                href={`/tournoi/${id}/fantasy/scenario?round=${r}`}
                className={pilleSelecteur(r === round)}
              >
                {r}
              </Link>
            ))}
          </div>
          <ScenarioFantasy key={round} tournamentId={id} round={round} duels={duels} />
        </>
      )}
    </div>
  );
}
