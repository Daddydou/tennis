import Link from 'next/link';
import { classeLigneResultat, EtiquetteResultat, PastillePick, PuceParticipant } from '@/app/pastillesPicks';
import { carte, noteInfo, pilleSelecteur } from '@/app/ui';
import { supabaseAnon } from '@/db/anon';
import { calculerConseilsMasters, type ConseilsMasters } from '@/db/mastersConseils';
import { lirePronostics, type PronosticStocke } from '@/db/mastersPronostic';
import { getMatchRows, getParticipants, getPlayerRows, getTousLesPicks, type MatchRow, type TournamentRow } from '@/db/queries';
import { libelleTourMasters } from '@/lib/masters';
import { analyserMatchsMasters, partitionnerTours, type JoueuseAnalyseMasters, type MatchAnalyseMasters } from '@/lib/mastersAnalyse';
import { pronosticFerme } from '@/lib/mastersPronostic';
import { pastillesDuTour, resultatLigne } from '@/lib/pastillesPicks';
import { lignesPhaseFinale, pastillesPoule, pronosticsParParticipant, type ParticipantPronostic } from '@/lib/mastersPronosticVue';
import { vueMasters, type VueMasters } from '@/lib/mastersVue';
import ConseilsMastersCarte from './ConseilsMasters';
import { CartePoule, LegendePronostics, PhaseFinale, type Noms } from './MastersPieces';
import PicksParticipantMasters from './PicksParticipantMasters';
import PlanMasters from './PlanMasters';
import { pointsPicksParStock, stocksDuGroupe } from './pointsStock';
import PronosticsMasters, { type ParticipantMasters } from './PronosticsMasters';

/**
 * Écrans d'un tournoi au format Masters (ATP Finals, WTA Finals), un par onglet :
 * Tableau (poules, classements, demies, finale), Picks (picks proposés, joueuses, adversaires, Elo, qui a
 * pické qui, envoi à Game Tracker) et Pronostic (classement des poules, demies, championne).
 * Le Dashboard (MastersDashboard.tsx) ne garde que la synthèse.
 */

/** Vue (poules, demies, finale) d'un Masters d'après ses lignes de tn_matches. */
export function vueDepuisRows(rows: MatchRow[]): VueMasters {
  return vueMasters(
    rows.map((r) => ({
      round: r.round,
      position: r.position,
      half: r.half,
      player1Id: r.player1_id,
      player2Id: r.player2_id,
      winnerId: r.winner_id,
      status: r.status,
      sets: r.sets,
    })),
  );
}

async function chargerBase(id: string): Promise<{ rows: MatchRow[]; vue: VueMasters; noms: Noms }> {
  const rows = await getMatchRows(id);
  const vue = vueDepuisRows(rows);
  const ids = [...new Set(rows.flatMap((r) => [r.player1_id, r.player2_id]).filter((x): x is string => x !== null))];
  const noms: Noms = new Map((ids.length ? await getPlayerRows(ids) : []).map((p) => [p.id, p.name]));
  return { rows, vue, noms };
}

export async function MastersTableau({ id }: { id: string }) {
  const { vue, noms } = await chargerBase(id);

  // Pronostics de chacun (jamais bloquants : sans eux, le tableau s'affiche comme avant).
  let parts: ParticipantPronostic[] = [];
  try {
    const [stockes, participants] = await Promise.all([lirePronostics(supabaseAnon(), id), getParticipants()]);
    parts = pronosticsParParticipant(stockes, [{ id: null, nom: 'Moi' }, ...participants.map((p) => ({ id: p.id as string | null, nom: p.name }))]);
  } catch (e) {
    console.error('Pronostics du tableau Masters :', (e as Error).message);
  }
  const prevus = (poule: 'A' | 'B') =>
    parts.map((p) => ({ cle: p.cle, nom: p.nom, classementPrevu: p.pronostic ? (poule === 'A' ? p.pronostic.classementA : p.pronostic.classementB) : null }));
  const sansPronostic = parts.filter((p) => !p.pronostic).map((p) => p.nom);

  return (
    <div className="space-y-4" data-testid="masters-tableau">
      <div className="grid gap-4 md:grid-cols-2">
        <CartePoule p={vue.poules.A} noms={noms} pastilles={pastillesPoule(vue.poules.A, prevus('A'))} />
        <CartePoule p={vue.poules.B} noms={noms} pastilles={pastillesPoule(vue.poules.B, prevus('B'))} />
      </div>
      <PhaseFinale vue={vue} noms={noms} pronostics={lignesPhaseFinale(vue, parts)} />
      {parts.some((p) => p.pronostic) && <LegendePronostics />}
      {sansPronostic.length > 0 && (
        <p className={noteInfo}>
          Pas de pronostic enregistré pour {sansPronostic.join(', ')} : à saisir dans l&apos;onglet Pronostic (saisie à la main possible, même après le premier match).
        </p>
      )}
    </div>
  );
}

