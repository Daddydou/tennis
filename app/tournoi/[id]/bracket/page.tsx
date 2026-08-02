import Link from 'next/link';
import { notFound } from 'next/navigation';
import TournoiNav from '../TournoiNav';
import BadgeSourceElo, { classeElo } from '../BadgeSourceElo';
import { loadEngineData, surfacePourElo } from '@/supabase/queries';
import { eloEffectifResolu, type ElosResolus } from '@/supabase/elo';
import {
  construireBracket,
  duelsDuTour,
  type CritereJoueur,
  type DuelBracket,
} from '@/lib/bracket';

export const dynamic = 'force-dynamic';

const SURFACE_LABEL: Record<string, string> = {
  hard: 'dur',
  clay: 'terre battue',
  grass: 'gazon',
};

/** Au-delà de ce nombre de duels, le tour se filtre par moitié de tableau. */
const SEUIL_FILTRE_MOITIE = 4;

type Moitie = 'top' | 'bottom';

interface VueJoueur {
  id: string;
  nom: string;
  rang: number | null;
  pays: string | null;
  elo: number | null;
  source: ElosResolus['source'];
  taName: string | null;
  candidats: string[];
}

/**
 * Une ligne de joueur dans un duel.
 *
 * Le vainqueur prédit est en gras ; le champion porte en plus sa couronne,
 * partout où il apparaît — c'est ce qui permet de suivre son parcours en
 * faisant défiler les tours.
 */
