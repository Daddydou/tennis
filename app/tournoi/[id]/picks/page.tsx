import Link from 'next/link';
import { notFound } from 'next/navigation';
import NoteCotesUtilisees from '../NoteCotesUtilisees';
import ProvenanceElo from './ProvenanceElo';
import PanneauGameTracker from './PanneauGameTracker';
import { FournisseurPoolGT } from './PoolGameTracker';
import { pointsPicksParStock, stocksDuGroupe } from '../pointsStock';
import PlanPicks from '../plan/PlanPicks';
import { carte, pilleSelecteur } from '@/app/ui';
import {
  avancementPicks,
  getParticipants,
  getReservationsPlan,
  getTousLesPicks,
  loadEngineData,
  surfacePourElo,
} from '@/db/queries';
import { chargerBlendProduction } from '@/db/cotesBlend';
import { getInsights } from '@/db/insights';
import { POIDS_SURFACE } from '@/db/elo';
import { construireDonneesPlan, type EntreeDonnees } from '@/lib/planDonnees';
import type { PlayerInsight } from '@/lib/insights';

export const dynamic = 'force-dynamic';

const MOITIE: Record<string, string> = { top: 'haut', bottom: 'bas' };

/**
 * Écran Picks = le plan de picks réactif (ex-onglet « Plan ») : UNE seule
 * réponse au tour ouvert. Rien n'est simulé côté serveur : le navigateur
 * reçoit un objet sérialisable et calcule seul (lib/planEcran.ts), donc pas
 * de cache Monte Carlo froid à attendre ici.
 */
