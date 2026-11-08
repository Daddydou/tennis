'use client';

import { useState } from 'react';
import { carte, pilleSelecteur } from '@/app/ui';
import {
  arbreRegulier,
  cleStock,
  initiale,
  tourEnCours,
  type LigneVue,
  type MatchVue,
  type PickJeuVue,
  type PickVue,
  type StockEntree,
  type TourVue,
  type Verdict,
} from '@/lib/tableauVue';

/**
 * Tableau compilé (comme l'app de Thomas) : UN seul tableau pour tous les
 * participants. Sur chaque match, une pastille par participant se pose à côté
 * du joueur qu'il a pronostiqué vainqueur (vert = juste, rouge = raté, gris =
 * en attente). Si le vainqueur de son bracket n'est dans aucun des deux
 * joueurs du match, il est rappelé en rouge sous le match. Choix du tour en
 * haut ; les tours précédents sont repliés.
 */

/**
 * Statut : libellé + couleur, JAMAIS la couleur seule. Ambre pour une fin
 * irrégulière (w.o., abandon), émeraude pour « en cours », zinc sinon.
 */
const STATUT: Record<string, { label: string; classes: string }> = {
  scheduled: { label: 'À jouer', classes: 'text-zinc-500' },
  live: { label: 'En cours', classes: 'text-emerald-700' },
  in_progress: { label: 'En cours', classes: 'text-emerald-700' },
  walkover: { label: 'W.O.', classes: 'text-amber-700' },
  retired: { label: 'Abandon', classes: 'text-amber-700' },
  bye: { label: 'Bye', classes: 'text-zinc-600' },
};

const STYLE_PASTILLE: Record<Verdict, string> = {
  juste: 'bg-emerald-600 text-white',
  rate: 'bg-red-600 text-white',
  attente: 'bg-zinc-200 text-zinc-700',
};

const LIBELLE_VERDICT: Record<Verdict, string> = {
  juste: 'juste',
  rate: 'raté',
  attente: 'en attente',
};

/** Largeur d'une carte et hauteur d'un emplacement du premier tour affiché (px), arbre ordinateur. */
const LARGEUR_CARTE = 284;
const HAUTEUR_EMPLACEMENT = 220;
const LONGUEUR_LIEN = 42;

