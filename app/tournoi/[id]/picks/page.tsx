import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import TournoiNav from '../TournoiNav';
import NoteCotesUtilisees from '../NoteCotesUtilisees';
import AttenteCalcul from '../AttenteCalcul';
import ProvenanceElo from './ProvenanceElo';
import RecapParticipant from './RecapParticipant';
import PickBoard, { type Colonne, type Candidat } from './PickBoard';
import PanneauGameTracker from './PanneauGameTracker';
import { FournisseurPoolGT } from './PoolGameTracker';
import { pointsPicksParStock, stocksDuGroupe } from '../pointsStock';
import { carte, pilleSelecteur } from '@/app/ui';
import {
  avancementPicks,
  etatsSlots,
  getParticipants,
  getTousLesPicks,
  joueursEnLice,
  loadEngineData,
  surfacePourElo,
} from '@/db/queries';
import { computeAndStoreProjections, projectionsEnCache } from '@/db/projections';
import { chargerBlendProduction } from '@/db/cotesBlend';
import { eloEffectifResolu, type ElosResolus } from '@/db/elo';
import { getInsights } from '@/db/insights';
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
  searchParams: Promise<{ round?: string; participant?: string }>;
}) {
  const { id } = await params;
  const { round: roundParam, participant: participantParam } = await searchParams;

  // Toutes les lectures qui ne dépendent que de l'id partent DE FRONT : en
  // cascade, chaque aller-retour vers la base s'ajoutait au temps d'affichage.
  const [engine, participants, tousLesPicks, blend, insights] = await Promise.all([
    loadEngineData(id),
    getParticipants(),
    getTousLesPicks(id),
    // Traçabilité du blend Elo/cotes (cf. db/cotesBlend.ts) : une lecture
    // légère de tn_odds, jamais une resimulation.
    chargerBlendProduction(id),
    // Insights joueurs (forfait, blessure, charge…) : AFFICHAGE SEUL, ne
    // touchent ni aux espérances, ni au tri, ni à `utilise`.
    getInsights(id),
  ]);
  if (!engine) notFound();
  const { tournament, matches, matchRows, players, playerRows, elos } = engine;
  const rounds = tournament.rounds ?? [];
  const { coteUtilisables } = blend;
  // null = moi — comportement historique, strictement inchangé ; sinon un
  // participant configuré (cf. tn_participants). Un id inconnu dans l'URL
  // (participant retiré depuis /participants) retombe sur moi plutôt que
  // de planter.
  const stockId =
    participantParam && participants.some((p) => p.id === participantParam)
      ? participantParam
      : null;

  // Les picks du stock affiché, tirés de la lecture commune (même filtre et
  // même ordre que getPicks : participant_id, puis date de création).
  const picks = tousLesPicks
    .filter((p) => (p.participant_id ?? null) === stockId)
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));

  // Résumé en tête d'écran : les points Picks déjà validés de chaque
  // participant — même calcul que le Dashboard (./pointsStock), jamais
  // réimplémenté ici.
  const stocksResume = stocksDuGroupe(participants);
  const picksParStock = pointsPicksParStock(tousLesPicks);

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

  // Avancement et tour courant calculés sur LE STOCK AFFICHÉ : Laki et
  // Thomas avancent à leur propre rythme, indépendamment du mien. Même
  // fonction que le Dashboard (db/tableau.ts), pour qu'ils ne divergent jamais.
  const { parTour, tourCourant } = avancementPicks(rounds, matchRows, picks);
  const avancementDe = (r: string) => parTour.find((t) => t.round === r);
  const requis = (r: string) => avancementDe(r)?.requis ?? 0;
  const faits = (r: string) => avancementDe(r)?.faits ?? 0;
  const neutralises = (r: string) => avancementDe(r)?.neutralises ?? 0;

  const roundSelectionne =
    roundParam && rounds.includes(roundParam) ? roundParam : tourCourant;

  // Projections Monte Carlo À PARTIR DU TOUR AFFICHÉ (simulerDepuis) : seuls les
  // survivants réels de ce tour sont simulés. Lues depuis le cache tn_projections
  // (indexé par from_round) UNIQUEMENT — jamais recalculées dans cette requête.
  // Indépendantes du stock affiché : c'est une propriété du tableau, pas de qui picke.
  //
  // NE BLOQUE JAMAIS sur un cache froid (même correctif que chargerReference,
  // cf. db/reference.ts et mémoire perf-resultats-chargerreference) :
  // avant ce commit, `getProjections` relançait ICI une simulation Monte Carlo
  // (20 000 tirages) dès que ce tour n'avait encore jamais été visité — mesuré
  // à 30-47 s sur un tableau de 128 en cache froid, largement au-dessus du
  // timeout d'une fonction Vercel (Gateway Timeout côté proxy, DB en logs
  // faussement incriminée alors que la requête ta_elo, elle, répond en <250 ms).
  // Un tour manquant est maintenant simplement ignoré POUR CETTE REQUÊTE
  // (liste de candidats vide, signalée) et son calcul programmé en
  // arrière-plan via `after()` : la page répond tout de suite et se complète
  // d'elle-même à la visite suivante.
  let esperances: Record<string, Record<string, number>> = {};
  let projectionsEnCalcul = false;
  if (roundSelectionne) {
    const depuisCache = await projectionsEnCache(id, roundSelectionne);
    if (depuisCache) {
      esperances = depuisCache.esperances;
    } else {
      projectionsEnCalcul = true;
      after(async () => {
        try {
          await computeAndStoreProjections(engine, roundSelectionne);
        } catch (e) {
          console.error(`Projections en arrière-plan (${roundSelectionne}) :`, (e as Error).message);
        }
      });
    }
  }


  // Elo effectif (pondéré surface, 0.6), exactement celui que la simulation
  // utilise. Sert à afficher la valeur elle-même, sa source, et l'écart
  // joueur − adversaire (meilleur indicateur de mismatch).
  const surfElo = surfacePourElo(tournament.surface);
  const effElo = (pid: string): number | null => {
    const e = elos[pid] as ElosResolus | undefined;
    return e ? eloEffectifResolu(e, surfElo) : null;
  };


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
      // les joueurs déjà pris ailleurs — PAR CE STOCK.
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
        // Duel de CE tour déjà joué ? Le vainqueur est mis en avant à l'écran.
        const duel = matchRows.find(
          (m) =>
            m.round === roundSelectionne &&
            (m.player1_id === r.playerId || m.player2_id === r.playerId),
        );
        const resultat: Candidat['resultat'] = duel?.winner_id
          ? duel.winner_id === r.playerId
            ? 'gagne'
            : 'perdu'
          : null;
        return {
          playerId: r.playerId,
          nom: r.playerName,
          rang: p?.rank ?? null,
          adversaire: adv,
          resultat,
          // Elo effectif utilisé par la simulation, et d'où il vient.
          elo: elo === null ? null : Math.round(elo),
          sourceElo: resolu?.source ?? 'defaut',
          taName: resolu?.taName ?? null,
          candidats: (resolu?.candidats ?? []).map(
            (c) => `${c.nom} (${c.slug}${c.elo != null ? `, Elo ${Math.round(c.elo)}` : ''})`,
          ),
          // Écart d'Elo effectif joueur − adversaire (indicateur de mismatch).
          ecartElo:
            elo !== null && eloAdv !== null ? Math.round(elo - eloAdv) : null,
          ePoints: r.ePoints,
          utilise,
          insight: insights.get(r.playerId) ?? null,
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

  // ── Récapitulatif, pour un participant sélectionné uniquement (jamais
  //    pour moi : la vue « Moi » reste exactement celle d'avant) ──
  const nomJoueur = (pid: string) => players[pid]?.name ?? pid;
  const rangJoueur = (pid: string) => players[pid]?.rank ?? null;
  // Même source que les colonnes de pick (esperances[joueur][tour affiché]) :
  // le tri des « disponibles » suit toujours l'espérance actuellement
  // affichée, blend Elo/cotes inclus, quel que soit le participant.
  const ePointsJoueur = (pid: string) =>
    roundSelectionne ? esperances[pid]?.[roundSelectionne] ?? 0 : 0;
  const ordreRound = (r: string) => {
    const i = rounds.indexOf(r);
    return i === -1 ? 99 : i;
  };

  const recap =
    stockId !== null
      ? (() => {
          const nomParticipant =
            participants.find((p) => p.id === stockId)?.name ?? stockId;
          const total = picks.reduce((s, p) => s + (p.points ?? 0), 0);
          const picksTries = [...picks].sort(
            (a, b) =>
              ordreRound(a.round) - ordreRound(b.round) ||
              (a.half ?? '').localeCompare(b.half ?? ''),
          );
          const disponibles = [...joueursEnLice(matchRows)]
            .filter((pid) => !dejaUtilises.has(pid))
            .map((pid) => ({ playerId: pid, nom: nomJoueur(pid), rang: rangJoueur(pid) }))
            .sort(
              (a, b) =>
                ePointsJoueur(b.playerId) - ePointsJoueur(a.playerId) ||
                (a.rang ?? 9999) - (b.rang ?? 9999),
            );
          return { nomParticipant, total, picksTries, disponibles };
        })()
      : null;

  const lienParticipant = (participantId: string | null) =>
    `/tournoi/${id}/picks${participantId ? `?participant=${participantId}` : ''}`;
  const lienRound = (r: string) =>
    `/tournoi/${id}/picks?round=${r}${stockId ? `&participant=${stockId}` : ''}`;

  return (
    <FournisseurPoolGT>
    <div className="space-y-5">
      <TournoiNav id={id} nom={tournament.name} active="picks" />

      {/* ── Sélecteur de stock, qui porte aussi les points Picks déjà validés
          de chacun (mêmes chiffres que le Dashboard) : une seule rangée au
          lieu de deux avant d'arriver à la décision. ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {stocksResume.map((s) => {
          const actif = (s.id ?? null) === stockId;
          const pts = picksParStock.get(s.id) ?? 0;
          return participants.length > 0 ? (
            <Link
              key={s.id ?? 'moi'}
              href={lienParticipant(s.id ?? null)}
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

      {/* Pour QUI on pique : impossible à rater (le choix suit les changements
          de tour, d'où des confusions « joueur déjà pické » sur le mauvais stock). */}
      {stockId !== null && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-100 px-3 py-2 text-sm text-amber-950">
          <span>
            Tu modifies les picks de{' '}
            <strong>{participants.find((p) => p.id === stockId)?.name ?? 'ce participant'}</strong>, pas les tiens.
          </span>
          <Link href={lienParticipant(null)} className="font-medium underline underline-offset-2">
            Revenir à mes picks
          </Link>
        </div>
      )}

      {/* ── La décision : quel tour, combien de picks restent à poser ── */}
      {roundSelectionne && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold">
            Tour {roundSelectionne}
            <span className="ml-2 text-sm font-normal text-zinc-600">
              {faits(roundSelectionne) >= requis(roundSelectionne)
                ? requis(roundSelectionne) === 0
                  ? 'aucun pick possible'
                  : 'complet ✓'
                : `${requis(roundSelectionne) - faits(roundSelectionne)} pick${
                    requis(roundSelectionne) - faits(roundSelectionne) > 1 ? 's' : ''
                  } à poser`}
            </span>
          </h2>
          <span className="text-xs text-zinc-600">
            {totalFaits}/{totalPossibles} picks sur le tournoi
            {totalNeutralises > 0 && ` (${totalNeutralises} sans pick possible)`}
          </span>
        </div>
      )}
      <nav aria-label="Tours" className="flex flex-wrap items-center gap-1.5">
        {rounds.map((r) => {
          // requis(r) === 0 : tous les slots du tour sont neutralisés — le tour
          // est complet, il n'y avait rien à y poser.
          const complet = faits(r) >= requis(r);
          const nt = neutralises(r);
          const actif = r === roundSelectionne;
          return (
            <Link
              key={r}
              href={lienRound(r)}
              aria-current={actif ? 'page' : undefined}
              title={
                nt > 0
                  ? `${nt} slot(s) sans pick possible : tous les survivants étaient déjà utilisés`
                  : undefined
              }
              className={pilleSelecteur(actif)}
            >
              {r} {complet ? '✓' : `${faits(r)}/${requis(r)}`}
              {nt > 0 && <span className="ml-0.5 opacity-70">·{nt} neutralisé{nt > 1 ? 's' : ''}</span>}
            </Link>
          );
        })}
      </nav>

      {!roundSelectionne ? (
        <p className="text-sm text-zinc-600">Aucun tour à picker.</p>
      ) : projectionsEnCalcul ? (
        <AttenteCalcul quoi={`des points espérés du tour ${roundSelectionne}`} />
      ) : colonnes.every((c) => c.candidats.length === 0 && !c.impossible) ? (
        <p className="text-sm text-zinc-600">
          Aucun joueur disponible pour ce tour (données de tableau manquantes ou
          tour non encore constitué).
        </p>
      ) : (
        <PickBoard
          tournamentId={id}
          round={roundSelectionne}
          colonnes={colonnes}
          participantId={stockId}
        />
      )}

      {/* ── Game Tracker : MES picks uniquement (la clé agit au nom d'un seul
          joueur). Rien ne se charge ici : le bouton « Lire » interroge. ── */}
      {stockId === null && <PanneauGameTracker tournamentId={id} />}

      {/* ── Récapitulatif du participant sélectionné (jamais pour moi) ── */}
      {recap && <RecapParticipant recap={recap} nomJoueur={nomJoueur} />}

      {/* ── Méthode et sources, sous la décision : utiles pour vérifier, jamais
          sur le chemin du pick. Un Elo douteux reste signalé ligne par ligne. ── */}
      <section className="space-y-2">
        <details className={`${carte} px-4 py-2 text-xs`}>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-zinc-700">
            Comment lire ce tableau
          </summary>
          <div className="space-y-2 pb-2 leading-relaxed text-zinc-700">
            <p>
              Simulation Monte Carlo (20 000 tirages) depuis les survivants
              réels du tour affiché, triée par points espérés. Sous chaque
              joueur : son adversaire, son Elo effectif (pondéré surface),
              l&apos;écart d&apos;Elo avec l&apos;adversaire.
            </p>
            <p>
              Un joueur grisé est déjà utilisé par CE participant ; un autre
              participant peut toujours le prendre.
            </p>
            <p>
              Source de l&apos;Elo : sans marque = trouvé ;{' '}
              <span className="font-medium text-amber-700">import</span> = calculé
              sur nos seuls tournois ;{' '}
              <span className="font-medium text-red-700">défaut</span> = valeur
              par défaut, à vérifier ;{' '}
              <span className="font-medium text-violet-700">ambigu</span> =
              plusieurs homonymes possibles.
            </p>
          </div>
        </details>
        <NoteCotesUtilisees n={coteUtilisables} />
        {/* Provenance des Elo du tableau. Un joueur fort en « maison » ou en
            « défaut » signale une correspondance de nom à corriger. */}
        <ProvenanceElo elos={elos} playerRows={playerRows} tour={tournament.tour} />
      </section>
    </div>
    </FournisseurPoolGT>
  );
}
