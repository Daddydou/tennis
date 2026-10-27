import Link from 'next/link';
import NoteCotesUtilisees from '../NoteCotesUtilisees';
import BadgeSourceElo, { classeElo } from '../BadgeSourceElo';
import { surfacePourElo, type loadEngineData } from '@/db/queries';
import { eloEffectifResolu, type ElosResolus } from '@/db/elo';
import type { chargerBlendProduction } from '@/db/cotesBlend';
import {
  construireBracket,
  duelsDuTour,
  type CritereJoueur,
  type DuelBracket,
} from '@/lib/bracket';
import { badge, badgeNeutre, carte, filtreSecondaire, pilleSelecteur } from '@/app/ui';

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
      <div className="flex items-center gap-2 py-1 text-sm text-zinc-300">
        <span className="w-4" />
        <span className="flex-1">—</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-1">
      <span
        className={`w-4 shrink-0 text-center text-xs ${
          gagnant ? 'text-emerald-700' : 'text-transparent'
        }`}
        aria-hidden
      >
        {gagnant ? '▸' : '·'}
      </span>

      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span
          className={`truncate ${
            gagnant ? 'font-semibold' : 'text-zinc-600'
          }`}
        >
          {j.nom}
        </span>
        {champion && (
          <span
            className={`${badge} bg-zinc-800 text-white`}
            title="Champion prédit"
          >
            titre
          </span>
        )}
        {j.rang !== null && (
          <span className="shrink-0 text-xs tabular-nums text-zinc-500">n°{j.rang}</span>
        )}
        {bye && (
          <span className={badgeNeutre}>bye</span>
        )}
      </span>

      <span
        className={`shrink-0 font-mono text-xs tabular-nums ${classeElo(j.source)}`}
        title="Elo effectif sur la surface du tournoi (mélange 60/40)"
      >
        {j.elo === null ? '—' : Math.round(j.elo)}
      </span>
      <BadgeSourceElo source={j.source} taName={j.taName} candidats={j.candidats} nom={j.nom} />
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
    <div className={`px-2.5 py-1.5 ${carte}`}>
      <LigneJoueur
        j={a}
        gagnant={duel.gagnant !== null && duel.gagnant === duel.a}
        champion={champion !== null && duel.a === champion}
        bye={duel.bye && duel.a !== null}
      />
      <div className="border-t border-zinc-100" />
      <LigneJoueur
        j={b}
        gagnant={duel.gagnant !== null && duel.gagnant === duel.b}
        champion={champion !== null && duel.b === champion}
        bye={duel.bye && duel.b !== null}
      />
      {(ecart !== null || duel.coteUtilisee) && (
        <div className="flex items-center justify-end gap-1.5 pt-0.5 text-right text-xs text-zinc-500">
          {duel.coteUtilisee && (
            <span
              className={badgeNeutre}
              title="Le vainqueur prédit tient compte d'une cote du marché (30 % Elo / 70 % cotes), capturée avant le coup d'envoi."
            >
              cote
            </span>
          )}
          {ecart !== null && <span>écart {Math.round(ecart)} pts</span>}
        </div>
      )}
    </div>
  );
}

/**
 * Vue « Tableau pronostiqué » de l'onglet Prédictions — l'ancien onglet
 * Bracket, fusionné ici : « Bracket » désigne désormais le jeu (cf.
 * TournoiNav). La page appelante charge le moteur et le blend, et porte la nav.
 */