/**
 * Une joueuse dans le bloc d'UN tour : fond vert / rouge pâle selon le résultat du match, et les pastilles
 * des seuls picks posés POUR CE TOUR (un pick de la journée 2 ne s'affiche jamais dans la journée 1).
 */
function LigneJoueuse({
  j,
  noms,
  vainqueur,
  round,
  seulementMoi = false,
}: {
  j: JoueuseAnalyseMasters;
  noms: Noms;
  vainqueur: string | null;
  round: string;
  /** Tour validé : seuls MES picks restent affichés, ceux des autres ne le sont que sur les tours non validés. */
  seulementMoi?: boolean;
}) {
  const resultat = resultatLigne(vainqueur, j.id);
  const pastilles = pastillesDuTour({ picks: seulementMoi ? j.picks.filter((p) => p.participant === 'Moi') : j.picks, round, joueuseId: j.id, vainqueurId: vainqueur });
  return (
    <div className={`space-y-1 ${classeLigneResultat(resultat)}`} data-resultat={resultat}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{noms.get(j.id) ?? j.id}</span>
        {j.elo !== null && <span className="text-xs tabular-nums text-zinc-600">Elo {j.elo}</span>}
        {j.proba !== null && vainqueur === null && <span className="text-xs tabular-nums text-zinc-600">{Math.round(j.proba * 100)} % de gagner</span>}
        {resultat !== 'a_jouer' && (
          <span className="ml-auto">
            <EtiquetteResultat r={resultat} />
          </span>
        )}
      </div>
      {pastilles.length === 0 ? (
        <p className="text-xs text-zinc-600">Aucun pick</p>
      ) : (
        <p className="flex flex-wrap items-center gap-1.5" data-testid="pastilles-picks">
          {pastilles.map((p) => (
            <PastillePick key={p.participant} p={p} />
          ))}
        </p>
      )}
    </div>
  );
}

function AnalyseMatchsMasters({ matchs, noms }: { matchs: MatchAnalyseMasters[]; noms: Noms }) {
  if (matchs.length === 0) return null;
  // Les picks des autres ne s'affichent que sur les tours NON validés (en cours ou à jouer) ; les tours validés
  // (tous les matchs joués) sont repliés dessous, avec les résultats et mes seuls picks.
  const { ouverts, valides } = partitionnerTours(matchs);
  const tour = (round: string, seulementMoi: boolean) => (
    <div key={round} className="space-y-2" data-testid={`tour-${round}`}>
      <h3 className="text-xs font-medium text-soustitre">{libelleTourMasters(round)}</h3>
      <div className="grid gap-2 md:grid-cols-2">
        {matchs
          .filter((m) => m.round === round)
          .map((m, i) => (
            <div key={i} className={`${carte} space-y-1.5 p-2`} data-testid="affiche-masters">
              {m.poule && <p className="px-1 text-xs text-zinc-500">Poule {m.poule}</p>}
              <LigneJoueuse j={m.joueuses[0]} noms={noms} vainqueur={m.vainqueurId} round={round} seulementMoi={seulementMoi} />
              <LigneJoueuse j={m.joueuses[1]} noms={noms} vainqueur={m.vainqueurId} round={round} seulementMoi={seulementMoi} />
            </div>
          ))}
      </div>
    </div>
  );
  return (
    <section aria-label="Joueuses et adversaires" className="space-y-3">
      <h2 className="text-sm font-semibold">
        Joueuses et adversaires <span className="font-normal text-zinc-500">· Elo, chance de gagner, picks des autres sur les tours non validés</span>
      </h2>
      {ouverts.map((round) => tour(round, false))}
      {valides.length > 0 && (
        <details className="space-y-3" data-testid="tours-valides">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-zinc-700">
            Tours validés ({valides.map(libelleTourMasters).join(', ')}) · résultats et mes picks
          </summary>
          {valides.map((round) => tour(round, true))}
        </details>
      )}
    </section>
  );
}

