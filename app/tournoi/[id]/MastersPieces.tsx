import { badgeNeutre, carte, noteInfo } from '@/app/ui';
import { libelleTourMasters } from '@/lib/masters';
import type { LignePhaseFinale, PastillePoule, VerdictMasters } from '@/lib/mastersPronosticVue';
import type { MatchVue, PouleVue, VueMasters } from '@/lib/mastersVue';
import { initiale } from '@/lib/tableauVue';

/**
 * Morceaux d'affichage d'un tournoi au format Masters (poules, matchs, phase finale), partagés par les
 * onglets Dashboard et Tableau. Règles et calculs : lib/masters.ts, lib/mastersVue.ts.
 */

export type Noms = Map<string, string>;

/** Score du point de vue du joueur 1 : « 6-4 3-6 7-5 », « w/o », « 6-4 2-1 ab. ». */
function score(m: MatchVue): string {
  if (m.speciale === 'forfait') return 'w/o';
  const sets = m.sets.map((s) => `${s.g1}-${s.g2}`).join(' ');
  return m.speciale === 'abandon' ? `${sets} ab.`.trim() : sets;
}

export function LigneMatch({ m, noms }: { m: MatchVue; noms: Noms }) {
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

/** Libellé d'un verdict : jamais la couleur seule. */
const LIBELLE_VERDICT: Record<VerdictMasters, string> = {
  juste: 'juste',
  partiel: 'qualifiée trouvée, mauvaise place',
  rate: 'raté',
  attente: 'en attente',
};

const STYLE_PASTILLE: Record<VerdictMasters, string> = {
  juste: 'bg-emerald-600 text-white',
  partiel: 'bg-amber-200 text-amber-950 ring-1 ring-amber-600',
  rate: 'bg-red-600 text-white',
  attente: 'bg-zinc-200 text-zinc-700',
};

/** Pastille d'un participant sur une joueuse de poule : sa lettre + la place qu'il lui a prévue. */
function PastillePronostic({ p }: { p: PastillePoule }) {
  return (
    <span
      title={`${p.nom} : ${p.rang}${p.rang === 1 ? 're' : 'e'} (${LIBELLE_VERDICT[p.verdict]})`}
      className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center gap-px rounded-full px-1 text-[0.65rem] font-bold leading-none ${STYLE_PASTILLE[p.verdict]}`}
    >
      {initiale(p.nom)}
      <span className="tabular-nums">{p.rang}</span>
      <span className="sr-only">{` : ${p.nom} la voit ${p.rang}${p.rang === 1 ? 're' : 'e'} (${LIBELLE_VERDICT[p.verdict]})`}</span>
    </span>
  );
}

const STYLE_CHOIX: Record<VerdictMasters, string> = {
  juste: 'bg-emerald-100 text-emerald-900',
  partiel: 'bg-amber-100 text-amber-900',
  rate: 'bg-red-100 text-red-900 line-through',
  attente: 'bg-zinc-100 text-zinc-800',
};

const MARQUE_VERDICT: Record<VerdictMasters, string> = { juste: '✓', partiel: '~', rate: '✗', attente: '' };

function Choix({ id, verdict, noms }: { id: string; verdict: VerdictMasters; noms: Noms }) {
  return (
    <span className={`inline-flex items-baseline gap-1 rounded-lg px-1.5 py-0.5 text-sm ${STYLE_CHOIX[verdict]}`}>
      {noms.get(id) ?? id}
      {MARQUE_VERDICT[verdict] && <span aria-hidden="true">{MARQUE_VERDICT[verdict]}</span>}
      <span className="sr-only">{` (${LIBELLE_VERDICT[verdict]})`}</span>
    </span>
  );
}

export function CartePoule({ p, noms, pastilles }: { p: PouleVue; noms: Noms; pastilles?: Map<string, PastillePoule[]> }) {
  const qualifies = new Set(p.qualifies ?? []);
  // Avant le premier match, tout le monde est à égalité : pas de rang à afficher.
  const commence = p.classement.some((l) => l.joues > 0);
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
              <td className="py-1.5 text-zinc-500">{commence ? `${l.egalite ? '=' : ''}${l.rang}` : '–'}</td>
              <td className="py-1.5">
                <span className={qualifies.has(l.playerId) ? 'font-semibold text-zinc-900' : 'text-zinc-800'}>{noms.get(l.playerId) ?? l.playerId}</span>
                {qualifies.has(l.playerId) && <span className={`${badgeNeutre} ml-1.5`}>demi</span>}
                {(pastilles?.get(l.playerId) ?? []).length > 0 && (
                  <span className="ml-1.5 inline-flex flex-wrap items-center gap-1 align-middle" data-testid="pastilles-poule">
                    {(pastilles?.get(l.playerId) ?? []).map((x) => (
                      <PastillePronostic key={x.cle} p={x} />
                    ))}
                  </span>
                )}
              </td>
              <td className="py-1.5 text-right font-mono text-xs">{l.victoires}-{l.defaites}</td>
              <td className="py-1.5 text-right font-mono text-xs text-zinc-600">{l.setsGagnes}-{l.setsPerdus}</td>
              <td className="py-1.5 text-right font-mono text-xs text-zinc-600">{l.jeuxGagnes}-{l.jeuxPerdus}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {commence && p.classement.some((l) => l.egalite) && (
        <p className={noteInfo}>
          Rang partagé (=) : égalité à ce stade, pas (encore) départagée par les règles (victoires, confrontation directe, puis sets et jeux).
        </p>
      )}

      {p.journees.map((j) => (
        <div key={j.round}>
          <h3 className="text-xs font-medium text-soustitre">{libelleTourMasters(j.round)}</h3>
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

/** Pronostics de chacun pour la phase finale : finalistes et championne, colorés selon le résultat. */
function PronosticsPhaseFinale({ lignes, noms }: { lignes: LignePhaseFinale[]; noms: Noms }) {
  return (
    <div className="space-y-1.5 border-t border-zinc-100 pt-3" data-testid="pronostics-phase-finale">
      <h3 className="text-xs font-medium text-soustitre">Pronostics</h3>
      <ul className="space-y-1.5">
        {lignes.map((l) => (
          <li key={l.cle} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <span className="w-14 shrink-0 font-medium">{l.nom}</span>
            <span className="text-xs text-zinc-500">Finalistes</span>
            {l.finalistes.map((f) => (
              <Choix key={f.joueurId} id={f.joueurId} verdict={f.verdict} noms={noms} />
            ))}
            <span className="text-xs text-zinc-500">Championne</span>
            <Choix id={l.champion.joueurId} verdict={l.champion.verdict} noms={noms} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Légende des couleurs du pronostic, sous les poules et la phase finale. */
export function LegendePronostics() {
  return (
    <p className={noteInfo} data-testid="legende-pronostics">
      Pastille sur une joueuse de poule = la place que chaque participant lui a prévue (M = Moi, L = Laki, T = Thomas, suivi de la place) : vert = place exacte, ambre =
      qualifiée trouvée mais pas à cette place, rouge = raté, gris = poule pas finie. Phase finale : ✓ juste, ✗ raté, sans signe = pas encore joué.
    </p>
  );
}

export function PhaseFinale({ vue, noms, pronostics }: { vue: VueMasters; noms: Noms; pronostics?: LignePhaseFinale[] }) {
  const joueurOuEtiquette = (jId: string | null, etiquette: string) =>
    jId ? <span className="text-zinc-900">{noms.get(jId) ?? jId}</span> : <span className="text-zinc-500">{etiquette}</span>;

  return (
    <section className={`${carte} space-y-3 p-4`}>
      <h2 className="text-base font-semibold">Phase finale</h2>
      <div>
        <h3 className="text-xs font-medium text-soustitre">Demi-finales (1er A – 2e B, 1er B – 2e A)</h3>
        <ul>
          {vue.demis.map((d) =>
            d.match && d.match.etat !== 'a_jouer' ? (
              <LigneMatch key={d.position} m={{ ...d.match, player1Id: d.player1Id, player2Id: d.player2Id }} noms={noms} />
            ) : (
              <li key={d.position} className="py-1 text-sm">
                {joueurOuEtiquette(d.player1Id, d.etiquettes[0])} <span className="text-zinc-400">–</span>{' '}
                {joueurOuEtiquette(d.player2Id, d.etiquettes[1])}
              </li>
            ),
          )}
        </ul>
      </div>
      <div>
        <h3 className="text-xs font-medium text-soustitre">Finale</h3>
        {vue.finale.match && vue.finale.match.etat !== 'a_jouer' ? (
          <ul>
            <LigneMatch m={{ ...vue.finale.match, player1Id: vue.finale.player1Id, player2Id: vue.finale.player2Id }} noms={noms} />
          </ul>
        ) : (
          <p className="py-1 text-sm">
            {joueurOuEtiquette(vue.finale.player1Id, vue.finale.etiquettes[0])} <span className="text-zinc-400">–</span>{' '}
            {joueurOuEtiquette(vue.finale.player2Id, vue.finale.etiquettes[1])}
          </p>
        )}
      </div>
      {vue.championId && <p className="text-sm font-semibold">Championne : {noms.get(vue.championId) ?? vue.championId}</p>}
      {pronostics && pronostics.length > 0 && <PronosticsPhaseFinale lignes={pronostics} noms={noms} />}
    </section>
  );
}
