'use client';

import { useState } from 'react';
import { carte, pilleSelecteur } from '@/app/ui';
import {
  arbreRegulier,
  cleStock,
  type BilanTour,
  type LigneVue,
  type MatchVue,
  type PickJeuVue,
  type PickVue,
  type StockEntree,
  type TourVue,
} from '@/lib/tableauVue';

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

const BARRE: Record<string, string> = {
  juste: 'bg-emerald-600',
  rate: 'bg-red-600',
  attente: 'bg-zinc-300',
  aucun: 'bg-zinc-200',
};

/** Largeur d'une carte et hauteur d'un emplacement du premier tour (px), arbre ordinateur. */
const LARGEUR_CARTE = 244;
const HAUTEUR_EMPLACEMENT = 148;
const LONGUEUR_LIEN = 42;

function LigneJoueur({ l }: { l: LigneVue }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex-1 truncate ${
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
    </div>
  );
}

function ZonePick({
  pick,
  stock,
  vainqueurNom,
}: {
  pick: PickVue | null;
  stock: StockEntree;
  vainqueurNom: string | null;
}) {
  if (!pick) {
    return <p className="mt-2 text-xs text-zinc-500">Pas de pronostic posé</p>;
  }
  const libelle = stock.id === null ? 'Ton choix' : `Choix de ${stock.nom}`;
  const style =
    pick.verdict === 'juste'
      ? 'bg-emerald-50 text-emerald-700'
      : pick.verdict === 'rate'
        ? 'bg-red-50 text-red-700'
        : 'bg-zinc-100 text-zinc-700';
  const marque = pick.verdict === 'juste' ? '✓ ' : pick.verdict === 'rate' ? '✗ ' : '';
  return (
    <div className={`mt-2 rounded-lg px-2 py-1.5 text-xs font-medium ${style}`}>
      <p className="truncate">
        {marque}
        {libelle} : {pick.joueurNom}
        {pick.verdict === 'attente' && <span className="font-normal"> · en attente</span>}
      </p>
      {pick.verdict === 'rate' && vainqueurNom && <p className="truncate font-normal">Vainqueur : {vainqueurNom}</p>}
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
  return (
    <ul aria-label="Picks du jeu" className="mt-2 space-y-0.5 border-t border-zinc-200 pt-1.5 text-xs">
      {picks.map((p) => (
        <li key={p.cle} className={`truncate ${STYLE_PICK_JEU[p.verdict]}`}>
          <span className="font-semibold">{p.participantNom}</span> : {p.joueurNom}{' '}
          {p.verdict === 'juste' ? '✓' : p.verdict === 'rate' ? '✗' : <span className="text-zinc-500">· en attente</span>}
        </li>
      ))}
    </ul>
  );
}

function CarteMatch({ m, stock }: { m: MatchVue; stock: StockEntree }) {
  const pick = m.picks[cleStock(stock.id)] ?? null;
  const statut = STATUT[m.statut];
  const barre = pick ? BARRE[pick.verdict] : BARRE.aucun;
  return (
    <div className={`relative overflow-hidden py-2.5 pl-4 pr-3 ${carte}`} data-testid="carte-match">
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${barre}`} />
      <LigneJoueur l={m.lignes[0]} />
      <LigneJoueur l={m.lignes[1]} />
      {statut && <p className={`mt-1.5 text-xs font-medium uppercase tracking-wide ${statut.classes}`}>{statut.label}</p>}
      <ZonePick pick={pick} stock={stock} vainqueurNom={m.vainqueurNom} />
      <PicksDuJeu picks={m.picksJeu} />
    </div>
  );
}

function texteBilan(b: BilanTour | undefined): string | null {
  if (!b || b.decides === 0) return null;
  return `${b.justes}/${b.decides}`;
}

/** Colonne-arbre d'ordinateur : cartes centrées dans des emplacements qui doublent à chaque tour. */
function ArbreOrdinateur({ tours, stock }: { tours: TourVue[]; stock: StockEntree }) {
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
                      <CarteMatch m={m} stock={stock} />
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
function ColonnesSimples({ tours, stock }: { tours: TourVue[]; stock: StockEntree }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {tours.map((t) => (
        <section key={t.round} aria-label={t.libelle} className="w-64 shrink-0 space-y-2">
          <h2 className="rounded-lg bg-soustitre-fond px-2 py-1 text-xs font-semibold uppercase tracking-wide">
            {t.libelle} · {t.matchs.length}
          </h2>
          {t.matchs.map((m) => (
            <CarteMatch key={m.id} m={m} stock={stock} />
          ))}
        </section>
      ))}
    </div>
  );
}

export function TableauClient({ tours, stocks }: { tours: TourVue[]; stocks: StockEntree[] }) {
  const [cleChoisie, setCleChoisie] = useState<string>(cleStock(stocks[0]?.id ?? null));
  const [roundChoisi, setRoundChoisi] = useState<string>(tours[0]?.round ?? '');
  const stock = stocks.find((s) => cleStock(s.id) === cleChoisie) ?? stocks[0];
  const tourMobile = tours.find((t) => t.round === roundChoisi) ?? tours[0];
  const arbre = arbreRegulier(tours);

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Participant" className="flex flex-wrap gap-2">
        {stocks.map((s) => {
          const cle = cleStock(s.id);
          const actif = cle === cleChoisie;
          const total = tours.reduce(
            (acc, t) => {
              const b = t.bilans[cle];
              return { justes: acc.justes + (b?.justes ?? 0), decides: acc.decides + (b?.decides ?? 0) };
            },
            { justes: 0, decides: 0 },
          );
          return (
            <button
              key={cle}
              type="button"
              aria-pressed={actif}
              onClick={() => setCleChoisie(cle)}
              className={pilleSelecteur(actif)}
            >
              {s.nom}
              {total.decides > 0 && (
                <span className={`ml-1.5 tabular-nums ${actif ? 'text-blue-100' : 'text-zinc-500'}`}>
                  {total.justes}/{total.decides}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Téléphone : un tour à la fois. */}
      <div className="space-y-3 md:hidden">
        <div role="tablist" aria-label="Tour" className="flex gap-2 overflow-x-auto pb-1">
          {tours.map((t) => {
            const actif = t.round === tourMobile.round;
            const bilan = texteBilan(t.bilans[cleChoisie]);
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
                {bilan && (
                  <span className={`ml-1.5 text-xs tabular-nums ${actif ? 'text-blue-100' : 'text-zinc-500'}`}>
                    {bilan} justes
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          {tourMobile.matchs.map((m) => (
            <CarteMatch key={m.id} m={m} stock={stock} />
          ))}
        </div>
      </div>

      {/* Ordinateur : tous les tours côte à côte. */}
      <div className="hidden md:block">
        {arbre ? <ArbreOrdinateur tours={tours} stock={stock} /> : <ColonnesSimples tours={tours} stock={stock} />}
      </div>
    </div>
  );
}
