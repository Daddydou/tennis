import { notFound } from 'next/navigation';
import TournoiNav from '../TournoiNav';
import EquipeFantasy, { type MembreVue } from './EquipeFantasy';
import { loadEngineData, surfacePourElo } from '@/supabase/queries';
import { equipeEvaluee, getFantasy } from '@/supabase/fantasy';
import { eloEffectifResolu, type ElosResolus } from '@/supabase/elo';
import { COMPOSITIONS, LIBELLE_FAMILLE } from '@/lib/fantasy';

export const dynamic = 'force-dynamic';

export default async function FantasyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const engine = await loadEngineData(id);
  if (!engine) notFound();
  const { tournament, players, elos } = engine;
  const rounds = tournament.rounds ?? [];

  if (rounds.length === 0) {
    return (
      <div className="space-y-5">
        <TournoiNav id={id} nom={tournament.name} active="fantasy" />
        <p className="text-sm text-zinc-500">
          Aucun tour connu pour ce tournoi : rien à composer.
        </p>
      </div>
    );
  }

  // Un tournoi porte UN tableau, d'un seul circuit (`tournament.tour`) : la
  // page ne propose donc jamais qu'une équipe. Les tableaux masculin et
  // féminin d'un même événement sont deux tournois distincts en base, jamais
  // fusionnés — c'est déjà la structure du reste de l'app.
  //
  // L'équipe se compose une fois pour toutes avant le coup d'envoi : les
  // espérances partent du tirage et ignorent les résultats réels, à la
  // différence des écrans Picks et Prédictions qui suivent le tour courant
  // (cf. supabase/fantasy.ts). L'écran affiche donc toujours la même équipe,
  // que le tournoi soit à venir, en cours ou terminé.
  const fantasy = await getFantasy(engine);

  const paliers = COMPOSITIONS[fantasy.famille];

  // L'équipe optimale (sur les seules espérances, cf. ci-dessus) et ce que
  // cette MÊME équipe a marqué sur les résultats importés. Le second n'entre
  // jamais dans le choix du premier — c'est une mesure, pas un critère.
  // Le classement vient de tn_players.rank, complété par le rang publié par
  // Tennis Abstract quand la colonne est vide (cf. rowsToPlayers).
  const evaluation = equipeEvaluee(engine, fantasy);

  // Elo effectif (pondéré surface) : exactement celui que la simulation a
  // utilisé, affiché avec sa source comme dans l'écran Picks.
  const surfElo = surfacePourElo(tournament.surface);
  const effElo = (pid: string): number | null => {
    const e = elos[pid] as ElosResolus | undefined;
    return e ? Math.round(eloEffectifResolu(e, surfElo)) : null;
  };

  const vue: MembreVue[] = evaluation.membres.map((m) => {
    const pid = m.playerId;
    const p = pid ? players[pid] : undefined;
    const resolu = pid ? (elos[pid] as ElosResolus | undefined) : undefined;

    // Espérance et réel du même tour se lisent sur une seule ligne : on les
    // apparie ici, l'affichage n'a plus qu'à les mettre côte à côte. Un tour
    // non joué reste à null, pour ne pas le confondre avec un vrai zéro.
    const reelParTour = new Map(m.detailReel.map((l) => [l.round, l]));

    return {
      numero: m.palier.numero,
      libellePalier: m.palier.libelle,
      playerId: pid,
      nom: p?.name ?? pid,
      rang: p?.rank ?? null,
      pays: p?.country ?? null,
      elo: pid ? effElo(pid) : null,
      sourceElo: resolu?.source ?? 'defaut',
      taName: resolu?.taName ?? null,
      candidats: (resolu?.candidats ?? []).map(
        (c) =>
          `${c.nom} (${c.slug}${c.elo != null ? `, Elo ${Math.round(c.elo)}` : ''})`,
      ),
      eTotal: m.eTotal,
      reel: m.reel,
      detail: pid
        ? (fantasy.joueurs[pid]?.detail ?? []).map((l) => {
            const r = reelParTour.get(l.round);
            return { ...l, reel: r && r.joue ? r.pondere : null };
          })
        : [],
      eligibles: m.eligibles,
    };
  });

  const sansClassement = Object.keys(players).filter(
    (pid) => (players[pid]?.rank ?? null) === null,
  ).length;

  return (
    <div className="space-y-5">
      <TournoiNav id={id} nom={tournament.name} active="fantasy" />

      <div className="space-y-1 text-sm text-zinc-500">
        <p>
          Équipe de{' '}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {paliers.length} joueurs
          </span>{' '}
          ({LIBELLE_FAMILLE[fantasy.famille]}), un par palier de classement, sans
          doublon. Chaque joueur marque sur{' '}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            tous ses matchs du tournoi
          </span>
          , au barème habituel, pondéré par le multiplicateur du tour.
        </p>
        <p className="text-xs">
          Multiplicateurs :{' '}
          {rounds.map((r, i) => (
            <span key={r}>
              {i > 0 && ' · '}
              {r} ×{fantasy.bareme[i] ?? 1}
            </span>
          ))}
        </p>
        <p className="text-xs">
          Espérance{' '}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            a priori
          </span>{' '}
          : simulation Monte Carlo depuis le tirage ({fantasy.tirage || rounds[0]}
          ), tableau complet. L&apos;équipe se composant une seule fois avant le
          coup d&apos;envoi, aucun résultat réel n&apos;entre dans ce calcul — il
          est identique que le tournoi soit à venir, en cours ou terminé.
          {sansClassement > 0 && (
            <>
              {' '}
              {sansClassement} joueur(s) du tableau sans classement connu, donc
              inéligibles à tout palier.
            </>
          )}
        </p>
      </div>

      <EquipeFantasy equipe={vue} termine={evaluation.termine} />
    </div>
  );
}