export default async function PicksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ participant?: string }>;
}) {
  const { id } = await params;
  const { participant: participantParam } = await searchParams;

  // Toutes les lectures partent de front : en cascade, chaque aller-retour
  // vers la base s'ajoutait au temps d'affichage.
  const [engine, participants, tousLesPicks, blend, insights, reservations] = await Promise.all([
    loadEngineData(id),
    getParticipants(),
    getTousLesPicks(id),
    chargerBlendProduction(id),
    // Insights joueurs (forfait, blessure…) : AFFICHAGE SEUL, jamais dans les calculs.
    getInsights(id),
    // Réservations du plan (tn_plan_reservations) : une lecture ratée ne doit
    // pas faire tomber l'écran de décision — le plan repart alors sans elles.
    getReservationsPlan(id).catch((e: Error) => {
      console.error('Réservations du plan illisibles :', e.message);
      return [];
    }),
  ]);
  if (!engine) notFound();
  const { tournament, matches, matchRows, players, playerRows, elos } = engine;
  const rounds = tournament.rounds ?? [];

  // null = moi ; un id inconnu dans l'URL (participant retiré) retombe sur moi.
  const stockId =
    participantParam && participants.some((p) => p.id === participantParam) ? participantParam : null;
  const nomStock = stockId === null ? null : (participants.find((p) => p.id === stockId)?.name ?? 'ce participant');

  const infoElo: EntreeDonnees['infoElo'] = {};
  for (const [pid, e] of Object.entries(elos)) {
    infoElo[pid] = {
      source: e.source,
      taName: e.taName ?? null,
      candidats: (e.candidats ?? []).map(
        (c) => `${c.nom} (${c.slug}${c.elo != null ? `, Elo ${Math.round(c.elo)}` : ''})`,
      ),
    };
  }

  const donnees = construireDonneesPlan({
    tournoiId: id,
    nom: tournament.name,
    rounds,
    bestOf: (tournament.best_of ?? 3) as 3 | 5,
    surface: surfacePourElo(tournament.surface),
    matches,
    matchRows,
    players,
    infoElo,
    probabiliteMatch: blend.probabiliteMatch,
    poidsSurface: POIDS_SURFACE,
    participants: [{ id: null, nom: 'Moi' }, ...participants.map((p) => ({ id: p.id as string | null, nom: p.name }))],
    picks: tousLesPicks.map((p) => ({
      participant_id: p.participant_id ?? null,
      round: p.round,
      half: p.half ?? null,
      player_id: p.player_id,
      points: p.points ?? null,
    })),
  });

  // Réservations du stock affiché, au format de l'écran (cleSlot -> indice du joueur).
  const indiceJoueur = new Map(donnees.joueurs.map((j, i) => [j.id, i] as const));
  const reservationsInitiales: Record<string, number> = {};
  for (const r of reservations) {
    if ((r.participant_id ?? null) !== stockId) continue;
    const i = indiceJoueur.get(r.player_id);
    if (i !== undefined) reservationsInitiales[`${r.round}|${r.half ?? ''}`] = i;
  }

  const insightsParId: Record<string, PlayerInsight | null> = {};
  for (const j of donnees.joueurs) insightsParId[j.id] = insights.get(j.id) ?? null;

  // Points Picks déjà validés de chacun : même calcul que le Dashboard
  // (./pointsStock), portés par le sélecteur plutôt que par une rangée à part.
  const stocksResume = stocksDuGroupe(participants);
  const picksParStock = pointsPicksParStock(tousLesPicks);
  const lienParticipant = (pid: string | null) => `/tournoi/${id}/picks${pid ? `?participant=${pid}` : ''}`;

  // ── En-tête de décision : quel tour, combien de picks, et peut-on valider
  //    maintenant ? Même avancement que le Dashboard (db/tableau.ts). ──
  const picksDuStock = tousLesPicks.filter((p) => (p.participant_id ?? null) === stockId);
  const { parTour, tourCourant } = avancementPicks(rounds, matchRows, picksDuStock);
  const avancement = parTour.find((t) => t.round === tourCourant);
  const reste = avancement ? Math.max(0, avancement.requis - avancement.faits) : 0;
  const tourEnJeu = rounds[donnees.r0] ?? null;
  // Seul le tour dont les joueurs sont connus se valide (cf. PlanPicks) : un
  // tour suivant s'ouvre quand le tour en jeu est entièrement joué.
  const indexTour = (r: string) => rounds.indexOf(r);
  const enAttente = reste > 0 && tourCourant !== null && tourEnJeu !== null && indexTour(tourCourant) > donnees.r0;

  // Picks des tours déjà joués, pour le suivi : le plan ne montre que les
  // tours à venir.
  const picksJoues = picksDuStock
    .filter((p) => indexTour(p.round) < donnees.r0)
    .sort((a, b) => indexTour(a.round) - indexTour(b.round) || (a.half ?? '').localeCompare(b.half ?? ''));
  const pointsJoues = picksJoues.reduce((s, p) => s + (p.points ?? 0), 0);

  return (
    <FournisseurPoolGT>
      <div className="space-y-5">

        {/* ── Pour qui, et où chacun en est : une seule rangée. ── */}
        <div className="flex flex-wrap items-center gap-1.5">
          {stocksResume.map((s) => {
            const actif = (s.id ?? null) === stockId;
            const pts = picksParStock.get(s.id) ?? 0;
            return participants.length > 0 ? (
              <Link
                key={s.id ?? 'moi'}
                href={lienParticipant(s.id ?? null)}
                aria-current={actif ? 'page' : undefined}
                className={`${pilleSelecteur(actif)} gap-1.5`}
              >
                {s.nom}
                <span className={`tabular-nums ${actif ? 'text-blue-100' : 'text-zinc-500'}`}>{pts} pts</span>
              </Link>
            ) : (
              <div key={s.id ?? 'moi'} className={`flex min-h-11 items-center gap-1.5 px-3 text-sm ${carte}`}>
                <span className="font-medium">{s.nom}</span>
                <span className="tabular-nums text-zinc-500">{pts} pts</span>
              </div>
            );
          })}
        </div>

        {/* Pour QUI on pique : impossible à rater. */}
        {stockId !== null && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-100 px-3 py-2 text-sm text-amber-950">
            <span>
              Tu modifies les picks de <strong>{nomStock}</strong>, pas les tiens.
            </span>
            <Link href={lienParticipant(null)} className="inline-flex min-h-11 items-center font-medium underline underline-offset-2">
              Revenir à mes picks
            </Link>
          </div>
        )}

        {/* ── La décision du moment ── */}
        {tourCourant && (
          <div className="space-y-0.5">
            <h2 className="text-lg font-semibold">
              {reste === 0
                ? `Tour ${tourCourant} : picks posés ✓`
                : `Tour ${tourCourant} : ${reste} pick${reste > 1 ? 's' : ''} à poser`}
            </h2>
            {enAttente && (
              <p className="text-sm text-zinc-600">
                Les joueurs du {tourCourant} ne seront connus qu&apos;à la fin du {tourEnJeu}. Tu peux déjà
                réserver tes joueurs ci-dessous ; la validation s&apos;ouvrira à ce moment-là.
              </p>
            )}
          </div>
        )}

        <PlanPicks
          key={stockId ?? 'moi'}
          donnees={donnees}
          stockId={stockId}
          insights={insightsParId}
          reservationsInitiales={reservationsInitiales}
        />

        {/* Game Tracker : MES picks uniquement (la clé agit au nom d'un seul joueur). */}
        {stockId === null && (
          <div id="game-tracker" className="scroll-mt-4">
            <PanneauGameTracker tournamentId={id} />
          </div>
        )}

        {/* ── Suivi : les picks des tours déjà joués ── */}
        {picksJoues.length > 0 && (
          <details className={`${carte} px-4 py-1`}>
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-medium text-zinc-700">
              <span>
                Tours joués : {picksJoues.length} pick{picksJoues.length > 1 ? 's' : ''}
              </span>
              <span className="tabular-nums text-zinc-900">{pointsJoues} pts</span>
            </summary>
            <ul className="divide-y divide-zinc-100 pb-2 text-sm">
              {picksJoues.map((p) => (
                <li key={`${p.round}|${p.half ?? ''}`} className="flex items-baseline gap-3 py-1.5">
                  <span className="w-20 shrink-0 text-xs text-zinc-500">
                    {p.round}
                    {p.half ? ` · ${MOITIE[p.half] ?? p.half}` : ''}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{players[p.player_id]?.name ?? p.player_id}</span>
                  <span className="shrink-0 font-mono tabular-nums">{p.points ?? 0}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* ── Méthode et sources, sous la décision. ── */}
        <section className="space-y-2">
          <details className={`${carte} px-4 py-1 text-xs`}>
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-zinc-700">
              Comment lire cet écran
            </summary>
            <div className="space-y-2 pb-2 leading-relaxed text-zinc-700">
              <p>
                Le plan répartit tes picks restants sur tous les tours à venir (un joueur une seule fois par
                tournoi) à partir de milliers de tableaux simulés, recalculés dans ton navigateur à chaque choix.
                Prudent, Équilibré et Audacieux changent l&apos;appétit pour le risque ; « Contre Laki et
                Thomas » cherche ce qui maximise ta chance de finir devant eux.
              </p>
              <p>
                « Réserver » garde un joueur pour un tour à venir : la réservation est enregistrée dans l&apos;app (la même sur téléphone et ordinateur) mais ce n&apos;est pas un pick : rien n&apos;est compté, et rien ne part chez Game Tracker tant que tu ne cliques pas sur « Envoyer » dans le panneau Game Tracker (qui envoie alors tes réservations pour les tours à venir). Seul
                le tour dont les joueurs sont connus se valide. Le grand tableau donne, par joueur et par tour,
                les points espérés : un clic sur une case réserve ce joueur pour ce tour.
              </p>
              <p>
                Source de l&apos;Elo : sans marque = trouvé ; <span className="font-medium text-amber-700">import</span>{' '}
                = calculé sur nos seuls tournois ; <span className="font-medium text-red-700">défaut</span> = valeur
                par défaut, à vérifier ; <span className="font-medium text-violet-700">ambigu</span> = plusieurs
                homonymes possibles.
              </p>
            </div>
          </details>
          <NoteCotesUtilisees n={blend.coteUtilisables} />
          {/* Un joueur fort en « maison » ou en « défaut » signale une correspondance de nom à corriger. */}
          <ProvenanceElo elos={elos} playerRows={playerRows} tour={tournament.tour} />
        </section>
      </div>
    </FournisseurPoolGT>
  );
}