export default function TableauPronostique({
  id,
  engine,
  blend,
  roundParam,
  moitieParam,
}: {
  id: string;
  engine: NonNullable<Awaited<ReturnType<typeof loadEngineData>>>;
  blend: Awaited<ReturnType<typeof chargerBlendProduction>>;
  roundParam?: string;
  moitieParam?: string;
}) {
  const { tournament, matches, players, elos } = engine;
  const rounds = tournament.rounds ?? [];

  const surfElo = surfacePourElo(tournament.surface);

  // Elo effectif : exactement celui qu'affiche l'écran Picks et qu'utilise la
  // simulation — mélange 60/40 surface/général (cf. db/elo.ts).
  const critere = (pid: string): CritereJoueur => {
    const e = elos[pid] as ElosResolus | undefined;
    return {
      elo: e ? eloEffectifResolu(e, surfElo) : 0,
      rang: players[pid]?.rank ?? null,
    };
  };

  // Blend Elo/cotes (cf. db/cotesBlend.ts) : Elo seul par défaut,
  // mélangé au marché sur chaque duel pour lequel une cote utilisable existe.
  const { probabiliteMatch, coteUtilisables, coteDisponiblePour } = blend;

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
    probabiliteMatch,
    coteDisponiblePour,
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
    `/tournoi/${id}/predictions?vue=tableau&round=${r}${m ? `&moitie=${m}` : ''}`;

  return (
    <div className="space-y-4">
      {/* ── Champion prédit et son parcours : carte blanche, comme les autres.
          L'ambre est réservé aux avertissements (DESIGN.md). ── */}
      {vueChampion && (
        <section className={`${carte} p-4`}>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="text-base font-semibold">
              Champion prédit : {vueChampion.nom}
            </h2>
            {vueChampion.rang !== null && (
              <span className="text-xs text-zinc-500">n°{vueChampion.rang}</span>
            )}
            <span
              className={`font-mono text-xs tabular-nums ${classeElo(vueChampion.source)}`}
            >
              Elo {vueChampion.elo === null ? '—' : Math.round(vueChampion.elo)}
            </span>
          </div>

          <ul className="mt-2 space-y-0.5 text-xs text-zinc-600">
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
                      <span className="text-zinc-500">exempté</span>
                    ) : (
                      <>
                        bat {adv.nom}
                        {adv.elo !== null && (
                          <span className="ml-1 text-zinc-500 tabular-nums">
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
        </section>
      )}

      {/* ── Sélecteur de tour : la navigation principale sur mobile ── */}
      <nav className="flex flex-wrap gap-1.5">
        {bracket.rounds.map((r) => {
          const actif = r === roundActif;
          return (
            <Link key={r} href={lien(r, null)} className={pilleSelecteur(actif)}>
              {r}
            </Link>
          );
        })}
      </nav>

      {/* ── Filtre par moitié de tableau, sur les tours larges ── */}
      {filtrable && (
        <nav aria-label="Moitié du tableau" className="flex flex-wrap items-center gap-1 text-sm">
          <span className="mr-1 text-zinc-600">Moitié :</span>
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
                aria-current={actif ? 'true' : undefined}
                className={filtreSecondaire(actif)}
              >
                {label}
              </Link>
            );
          })}
          <span className="ml-auto text-xs text-zinc-600">
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

      {/* Méthode et sources, sous les duels (même place que sur Picks). */}
      <section className="space-y-2">
        <details className={`${carte} px-4 py-2 text-xs`}>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-zinc-700">
            Comment lire ce tableau pronostiqué
          </summary>
          <div className="space-y-2 pb-2 leading-relaxed text-zinc-700">
            <p>
              Pronostic <strong>depuis le tirage</strong> : à chaque match, le
              plus haut Elo effectif sur {SURFACE_LABEL[surfElo] ?? surfElo}{' '}
              l&apos;emporte, ou le favori du marché quand une cote utilisable
              existe pour ce duel précis (badge{' '}
              <span className={badgeNeutre}>cote</span>). Aucun résultat réel
              n&apos;est lu : l&apos;arbre est le même avant, pendant et après le
              tournoi.
            </p>
            <p>
              Le rang affiché est le classement publié par Tennis Abstract : la
              tête de série n&apos;est pas conservée. Les Elo suivent le même
              code couleur que l&apos;écran Picks : une valeur signalée
              «&nbsp;défaut&nbsp;» ou «&nbsp;ambigu&nbsp;» rend le pronostic de ce
              match peu fiable.
            </p>
          </div>
        </details>
        <NoteCotesUtilisees n={coteUtilisables} />
      </section>
    </div>
  );
}