function LigneJoueur({
  j,
  gagnant,
  champion,
  bye,
}: {
  j: VueJoueur | null;
  gagnant: boolean;
  champion: boolean;
  bye: boolean;
}) {
  if (!j) {
    return (
      <div className="flex items-center gap-2 py-1 text-sm text-zinc-300 dark:text-zinc-700">
        <span className="w-4" />
        <span className="flex-1">—</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-1">
      <span
        className={`w-4 shrink-0 text-center text-xs ${
          gagnant ? 'text-emerald-600 dark:text-emerald-400' : 'text-transparent'
        }`}
        aria-hidden
      >
        {gagnant ? '▸' : '·'}
      </span>

      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span
          className={`truncate ${
            gagnant ? 'font-semibold' : 'text-zinc-600 dark:text-zinc-400'
          }`}
        >
          {j.nom}
        </span>
        {champion && (
          <span
            className="shrink-0 rounded border border-amber-400 bg-amber-50 px-1 text-[10px] font-medium text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
            title="Champion prédit"
          >
            titre
          </span>
        )}
        {j.rang !== null && (
          <span className="shrink-0 text-[11px] text-zinc-400">n°{j.rang}</span>
        )}
        {bye && (
          <span className="shrink-0 text-[11px] uppercase tracking-wide text-sky-600 dark:text-sky-400">
            bye
          </span>
        )}
      </span>

      <span
        className={`shrink-0 font-mono text-xs tabular-nums ${classeElo(j.source)}`}
        title="Elo effectif sur la surface du tournoi (mélange 60/40)"
      >
        {j.elo === null ? '—' : Math.round(j.elo)}
      </span>
      <BadgeSourceElo source={j.source} taName={j.taName} candidats={j.candidats} />
    </div>
  );
}

/** Un duel : deux joueurs, le vainqueur prédit, l'écart d'Elo qui l'a décidé. */
function CarteDuel({
  duel,
  vue,
  champion,
}: {
  duel: DuelBracket;
  vue: (id: string | null) => VueJoueur | null;
  champion: string | null;
}) {
  const a = vue(duel.a);
  const b = vue(duel.b);
  const ecart =
    a?.elo != null && b?.elo != null ? Math.abs(a.elo - b.elo) : null;

  return (
    <div className="rounded border border-zinc-200 px-2.5 py-1.5 dark:border-zinc-800">
      <LigneJoueur
        j={a}
        gagnant={duel.gagnant !== null && duel.gagnant === duel.a}
        champion={champion !== null && duel.a === champion}
        bye={duel.bye && duel.a !== null}
      />
      <div className="border-t border-zinc-100 dark:border-zinc-900" />
      <LigneJoueur
        j={b}
        gagnant={duel.gagnant !== null && duel.gagnant === duel.b}
        champion={champion !== null && duel.b === champion}
        bye={duel.bye && duel.b !== null}
      />
      {ecart !== null && (
        <div className="pt-0.5 text-right text-[10px] text-zinc-400">
          écart {Math.round(ecart)} pts
        </div>
      )}
    </div>
  );
}

export default async function BracketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ round?: string; moitie?: string }>;
}) {
  const { id } = await params;
  const { round: roundParam, moitie: moitieParam } = await searchParams;

  const engine = await loadEngineData(id);
  if (!engine) notFound();
  const { tournament, matches, players, elos } = engine;
  const rounds = tournament.rounds ?? [];

  const surfElo = surfacePourElo(tournament.surface);

  // Elo effectif : exactement celui qu'affiche l'écran Picks et qu'utilise la
  // simulation — mélange 60/40 surface/général (cf. supabase/elo.ts).
  const critere = (pid: string): CritereJoueur => {
    const e = elos[pid] as ElosResolus | undefined;
    return {
      elo: e ? eloEffectifResolu(e, surfElo) : 0,
      rang: players[pid]?.rank ?? null,
    };
  };

  // `matches` porte le vainqueur réel et les scores ; on ne transmet que le
  // tirage — identité des joueurs et place dans le tableau. Le pronostic ne
  // peut donc pas, même par accident, se laisser corriger par les résultats.
  const bracket = construireBracket(
    matches.map((m) => ({
      round: m.round,
      position: m.position,
      players: m.players.map((p) => ({ id: p.id, isBye: p.isBye })),
    })),
    rounds,
    critere,
  );

  const vue = (pid: string | null): VueJoueur | null => {
    if (!pid) return null;
    const p = players[pid];
    const e = elos[pid] as ElosResolus | undefined;
    return {
      id: pid,
      nom: p?.name ?? pid,
      rang: p?.rank ?? null,
      pays: p?.country ?? null,
      elo: e ? eloEffectifResolu(e, surfElo) : null,
      source: e?.source ?? 'defaut',
      taName: e?.taName ?? null,
      candidats: (e?.candidats ?? []).map(
        (c) => `${c.nom} (${c.slug}${c.elo != null ? `, Elo ${Math.round(c.elo)}` : ''})`,
      ),
    };
  };

  if (bracket.rounds.length === 0) {
    return (
      <div className="space-y-5">
        <TournoiNav id={id} nom={tournament.name} active="bracket" />
        <p className="text-sm text-zinc-500">
          Aucun tirage exploitable : le premier tour de ce tournoi n&apos;est pas
          importé.
        </p>
      </div>
    );
  }

  const roundActif =
    roundParam && bracket.rounds.includes(roundParam) ? roundParam : bracket.rounds[0];
  const duels = duelsDuTour(bracket, roundActif);

  // Le filtre par moitié n'a de sens que sur un tour assez large : à partir des
  // demi-finales, les deux moitiés se rejoignent.
  const filtrable = duels.length > SEUIL_FILTRE_MOITIE;
  const moitieActive: Moitie | null =
    filtrable && (moitieParam === 'top' || moitieParam === 'bottom')
      ? moitieParam
      : null;
  const duelsAffiches = moitieActive
    ? duels.filter((d) => d.moitie === moitieActive)
    : duels;

  const champion = bracket.champion;
  const vueChampion = vue(champion);
  const lien = (r: string, m: Moitie | null) =>
    `/tournoi/${id}/bracket?round=${r}${m ? `&moitie=${m}` : ''}`;

  return (
    <div className="space-y-4">
      <TournoiNav id={id} nom={tournament.name} active="bracket" />

      <p className="text-sm text-zinc-500">
        Pronostic <span className="font-medium text-zinc-700 dark:text-zinc-300">
          depuis le tirage
        </span>{' '}
        : à chaque match, le plus haut Elo effectif sur{' '}
        {SURFACE_LABEL[surfElo] ?? surfElo} l&apos;emporte. Aucun résultat réel
        n&apos;est lu — l&apos;arbre est le même avant, pendant et après le
        tournoi.
      </p>

      {/* ── Champion prédit et son parcours ── */}
      {vueChampion && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Champion prédit
            </span>
            <span className="text-base font-semibold">{vueChampion.nom}</span>
            {vueChampion.rang !== null && (
              <span className="text-xs text-zinc-500">n°{vueChampion.rang}</span>
            )}
            <span
              className={`font-mono text-xs tabular-nums ${classeElo(vueChampion.source)}`}
            >
              Elo {vueChampion.elo === null ? '—' : Math.round(vueChampion.elo)}
            </span>
          </div>

          <ul className="mt-2 space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
            {bracket.parcours.map((d) => {
              const adverse = d.a === champion ? d.b : d.a;
              const adv = vue(adverse);
              return (
                <li key={d.round} className="flex gap-2">
                  <Link
                    href={lien(d.round, null)}
                    className="w-12 shrink-0 font-medium text-zinc-500 underline-offset-2 hover:underline"
                  >
                    {d.round}
                  </Link>
                  <span className="min-w-0 flex-1 truncate">
                    {d.bye || !adv ? (
                      <span className="text-sky-600 dark:text-sky-400">
                        exempté
                      </span>
                    ) : (
                      <>
                        bat {adv.nom}
                        {adv.elo !== null && (
                          <span className="ml-1 text-zinc-400 tabular-nums">
                            ({Math.round(adv.elo)})
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── Sélecteur de tour : la navigation principale sur mobile ── */}
      <nav className="flex flex-wrap gap-1">
        {bracket.rounds.map((r) => {
          const actif = r === roundActif;
          return (
            <Link
              key={r}
              href={lien(r, null)}
              className={`rounded border px-2.5 py-1 text-xs font-medium ${
                actif
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
              }`}
            >
              {r}
            </Link>
          );
        })}
      </nav>

      {/* ── Filtre par moitié de tableau, sur les tours larges ── */}
      {filtrable && (
        <nav className="flex flex-wrap items-center gap-1 text-xs">
          <span className="mr-1 text-zinc-400">Moitié :</span>
          {(
            [
              [null, 'Tout'],
              ['top', 'Haute'],
              ['bottom', 'Basse'],
            ] as const
          ).map(([m, label]) => {
            const actif = moitieActive === m;
            return (
              <Link
                key={label}
                href={lien(roundActif, m)}
                className={`rounded px-2 py-0.5 ${
                  actif
                    ? 'bg-zinc-200 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                {label}
              </Link>
            );
          })}
          <span className="ml-auto text-zinc-400">
            {duelsAffiches.length} sur {duels.length}
          </span>
        </nav>
      )}

      {/* ── Duels du tour : liste verticale, lisible sur un téléphone ── */}
      <div className="space-y-1.5">
        {duelsAffiches.map((d) => (
          <CarteDuel
            key={`${d.round}-${d.position}`}
            duel={d}
            vue={vue}
            champion={champion}
          />
        ))}
      </div>

      <p className="text-xs text-zinc-400">
        Le rang affiché est le classement publié par Tennis Abstract : la tête de
        série n&apos;est pas conservée par le schéma. Les Elo suivent le même
        code couleur que l&apos;écran Picks — une valeur signalée «&nbsp;défaut&nbsp;»
        ou «&nbsp;ambigu&nbsp;» rend le pronostic de ce match peu fiable.
      </p>
    </div>
  );
}
