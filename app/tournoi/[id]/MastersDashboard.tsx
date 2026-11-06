import { badgeNeutre, carte, noteInfo } from '@/app/ui';
import { getMatchRows, getPlayerRows, type TournamentRow } from '@/db/queries';
import { libelleTourMasters } from '@/lib/masters';
import { vueMasters, type MatchVue, type PouleVue } from '@/lib/mastersVue';

/**
 * Écran d'un tournoi au format Masters (ATP Finals, WTA Finals) : deux poules de 4 sur trois journées,
 * puis demies croisées et finale (règles et calculs : lib/masters.ts, lib/mastersVue.ts). Remplace
 * le Dashboard des tournois à tableau pour ce format ; les autres onglets n'ont pas de sens ici (pas de
 * tableau à élimination directe) et renvoient vers cet écran.
 */

type Noms = Map<string, string>;

/** Score du point de vue du joueur 1 : « 6-4 3-6 7-5 », « w/o », « 6-4 2-1 ab. ». */
function score(m: MatchVue): string {
  if (m.speciale === 'forfait') return 'w/o';
  const sets = m.sets.map((s) => `${s.g1}-${s.g2}`).join(' ');
  return m.speciale === 'abandon' ? `${sets} ab.`.trim() : sets;
}

function LigneMatch({ m, noms }: { m: MatchVue; noms: Noms }) {
  const nom = (id: string | null) => (id ? (noms.get(id) ?? id) : 'À déterminer');
  const gras = (id: string | null) => (m.winnerId !== null && m.winnerId === id ? 'font-semibold text-zinc-900' : 'text-zinc-700');
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 py-1 text-sm">
      <span className={gras(m.player1Id)}>{nom(m.player1Id)}</span>
      <span className="text-zinc-400">–</span>
      <span className={gras(m.player2Id)}>{nom(m.player2Id)}</span>
      {m.etat !== 'a_jouer' && (
        <span className="font-mono text-xs text-zinc-600">
          {score(m)}
          {m.etat === 'en_cours' ? ' · en cours' : ''}
        </span>
      )}
    </li>
  );
}

function CartePoule({ p, noms }: { p: PouleVue; noms: Noms }) {
  const qualifies = new Set(p.qualifies ?? []);
  return (
    <section className={`${carte} space-y-3 p-4`}>
      <header className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Poule {p.poule}</h2>
        <span className="text-xs text-zinc-600">{p.terminee ? 'Terminée' : 'En cours'}</span>
      </header>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-zinc-500">
            <th className="w-6 py-1 font-normal">#</th>
            <th className="py-1 font-normal">Joueuse</th>
            <th className="py-1 text-right font-normal">V-D</th>
            <th className="py-1 text-right font-normal">Sets</th>
            <th className="py-1 text-right font-normal">Jeux</th>
          </tr>
        </thead>
        <tbody>
          {p.classement.map((l) => (
            <tr key={l.playerId} className="border-t border-zinc-100">
              <td className="py-1.5 text-zinc-500">{l.egalite ? '=' : ''}{l.rang}</td>
              <td className="py-1.5">
                <span className={qualifies.has(l.playerId) ? 'font-semibold text-zinc-900' : 'text-zinc-800'}>{noms.get(l.playerId) ?? l.playerId}</span>
                {qualifies.has(l.playerId) && <span className={`${badgeNeutre} ml-1.5`}>demi</span>}
              </td>
              <td className="py-1.5 text-right font-mono text-xs">{l.victoires}-{l.defaites}</td>
              <td className="py-1.5 text-right font-mono text-xs text-zinc-600">{l.setsGagnes}-{l.setsPerdus}</td>
              <td className="py-1.5 text-right font-mono text-xs text-zinc-600">{l.jeuxGagnes}-{l.jeuxPerdus}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {p.classement.some((l) => l.egalite) && (
        <p className={noteInfo}>Égalité que les règles ne départagent pas (victoires, confrontation directe, puis sets et jeux) : rang partagé (=).</p>
      )}

      {p.journees.map((j) => (
        <div key={j.round}>
          <h3 className="text-xs font-medium text-zinc-600">{libelleTourMasters(j.round)}</h3>
          <ul>
            {j.matchs.map((m) => (
              <LigneMatch key={m.position} m={m} noms={noms} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export default async function MastersDashboard({ id, tournoi }: { id: string; tournoi: TournamentRow }) {
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

  const joueurOuEtiquette = (jId: string | null, etiquette: string, deduit: boolean) =>
    jId ? (
      <span className={deduit ? 'text-zinc-900' : 'text-zinc-900'}>{noms.get(jId) ?? jId}</span>
    ) : (
      <span className="text-zinc-500">{etiquette}</span>
    );

  return (
    <div className="space-y-4" data-testid="masters-dashboard">
      <p className="text-sm text-zinc-600">
        {tournoi.name} : deux poules de 4 (trois journées), les deux premières de chaque poule jouent des demies croisées, puis la finale.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <CartePoule p={vue.poules.A} noms={noms} />
        <CartePoule p={vue.poules.B} noms={noms} />
      </div>

      <section className={`${carte} space-y-3 p-4`}>
        <h2 className="text-base font-semibold">Phase finale</h2>
        <div>
          <h3 className="text-xs font-medium text-zinc-600">Demi-finales (1er A – 2e B, 1er B – 2e A)</h3>
          <ul>
            {vue.demis.map((d) =>
              d.match && d.match.etat !== 'a_jouer' ? (
                <LigneMatch key={d.position} m={{ ...d.match, player1Id: d.player1Id, player2Id: d.player2Id }} noms={noms} />
              ) : (
                <li key={d.position} className="py-1 text-sm">
                  {joueurOuEtiquette(d.player1Id, d.etiquettes[0], d.deduit)} <span className="text-zinc-400">–</span>{' '}
                  {joueurOuEtiquette(d.player2Id, d.etiquettes[1], d.deduit)}
                </li>
              ),
            )}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-medium text-zinc-600">Finale</h3>
          {vue.finale.match && vue.finale.match.etat !== 'a_jouer' ? (
            <ul>
              <LigneMatch m={{ ...vue.finale.match, player1Id: vue.finale.player1Id, player2Id: vue.finale.player2Id }} noms={noms} />
            </ul>
          ) : (
            <p className="py-1 text-sm">
              {joueurOuEtiquette(vue.finale.player1Id, vue.finale.etiquettes[0], false)} <span className="text-zinc-400">–</span>{' '}
              {joueurOuEtiquette(vue.finale.player2Id, vue.finale.etiquettes[1], false)}
            </p>
          )}
        </div>
        {vue.championId && <p className="text-sm font-semibold">Championne : {noms.get(vue.championId) ?? vue.championId}</p>}
      </section>

      <p className={noteInfo}>
        Les picks et le pronostic des Masters (classer les poules, vainqueurs des demies, championne) ne sont pas encore disponibles dans l&apos;app :
        le tableau à élimination directe, le plan et le Fantasy ne s&apos;appliquent pas à ce format.
      </p>
    </div>
  );
}
