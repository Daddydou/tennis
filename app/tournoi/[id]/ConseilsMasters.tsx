import { badgeNeutre, carte, noteInfo } from '@/app/ui';
import type { ConseilsMasters } from '@/db/mastersConseils';
import { libelleTourMasters, MAX_PRONOSTIC } from '@/lib/masters';
import type { PickConseille } from '@/lib/mastersConseils';

/**
 * Propositions pour un Masters : le pronostic qui rapporte le plus (classer les poules, vainqueurs des
 * demies, championne) et les picks de chaque tour (lib/mastersConseils.ts). Calculées sur l'Elo du jour
 * et les résultats déjà joués : elles bougent à chaque match.
 */

type Noms = Map<string, string>;

const pct = (x: number) => `${Math.round(x * 100)} %`;
const pts = (x: number) => x.toFixed(1).replace('.', ',');

function ClassementPropose({ titre, ordre, noms, sim }: { titre: string; ordre: string[]; noms: Noms; sim: ConseilsMasters['sim'] }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-zinc-600">{titre}</h3>
      <ol className="mt-1 space-y-0.5 text-sm">
        {ordre.map((id, i) => (
          <li key={id} className="flex flex-wrap items-baseline gap-x-2">
            <span className="w-4 text-zinc-500">{i + 1}.</span>
            <span className={i < 2 ? 'font-semibold text-zinc-900' : 'text-zinc-800'}>{noms.get(id) ?? id}</span>
            <span className="text-xs text-zinc-500">
              {pct(sim.rang[id]?.[i] ?? 0)} à cette place · {pct(sim.top2[id] ?? 0)} qualifiée
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CellulePick({ p, noms }: { p: PickConseille | undefined; noms: Noms }) {
  if (!p) return <span className="text-zinc-400">—</span>;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="font-semibold text-zinc-900">{noms.get(p.playerId) ?? p.playerId}</span>
        <span className="font-mono text-xs text-zinc-600">{pts(p.ep)} pts</span>
        {p.fixe && <span className={badgeNeutre}>déjà posé</span>}
      </div>
      {p.alternatives.length > 0 && (
        <div className="text-xs text-zinc-500">
          ou {p.alternatives.map((a) => `${noms.get(a.playerId) ?? a.playerId} (${pts(a.ep)})`).join(', ')}
        </div>
      )}
    </div>
  );
}

export default function ConseilsMastersCarte({ conseils, noms }: { conseils: ConseilsMasters; noms: Noms }) {
  const { pronostic, picks, sim } = conseils;
  const p = pronostic.pronostic;
  const e = pronostic.esperance;
  const nom = (id: string) => noms.get(id) ?? id;
  const pick = (round: string, half: 'top' | 'bottom' | null) => picks.find((x) => x.round === round && x.half === half);

  return (
    <div className="space-y-4" data-testid="conseils-masters">
      <section className={`${carte} space-y-3 p-4`}>
        <header className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="text-base font-semibold">Pronostic proposé</h2>
          <span className="text-xs text-zinc-600">
            {conseils.pronosticFerme ? 'Fermé : le premier match est lancé' : `${pts(e.total)} pts espérés sur ${MAX_PRONOSTIC}`}
          </span>
        </header>
        {conseils.pronosticFerme ? (
          <p className={noteInfo}>Le pronostic ferme au premier match du tournoi : il n&apos;est plus modifiable.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <ClassementPropose titre="Poule A, du 1er au 4e" ordre={p.classementA} noms={noms} sim={sim} />
              <ClassementPropose titre="Poule B, du 1er au 4e" ordre={p.classementB} noms={noms} sim={sim} />
            </div>
            <div className="space-y-0.5 text-sm">
              <p>
                <span className="text-zinc-600">Demie 1 ({nom(p.classementA[0])} – {nom(p.classementB[1])}) :</span>{' '}
                <span className="font-semibold">{nom(p.vainqueursDemis[0])}</span>{' '}
                <span className="text-xs text-zinc-500">({pct(sim.finaliste[p.vainqueursDemis[0]] ?? 0)} d&apos;être finaliste)</span>
              </p>
              <p>
                <span className="text-zinc-600">Demie 2 ({nom(p.classementB[0])} – {nom(p.classementA[1])}) :</span>{' '}
                <span className="font-semibold">{nom(p.vainqueursDemis[1])}</span>{' '}
                <span className="text-xs text-zinc-500">({pct(sim.finaliste[p.vainqueursDemis[1]] ?? 0)} d&apos;être finaliste)</span>
              </p>
              <p>
                <span className="text-zinc-600">Championne :</span> <span className="font-semibold">{nom(p.champion)}</span>{' '}
                <span className="text-xs text-zinc-500">({pct(sim.champion[p.champion] ?? 0)})</span>
              </p>
            </div>
            <p className="text-xs text-zinc-600">
              Par barème : qualifiées {pts(e.qualifies)} + places exactes {pts(e.places)} + finalistes {pts(e.finalistes)} + championne{' '}
              {pts(e.champion)}. À saisir chez Thomas avant le premier match.
            </p>
          </>
        )}
      </section>

      <section className={`${carte} space-y-3 p-4`}>
        <header className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="text-base font-semibold">Picks proposés</h2>
          <span className="text-xs text-zinc-600">points espérés par pick</span>
        </header>
        <div className="space-y-3">
          {(['J1', 'J2', 'J3'] as const).map((j) => (
            <div key={j} className="grid gap-x-4 gap-y-2 sm:grid-cols-[7rem_1fr_1fr]">
              <h3 className="text-xs font-medium text-zinc-600 sm:pt-0.5">{libelleTourMasters(j)}</h3>
              <div className="text-sm">
                <div className="text-xs text-zinc-500">Poule A</div>
                <CellulePick p={pick(j, 'top')} noms={noms} />
              </div>
              <div className="text-sm">
                <div className="text-xs text-zinc-500">Poule B</div>
                <CellulePick p={pick(j, 'bottom')} noms={noms} />
              </div>
            </div>
          ))}
          {(['SF', 'F'] as const).map((r) => (
            <div key={r} className="grid gap-x-4 gap-y-2 sm:grid-cols-[7rem_1fr]">
              <h3 className="text-xs font-medium text-zinc-600 sm:pt-0.5">{libelleTourMasters(r)}</h3>
              <div className="text-sm">
                <CellulePick p={pick(r, null)} noms={noms} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-zinc-600">
          Un joueur ne se pique qu&apos;une fois par phase : trois joueuses différentes par poule sur les trois journées, puis, en phase finale, deux
          différentes (demie et finale). Le plan optimise les trois journées ENSEMBLE : une joueuse forte n&apos;est utilisée qu&apos;une fois, là où
          elle rapporte le plus de points par rapport à ses remplaçantes (d&apos;où parfois un autre nom en journée 1 que la plus forte de la poule). Il
          est recalculé après chaque résultat ; pour les journées 2 et 3, les adversaires se déduisent de la journée 1 (les vainqueurs se
          rencontrent, les perdantes aussi).
        </p>
      </section>

      {conseils.eloIncertain.length > 0 && (
        <p className={noteInfo}>Elo non trouvé pour {conseils.eloIncertain.map(nom).join(', ')} : valeur par défaut du circuit, propositions moins fiables.</p>
      )}
    </div>
  );
}