/** Pastille ronde d'un participant : sa lettre, colorée selon le verdict du pronostic. */
function Pastille({ stock, pick, rouge = false }: { stock: StockEntree; pick: PickVue; rouge?: boolean }) {
  const style = rouge ? 'bg-white text-red-700 ring-1 ring-red-600' : STYLE_PASTILLE[pick.verdict];
  return (
    <span
      title={`${stock.nom} : ${pick.joueurNom} (${rouge ? 'absent du match' : LIBELLE_VERDICT[pick.verdict]})`}
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold leading-none ${style}`}
    >
      {initiale(stock.nom)}
      <span className="sr-only">
        {` : ${stock.nom} a pronostiqué ${pick.joueurNom} (${rouge ? 'absent du match' : LIBELLE_VERDICT[pick.verdict]})`}
      </span>
    </span>
  );
}

function LigneJoueur({
  l,
  cote,
  stocks,
  m,
}: {
  l: LigneVue;
  cote: 1 | 2;
  stocks: StockEntree[];
  m: MatchVue;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`min-w-0 flex-1 truncate ${
          l.gagnant ? 'font-semibold text-titre' : l.bye || l.perdant ? 'text-zinc-500' : 'text-zinc-900'
        }`}
      >
        {l.nom}
      </span>
      <div className="flex gap-1 font-mono text-xs text-zinc-600">
        {l.sets.map((s, i) => (
          <span key={i} className="w-5 text-right tabular-nums">
            {s.jeux}
            {s.tb !== null && <sup className="text-[0.65rem]">{s.tb}</sup>}
          </span>
        ))}
      </div>
      {/* Zone de largeur FIXE (toujours la place de tous les participants) : les scores des deux
          lignes restent alignés, avec ou sans pastille. */}
      <span
        className="flex shrink-0 justify-end gap-0.5"
        style={{ width: `${stocks.length * 1.25 + Math.max(0, stocks.length - 1) * 0.125}rem` }}
        data-testid={`pastilles-${cote}`}
      >
        {stocks.map((s) => {
          const p = m.picks[cleStock(s.id)];
          return p && p.cote === cote ? <Pastille key={cleStock(s.id)} stock={s} pick={p} /> : null;
        })}
      </span>
    </div>
  );
}

const STYLE_PICK_JEU: Record<string, string> = {
  juste: 'text-emerald-700',
  rate: 'text-red-700',
  attente: 'text-zinc-600',
};

/**
 * Picks du JEU (un joueur par moitié et par tour) de chaque participant dont
 * le joueur pické joue ce match, avec le résultat : ✓ juste, ✗ raté, sinon
 * « en attente ». Le texte porte le sens, la couleur n'est qu'un renfort.
 */
function PicksDuJeu({ picks }: { picks: PickJeuVue[] }) {
  if (picks.length === 0) return null;
  // Un même joueur pické par plusieurs participants : UNE ligne, les participants à côté.
  const groupes = new Map<string, { joueurNom: string; verdict: Verdict; participants: string[] }>();
  for (const p of picks) {
    const g = groupes.get(p.joueurNom);
    if (g) g.participants.push(p.participantNom);
    else groupes.set(p.joueurNom, { joueurNom: p.joueurNom, verdict: p.verdict, participants: [p.participantNom] });
  }
  return (
    <div className="mt-2 border-t border-zinc-200 pt-1.5" data-testid="picks-du-jeu">
      {/* Titre visible : ces ✓ / ✗ jugent le pick du JEU DE PICKS, pas le pronostic du bracket (pastilles). */}
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Jeu de picks · pas le bracket</p>
      <ul aria-label="Picks du jeu" className="mt-0.5 space-y-0.5 text-xs">
        {[...groupes.values()].map((g) => (
          <li key={g.joueurNom} className={`truncate ${STYLE_PICK_JEU[g.verdict]}`}>
            <span className="font-semibold">{g.joueurNom}</span>{' '}
            {g.verdict === 'juste' ? '✓' : g.verdict === 'rate' ? '✗' : <span className="text-zinc-500">· en attente</span>}
            <span className="text-zinc-600"> · {g.participants.join(', ')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Participants dont le vainqueur de bracket n'est dans aucun des deux joueurs
 * du match : leur choix rappelé en rouge, sous le match.
 */
function Absents({ m, stocks }: { m: MatchVue; stocks: StockEntree[] }) {
  const absents = stocks.filter((s) => m.picks[cleStock(s.id)]?.absent);
  if (absents.length === 0) return null;
  // Un même joueur choisi par plusieurs participants : UNE ligne, les pastilles à côté.
  const parJoueur = new Map<string, { pick: PickVue; stocks: StockEntree[] }>();
  for (const s of absents) {
    const p = m.picks[cleStock(s.id)]!;
    const g = parJoueur.get(p.joueurNom);
    if (g) g.stocks.push(s);
    else parJoueur.set(p.joueurNom, { pick: p, stocks: [s] });
  }
  return (
    <ul aria-label="Pronostics hors match" className="mt-1.5 space-y-0.5 text-xs text-red-700">
      {[...parJoueur.entries()].map(([joueurNom, g]) => (
        <li key={joueurNom} className="flex items-center gap-1.5">
          <span className="flex gap-0.5">
            {g.stocks.map((s) => (
              <Pastille key={cleStock(s.id)} stock={s} pick={g.pick} rouge />
            ))}
          </span>
          <span className="truncate">{joueurNom}</span>
        </li>
      ))}
    </ul>
  );
}

function CarteMatch({ m, stocks }: { m: MatchVue; stocks: StockEntree[] }) {
  const statut = STATUT[m.statut];
  return (
    <div className={`relative overflow-hidden px-3 py-2.5 ${carte}`} data-testid="carte-match">
      <LigneJoueur l={m.lignes[0]} cote={1} stocks={stocks} m={m} />
      <LigneJoueur l={m.lignes[1]} cote={2} stocks={stocks} m={m} />
      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
        {statut ? (
          <span className={`font-medium uppercase tracking-wide ${statut.classes}`}>{statut.label}</span>
        ) : (
          <span />
        )}
        {m.bilanMatch && (
          <span className="tabular-nums text-zinc-600" data-testid="bilan-match">
            {m.bilanMatch.justes}/{m.bilanMatch.participants} juste
          </span>
        )}
      </div>
      <Absents m={m} stocks={stocks} />
      <PicksDuJeu picks={m.picksJeu} />
    </div>
  );
}

/** Bilan d'un participant sur un ensemble de tours : « justes / décidés ». */
function bilanDe(tours: TourVue[], cle: string): { justes: number; decides: number } {
  return tours.reduce(
    (acc, t) => {
      const b = t.bilans[cle];
      return { justes: acc.justes + (b?.justes ?? 0), decides: acc.decides + (b?.decides ?? 0) };
    },
    { justes: 0, decides: 0 },
  );
}

/** Une rangée de pastilles avec le bilan de chacun (en-tête, ou résumé d'un tour replié). */
function Bilans({ tours, stocks }: { tours: TourVue[]; stocks: StockEntree[] }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {stocks.map((s) => {
        const b = bilanDe(tours, cleStock(s.id));
        return (
          <span key={cleStock(s.id)} className="inline-flex items-center gap-1 text-xs tabular-nums text-zinc-700">
            <span
              aria-hidden="true"
              className="inline-flex size-5 items-center justify-center rounded-full bg-zinc-800 text-[0.65rem] font-bold text-white"
            >
              {initiale(s.nom)}
            </span>
            <span>
              {s.nom} {b.decides > 0 ? `${b.justes}/${b.decides}` : '–'}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Colonnes en arbre d'ordinateur : cartes centrées dans des emplacements qui doublent à chaque tour. */
function ArbreOrdinateur({ tours, stocks }: { tours: TourVue[]; stocks: StockEntree[] }) {
  const hauteurTotale = tours[0].matchs.length * HAUTEUR_EMPLACEMENT;
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex" style={{ gap: LONGUEUR_LIEN * 2, minWidth: 'max-content' }}>
        {tours.map((t, i) => {
          const hauteur = HAUTEUR_EMPLACEMENT * 2 ** i;
          const dernier = i === tours.length - 1;
          return (
            <section key={t.round} aria-label={t.libelle} style={{ width: LARGEUR_CARTE }}>
              <h2 className="mb-2 rounded-lg bg-soustitre-fond px-2 py-1 text-xs font-semibold uppercase tracking-wide">
                {t.libelle} · {t.matchs.length}
              </h2>
              <div style={{ height: hauteurTotale }}>
                {t.matchs.map((m, k) => (
                  <div key={m.id} className="relative flex items-center" style={{ height: hauteur }}>
                    {i > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-zinc-300"
                        style={{ right: '100%', width: LONGUEUR_LIEN }}
                      />
                    )}
                    <div className="w-full">
                      <CarteMatch m={m} stocks={stocks} />
                    </div>
                    {!dernier && (
                      <>
                        <span
                          aria-hidden="true"
                          className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-zinc-300"
                          style={{ left: '100%', width: LONGUEUR_LIEN }}
                        />
                        <span
                          aria-hidden="true"
                          className="absolute w-0.5 bg-zinc-300"
                          style={{
                            left: `calc(100% + ${LONGUEUR_LIEN}px)`,
                            height: hauteur / 2,
                            ...(k % 2 === 0 ? { top: '50%' } : { bottom: '50%' }),
                          }}
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Colonnes simples (tableau trop grand ou irrégulier) : même carte, sans traits de liaison. */
function ColonnesSimples({ tours, stocks }: { tours: TourVue[]; stocks: StockEntree[] }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {tours.map((t) => (
        <section key={t.round} aria-label={t.libelle} className="w-72 shrink-0 space-y-2">
          <h2 className="rounded-lg bg-soustitre-fond px-2 py-1 text-xs font-semibold uppercase tracking-wide">
            {t.libelle} · {t.matchs.length}
          </h2>
          {t.matchs.map((m) => (
            <CarteMatch key={m.id} m={m} stocks={stocks} />
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * Rappel des points du BRACKET de chacun, au même format que la rangée de l'onglet Picks
 * (« Moi 88 pts »). `null` = aucun pronostic de bracket importé pour ce participant :
 * à distinguer d'un vrai 0.
 */
function PointsBracket({ stocks, points }: { stocks: StockEntree[]; points: Record<string, number | null> }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Points du bracket" data-testid="points-bracket">
      <span className="mr-1 text-xs font-medium text-soustitre">Points du bracket</span>
      {stocks.map((s) => {
        const p = points[cleStock(s.id)] ?? null;
        return (
          <div key={cleStock(s.id)} className={`flex min-h-11 items-center gap-1.5 px-3 text-sm ${carte}`}>
            <span className="font-medium">{s.nom}</span>
            {p === null ? <span className="text-xs text-zinc-500">pas de bracket</span> : <span className="tabular-nums text-juste">{p} pts</span>}
          </div>
        );
      })}
    </div>
  );
}

export function TableauClient({
  tours,
  stocks,
  pointsBracket,
}: {
  tours: TourVue[];
  stocks: StockEntree[];
  /** Points du bracket de chaque participant (clé = cleStock) ; absent : la rangée n'est pas affichée. */
  pointsBracket?: Record<string, number | null>;
}) {
  const [roundChoisi, setRoundChoisi] = useState<string>(() => tourEnCours(tours));
  const indexChoisi = Math.max(
    0,
    tours.findIndex((t) => t.round === roundChoisi),
  );
  const tourChoisi = tours[indexChoisi];
  const precedents = tours.slice(0, indexChoisi);
  const aPartirDuChoix = tours.slice(indexChoisi);
  const arbre = arbreRegulier(aPartirDuChoix);

  return (
    <div className="space-y-4">
      {pointsBracket && <PointsBracket stocks={stocks} points={pointsBracket} />}

      {/* Bilan de chacun sur tout le tournoi : les pastilles se retrouvent sur les matchs. */}
      <div className={`${carte} px-3 py-2`}>
        <Bilans tours={tours} stocks={stocks} />
        <p className="mt-1 text-xs text-zinc-500">
          Pastille sur un joueur = vainqueur pronostiqué dans le bracket (vert juste, rouge raté, gris en attente).
          Pastille rouge sous un match = son vainqueur n&apos;y est plus.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          En bas d&apos;une carte, « Jeu de picks » = le joueur pické pour ce tour dans le jeu de picks : un autre jeu que le bracket, ses ✓ et ✗ ne
          comptent pas dans « n/3 juste » ni dans les bilans ci-dessus.
        </p>
      </div>

      <div role="tablist" aria-label="Tour" className="flex gap-2 overflow-x-auto pb-1">
        {tours.map((t) => {
          const actif = t.round === tourChoisi.round;
          return (
            <button
              key={t.round}
              type="button"
              role="tab"
              aria-selected={actif}
              onClick={() => setRoundChoisi(t.round)}
              className={`${pilleSelecteur(actif)} shrink-0`}
            >
              {t.libelle}
            </button>
          );
        })}
      </div>

      {precedents.length > 0 && (
        <section aria-label="Tours précédents" className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tours précédents — repliés</h2>
          {precedents.map((t) => (
            <details key={t.round} className={`${carte} px-3 py-1`}>
              <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm font-medium text-zinc-800">
                <span>
                  {t.libelle} <span className="font-normal text-zinc-500">· {t.matchs.length} matchs</span>
                </span>
                <Bilans tours={[t]} stocks={stocks} />
              </summary>
              <div className="grid gap-2 pb-3 pt-1 sm:grid-cols-2 lg:grid-cols-3">
                {t.matchs.map((m) => (
                  <CarteMatch key={m.id} m={m} stocks={stocks} />
                ))}
              </div>
            </details>
          ))}
        </section>
      )}

      {/* Téléphone : le tour choisi, carte par carte. */}
      <div className="space-y-2 md:hidden">
        {tourChoisi.matchs.map((m) => (
          <CarteMatch key={m.id} m={m} stocks={stocks} />
        ))}
      </div>

      {/* Ordinateur : l'arbre du tour choisi jusqu'à la finale. */}
      <div className="hidden md:block">
        {arbre ? (
          <ArbreOrdinateur tours={aPartirDuChoix} stocks={stocks} />
        ) : (
          <ColonnesSimples tours={aPartirDuChoix} stocks={stocks} />
        )}
      </div>
    </div>
  );
}