export async function MastersPicks({
  id,
  tournoi,
  participantId = null,
}: {
  id: string;
  tournoi: TournamentRow;
  /** Participant dont on regarde les picks (?participant=) ; null ou inconnu = moi. */
  participantId?: string | null;
}) {
  const { rows, vue, noms } = await chargerBase(id);
  const [participants, tousLesPicks] = await Promise.all([getParticipants(), getTousLesPicks(id)]);

  // Un id inconnu dans l'URL (participant retiré) retombe sur moi, comme sur Paris.
  const autre = participantId ? (participants.find((p) => p.id === participantId) ?? null) : null;
  const picksParStock = pointsPicksParStock(tousLesPicks);
  const lienParticipant = (pid: string | null) => `/tournoi/${id}/picks${pid ? `?participant=${pid}` : ''}`;

  // Propositions et envoi : seulement pour MES picks (inutile de les calculer pour un autre).
  let conseils: ConseilsMasters | null = null;
  if (!autre) {
    try {
      conseils = await calculerConseilsMasters(tournoi, rows);
    } catch (e) {
      console.error('Propositions Masters :', (e as Error).message);
    }
  }

  const nomParticipant = (pid: string | null) => (pid === null ? 'Moi' : (participants.find((p) => p.id === pid)?.name ?? 'Participant'));
  const matchs = conseils
    ? analyserMatchsMasters({
        vue,
        elo: conseils.elo,
        picks: tousLesPicks.map((p) => ({ participant: nomParticipant(p.participant_id ?? null), round: p.round, playerId: p.player_id })),
      })
    : [];

  return (
    <div className="space-y-4" data-testid="masters-picks">
      {/* Pour qui, et où chacun en est : même sélecteur que Paris (Moi, Laki, Thomas + leurs points Picks). */}
      {participants.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="selecteur-picks-masters">
          {stocksDuGroupe(participants).map((s) => {
            const actif = (s.id ?? null) === (autre?.id ?? null);
            const pts = picksParStock.get(s.id) ?? 0;
            return (
              <Link
                key={s.id ?? 'moi'}
                href={lienParticipant(s.id ?? null)}
                aria-current={actif ? 'page' : undefined}
                className={`${pilleSelecteur(actif)} gap-1.5`}
              >
                <PuceParticipant nom={s.nom} />
                {s.nom}
                <span className={`tabular-nums ${actif ? 'text-blue-100' : 'text-juste'}`}>{pts} pts</span>
              </Link>
            );
          })}
        </div>
      )}

      {autre ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-100 px-3 py-2 text-sm text-amber-950">
            <span>
              Tu regardes les picks de <strong>{autre.name}</strong> (lecture seule).
            </span>
            <Link href={lienParticipant(null)} className="inline-flex min-h-11 items-center font-medium underline underline-offset-2">
              Revenir à mes picks
            </Link>
          </div>
          <PicksParticipantMasters
            nom={autre.name}
            noms={Object.fromEntries(noms)}
            picks={tousLesPicks
              .filter((p) => p.participant_id === autre.id)
              .map((p) => ({ round: p.round, half: (p.half ?? null) as 'top' | 'bottom' | null, playerId: p.player_id, points: p.points ?? null }))}
          />
        </>
      ) : conseils ? (
        <PlanMasters
          tournamentId={id}
          strategies={conseils.strategies}
          noms={Object.fromEntries(noms)}
          avancement={conseils.avancement}
          afficherGT={tournoi.status !== 'completed'}
        />
      ) : (
        <p className={noteInfo}>Les propositions de picks apparaissent quand les deux poules de 4 sont connues.</p>
      )}

      <AnalyseMatchsMasters matchs={matchs} noms={noms} />

      <p className={noteInfo}>
        Un joueur ne se pique qu&apos;une fois par phase. Les pastilles donnent les picks de Moi, Laki et Thomas déjà enregistrés (alignés sur Game Tracker à chaque lecture),
        dans la journée où ils ont été posés : ✓ juste, ✗ raté, horloge = match pas encore joué. Les picks des autres ne s&apos;affichent que sur les tours non validés
        (matchs encore à jouer) ; leurs picks des tours terminés se lisent en cliquant sur leur nom en haut de l&apos;écran.
      </p>
    </div>
  );
}

export async function MastersPronostic({ id, tournoi }: { id: string; tournoi: TournamentRow }) {
  const { rows, vue, noms } = await chargerBase(id);

  // Pronostics enregistrés, participants et points des picks : jamais bloquants.
  let pronostics: PronosticStocke[] = [];
  let participants: ParticipantMasters[] = [{ id: null, nom: 'Moi' }];
  const picksPar: Record<string, number> = {};
  try {
    const sb = supabaseAnon();
    const [stockes, lignes, picks] = await Promise.all([lirePronostics(sb, id), sb.from('tn_participants').select('id, name').order('name'), getTousLesPicks(id)]);
    pronostics = stockes;
    participants = [{ id: null, nom: 'Moi' }, ...((lignes.data ?? []) as { id: string; name: string }[]).map((p) => ({ id: p.id, nom: p.name }))];
    for (const p of picks) picksPar[p.participant_id ?? 'moi'] = (picksPar[p.participant_id ?? 'moi'] ?? 0) + (p.points ?? 0);
  } catch (e) {
    console.error('Pronostics Masters :', (e as Error).message);
  }
  const ferme = pronosticFerme(rows.map((r) => ({ status: r.status, scheduledAt: r.scheduled_at })), new Date());

  let conseils: ConseilsMasters | null = null;
  try {
    conseils = await calculerConseilsMasters(tournoi, rows);
  } catch (e) {
    console.error('Propositions Masters :', (e as Error).message);
  }

  return (
    <div className="space-y-4" data-testid="masters-pronostic">
      {conseils && <ConseilsMastersCarte conseils={conseils} noms={noms} partie="pronostic" />}

      <PronosticsMasters
        tournamentId={id}
        vue={vue}
        poules={{ A: vue.poules.A.joueurs, B: vue.poules.B.joueurs }}
        noms={Object.fromEntries(noms)}
        participants={participants}
        pronostics={pronostics}
        picksPar={picksPar}
        propose={conseils?.pronostic.pronostic ?? null}
        ferme={ferme}
      />
    </div>
  );
}
