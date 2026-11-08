import Link from 'next/link';
import { carte, zoneTactile } from '@/app/ui';
import { supabaseAnon } from '@/db/anon';
import { lirePronostics, type PronosticStocke } from '@/db/mastersPronostic';
import { getMatchRows, getParticipants, getTousLesPicks, type TournamentRow } from '@/db/queries';
import { classerTournoi, reelDepuisVue } from '@/lib/mastersPronostic';
import BoutonLireGTMasters from './BoutonLireGTMasters';
import BoutonResultatsMasters from './BoutonResultatsMasters';
import { vueDepuisRows } from './MastersEcrans';

/**
 * Dashboard d'un tournoi au format Masters (ATP Finals, WTA Finals) : la synthèse. Le détail est dans les
 * onglets Tableau (poules, classements, demies, finale, pronostics de chacun), Picks (propositions, joueuses,
 * adversaires, Elo, qui a pické qui, envoi à Game Tracker) et Pronostic (poules, demies, championne) : MastersEcrans.tsx.
 * Le classement est celui de Paris : pronostic (l'équivalent du bracket) + picks = total, même calcul que
 * l'onglet Pronostic (`classerTournoi`). Les onglets Bracket et Fantasy n'ont pas de sens pour ce format.
 */
export default async function MastersDashboard({ id, tournoi }: { id: string; tournoi: TournamentRow }) {
  const [rows, participants, picks] = await Promise.all([getMatchRows(id), getParticipants(), getTousLesPicks(id)]);

  // Pronostics : jamais bloquants (sans eux, le classement ne compte que les picks).
  let pronostics: PronosticStocke[] = [];
  try {
    pronostics = await lirePronostics(supabaseAnon(), id);
  } catch (e) {
    console.error('Pronostics du Dashboard Masters :', (e as Error).message);
  }

  const picksPar: Record<string, number> = {};
  for (const p of picks) picksPar[p.participant_id ?? 'moi'] = (picksPar[p.participant_id ?? 'moi'] ?? 0) + (p.points ?? 0);
  const stocks = [{ id: null as string | null, nom: 'Moi' }, ...participants.map((p) => ({ id: p.id as string | null, nom: p.name }))];
  const classement = classerTournoi(
    stocks.map((s) => ({
      nom: s.nom,
      pronostic: pronostics.find((x) => x.participantId === s.id)?.pronostic ?? null,
      picks: picksPar[s.id ?? 'moi'] ?? 0,
    })),
    reelDepuisVue(vueDepuisRows(rows)),
  );
  const sansPronostic = classement.filter((l) => !l.pronostic).map((l) => l.nom);
  const termine = tournoi.status === 'completed';

  return (
    <div className="space-y-4" data-testid="masters-dashboard">
      <p className="text-sm text-zinc-600">
        {tournoi.name} : deux poules de 4 (trois journées), les deux premières de chaque poule jouent des demies croisées, puis la finale.
      </p>

      {!termine && (
        <div className="space-y-3">
          <BoutonResultatsMasters tournamentId={id} />
          <BoutonLireGTMasters tournamentId={id} />
        </div>
      )}

      <section className="space-y-2.5">
        <h2 className="text-sm font-semibold">Classement</h2>
        {classement.map((l) => {
          // Le meneur ressort par le trophée et le poids du total, comme sur Paris.
          const enTete = l.rang === 1 && l.total > 0;
          return (
            <div key={l.nom} className={carte}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 p-3 pl-4">
                <span className="w-5 shrink-0 text-sm tabular-nums text-zinc-500">{l.rang}.</span>
                <span className="flex-1 truncate text-base font-semibold">
                  {enTete && '🏆 '}
                  {l.nom}
                </span>

                <span className="shrink-0 text-xs text-zinc-500">
                  Pronostic{' '}
                  {l.pronostic ? (
                    <span className="font-semibold tabular-nums text-zinc-900">{l.pronostic.total}</span>
                  ) : (
                    <span className="font-medium text-zinc-500">—</span>
                  )}
                </span>

                <span className="shrink-0 text-xs text-zinc-500">
                  Picks <span className="font-semibold tabular-nums text-zinc-900">{l.picks}</span>
                </span>

                <span className="ml-auto flex shrink-0 items-baseline gap-1.5">
                  <span className="text-2xl font-bold tabular-nums leading-none">{l.total}</span>
                  <span className="text-xs text-zinc-500">pts</span>
                </span>
              </div>
            </div>
          );
        })}
        {/* Un seul rappel pour tous les pronostics manquants, avec le geste qui le règle. */}
        {sansPronostic.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-amber-700">
            Pronostic pas encore saisi pour {sansPronostic.join(', ')}.
            <Link href={`/tournoi/${id}/pronostic`} className={`${zoneTactile} font-medium underline underline-offset-2`}>
              Saisir les pronostics
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
