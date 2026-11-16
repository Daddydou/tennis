import Link from 'next/link';
import type { TournamentRow } from '@/db/queries';
import FondTournoi from './FondTournoi';
import { ligneSaison, positionDansAnnee, semaineIso } from './ligneSaison';
import { categorie, formatDate, SURFACE_LABEL, type PicksAPoserCarte } from './tournoisUi';

/**
 * SCÈNE D'OUVERTURE DE L'ACCUEIL — façon écran d'entrée du guide Dark.
 *
 * Plein écran sur le court dessiné du tournoi vedette : son nom en grandes
 * capitales fines, une phrase qui dit où j'en suis (le chiffre entouré d'un
 * trait, comme les mots-clés du guide), « Continuer » vers l'écran utile, et
 * la saison sur une ligne fine en bas, chaque tournoi un point.
 */
export default function SceneAccueil({
  tournois,
  vedette,
  etat,
  aPoser,
  aujourdHui,
}: {
  tournois: TournamentRow[];
  vedette: TournamentRow | null;
  etat: 'en-cours' | 'bientot' | 'passe';
  aPoser: PicksAPoserCarte | null;
  aujourdHui: string;
}) {
  const annee = Number(aujourdHui.slice(0, 4));
  const points = ligneSaison(tournois, annee, vedette?.id ?? null);
  const xAujourdhui = positionDansAnnee(aujourdHui);
  const meta = vedette
    ? [vedette.tour, categorie(vedette), vedette.surface ? (SURFACE_LABEL[vedette.surface] ?? vedette.surface) : null]
        .filter((x) => x && x !== '—')
        .join(' · ')
    : '';
  const suite = vedette ? (etat === 'en-cours' ? `/tournoi/${vedette.id}/picks` : `/tournoi/${vedette.id}`) : '/import';
  // Chorégraphie de l'ouverture : chaque élément attend l'écran d'ouverture
  // (`--intro`, 0 s s'il a déjà été vu, cf. globals.css) puis son tour.
  const apres = (ms: number) => ({ animationDelay: `calc(var(--intro, 0s) + ${ms}ms)` });

  return (
    <section
      aria-label="Ouverture"
      data-scene
      className="pleine-largeur relative -mt-[5.25rem] flex h-[min(82vh,48rem)] min-h-[34rem] flex-col overflow-hidden"
    >
      {/* La photo du lieu (ou, à défaut, le court dessiné en bas de la scène). */}
      <FondTournoi
        nom={vedette?.name ?? ''}
        surface={vedette?.surface}
        debut={vedette?.start_date}
        variante="scene"
        delai="var(--intro, 0s)"
      />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_45%,transparent_40%,rgba(0,0,0,.85)_100%)]" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-background via-background/70 to-transparent" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 h-40 bg-linear-to-b from-background/80 to-transparent" aria-hidden="true" />

      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-start gap-5 px-6 pt-[max(6rem,14vh)] text-center">
        <p className="titre-espace animate-fondu text-[0.7rem] text-zinc-700" style={apres(150)}>
          Saison {annee} · semaine {semaineIso(aujourdHui)}
        </p>
        {vedette ? (
          <>
            <h1 className="animate-titre pl-[0.28em] text-3xl leading-tight text-zinc-950 sm:text-5xl" style={apres(300)}>
              {vedette.name}
            </h1>
            {meta && (
              <p className="titre-espace animate-fondu text-[0.7rem] text-zinc-600" style={apres(900)}>
                {meta}
              </p>
            )}
            <p className="animate-apparition max-w-md text-base leading-relaxed text-zinc-800" style={apres(1100)}>
              <Phrase etat={etat} aPoser={aPoser} debut={vedette.start_date} />
            </p>
            <Link
              href={suite}
              className="titre-espace animate-apparition mt-4 inline-flex min-h-11 items-center pl-[0.5em] text-base tracking-[0.5em] text-zinc-950 transition hover:text-accent"
              style={apres(1350)}
            >
              Continuer
            </Link>
          </>
        ) : (
          <h1 className="text-3xl text-zinc-950">Aucun tournoi</h1>
        )}
      </div>

      {points.length > 0 && (
        <nav aria-label={`Saison ${annee}`} className="relative mx-auto mb-10 w-full max-w-6xl px-10">
          <div className="relative h-14">
            <div className="animate-pousse absolute inset-x-0 top-3 h-px origin-left bg-white/45" style={apres(700)} aria-hidden="true" />
            <span
              className="absolute top-0 h-6 w-px bg-white/30"
              style={{ left: `${xAujourdhui * 100}%` }}
              aria-hidden="true"
              title="Aujourd'hui"
            />
            {points.map((p) => (
              <Link
                key={p.id}
                href={`/tournoi/${p.id}`}
                aria-label={p.nom}
                aria-current={p.vedette ? 'page' : undefined}
                className={`group absolute top-0 flex -translate-x-1/2 flex-col items-center gap-2 ${p.etiquette ? '' : 'max-sm:hidden'}`}
                style={{ left: `${p.x * 100}%` }}
              >
                <span className="animate-eclore flex size-6 items-center justify-center" style={apres(800 + Math.round(p.x * 1000))}>
                  <span
                    className={
                      p.vedette
                        ? 'animate-halo size-3 rounded-full bg-accent shadow-[0_0_18px_4px_rgba(215,242,90,.45)]'
                        : 'size-1.5 rounded-full bg-zinc-700 transition group-hover:size-2.5 group-hover:bg-zinc-950'
                    }
                  />
                </span>
                {p.etiquette && (
                  <span
                    style={apres(1000 + Math.round(p.x * 1000))}
                    className={`animate-fondu whitespace-nowrap text-[0.65rem] uppercase tracking-[0.12em] ${
                      p.vedette ? 'text-zinc-950' : 'text-zinc-600 max-sm:hidden'
                    }`}
                  >
                    {p.nom}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </section>
  );
}

function Phrase({ etat, aPoser, debut }: { etat: 'en-cours' | 'bientot' | 'passe'; aPoser: PicksAPoserCarte | null; debut: string | null }) {
  if (etat === 'bientot') return <>Début le {formatDate(debut)}.</>;
  if (etat === 'passe') return <>Le dernier tournoi joué. Le prochain apparaîtra ici dès son import.</>;
  if (!aPoser) return <>En cours depuis le {formatDate(debut)}.</>;
  if (aPoser.reste === 0) return <>Tour {aPoser.tour} : tous tes picks sont posés.</>;
  const n = aPoser.reste;
  return (
    <>
      Tour {aPoser.tour}. Il te reste{' '}
      <span className="whitespace-nowrap rounded-[50%] border border-accent/70 px-3 py-0.5 text-accent">
        {n} pick{n > 1 ? 's' : ''}
      </span>{' '}
      à poser.
    </>
  );
}
