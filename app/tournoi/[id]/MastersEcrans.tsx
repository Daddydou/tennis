import { carte, noteInfo } from '@/app/ui';
import { supabaseAnon } from '@/db/anon';
import { calculerConseilsMasters, type ConseilsMasters } from '@/db/mastersConseils';
import { lirePronostics, type PronosticStocke } from '@/db/mastersPronostic';
import { getMatchRows, getParticipants, getPlayerRows, getTousLesPicks, type MatchRow, type TournamentRow } from '@/db/queries';
import { libelleTourMasters } from '@/lib/masters';
import { analyserMatchsMasters, type JoueuseAnalyseMasters, type MatchAnalyseMasters } from '@/lib/mastersAnalyse';
import { pronosticFerme } from '@/lib/mastersPronostic';
import { vueMasters, type VueMasters } from '@/lib/mastersVue';
import ConseilsMastersCarte from './ConseilsMasters';
import { CartePoule, PhaseFinale, type Noms } from './MastersPieces';
import PanneauGTMasters from './PanneauGTMasters';
import PronosticsMasters, { type ParticipantMasters } from './PronosticsMasters';

/**
 * Écrans d'un tournoi au format Masters (ATP Finals, WTA Finals), un par onglet :
 * Tableau (poules, classements, demies, finale), Picks (picks proposés, joueuses, adversaires, Elo, qui a
 * pické qui, envoi à Game Tracker) et Pronostic (classement des poules, demies, championne).
 * Le Dashboard (MastersDashboard.tsx) ne garde que la synthèse.
 */

async function chargerBase(id: string): Promise<{ rows: MatchRow[]; vue: VueMasters; noms: Noms }> {
  const rows = await getMatchRows(id);
  const vue = vueMasters(
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
  const ids = [...new Set(rows.flatMap((r) => [r.player1_id, r.player2_id]).filter((x): x is string => x !== null))];
  const noms: Noms = new Map((ids.length ? await getPlayerRows(ids) : []).map((p) => [p.id, p.name]));
  return { rows, vue, noms };
}

export async function MastersTableau({ id }: { id: string }) {
  const { vue, noms } = await chargerBase(id);
  return (
    <div className="space-y-4" data-testid="masters-tableau">
      <div className="grid gap-4 md:grid-cols-2">
        <CartePoule p={vue.poules.A} noms={noms} />
        <CartePoule p={vue.poules.B} noms={noms} />
      </div>
      <PhaseFinale vue={vue} noms={noms} />
    </div>
  );
}

function LigneJoueuse({ j, noms, vainqueur }: { j: JoueuseAnalyseMasters; noms: Noms; vainqueur: string | null }) {
  const gagne = vainqueur !== null && vainqueur === j.id;
  const perdu = vainqueur !== null && vainqueur !== j.id;
  return (
    <div className={`space-y-0.5 py-1.5 ${perdu ? 'text-zinc-500' : ''}`}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{noms.get(j.id) ?? j.id}</span>
        {j.elo !== null && <span className="text-xs tabular-nums text-zinc-600">Elo {j.elo}</span>}
        {j.proba !== null && vainqueur === null && <span className="text-xs tabular-nums text-zinc-600">{Math.round(j.proba * 100)} % de gagner</span>}
        {gagne && <span className="text-xs font-medium">Gagné</span>}
        {perdu && <span className="text-xs font-medium">Perdu</span>}
      </div>
      <p className="text-xs text-zinc-600">
        {j.picks.length === 0 ? 'Pickée par personne' : `Pickée par ${j.picks.map((p) => `${p.participant} (${libelleTourMasters(p.round)})`).join(', ')}`}
      </p>
    </div>
  );
}

function AnalyseMatchsMasters({ matchs, noms }: { matchs: MatchAnalyseMasters[]; noms: Noms }) {
  if (matchs.length === 0) return null;
  const tours = [...new Set(matchs.map((m) => m.round))];
  return (
    <section aria-label="Joueuses et adversaires" className="space-y-3">
      <h2 className="text-sm font-semibold">
        Joueuses et adversaires <span className="font-normal text-zinc-500">· Elo, chance de gagner, qui a pické qui</span>
      </h2>
      {tours.map((round) => (
        <div key={round} className="space-y-2">
          <h3 className="text-xs font-medium text-soustitre">{libelleTourMasters(round)}</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {matchs
              .filter((m) => m.round === round)
              .map((m, i) => (
                <div key={i} className={`${carte} px-3 py-1`} data-testid="affiche-masters">
                  {m.poule && <p className="pt-1 text-xs text-zinc-500">Poule {m.poule}</p>}
                  <LigneJoueuse j={m.joueuses[0]} noms={noms} vainqueur={m.vainqueurId} />
                  <div className="border-t border-zinc-100" />
                  <LigneJoueuse j={m.joueuses[1]} noms={noms} vainqueur={m.vainqueurId} />
                </div>
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export async function MastersPicks({ id, tournoi }: { id: string; tournoi: TournamentRow }) {
  const { rows, vue, noms } = await chargerBase(id);
  const [participants, tousLesPicks] = await Promise.all([getParticipants(), getTousLesPicks(id)]);

  // Propositions : jamais bloquantes (sans elles, l'analyse et l'envoi restent là).
  let conseils: ConseilsMasters | null = null;
  try {
    conseils = await calculerConseilsMasters(tournoi, rows);
  } catch (e) {
    console.error('Propositions Masters :', (e as Error).message);
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
      {conseils ? (
        <ConseilsMastersCarte conseils={conseils} noms={noms} partie="picks" />
      ) : (
        <p className={noteInfo}>Les propositions de picks apparaissent quand les deux poules de 4 sont connues.</p>
      )}

      {conseils && tournoi.status !== 'completed' && <PanneauGTMasters tournamentId={id} picks={conseils.picks} noms={Object.fromEntries(noms)} />}

      <AnalyseMatchsMasters matchs={matchs} noms={noms} />

      <p className={noteInfo}>
        Un joueur ne se pique qu&apos;une fois par phase. « Pickée par » donne les picks de Moi, Laki et Thomas déjà enregistrés (alignés sur Game Tracker à chaque lecture).
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
