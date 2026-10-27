'use client';

import { useMemo, useState } from 'react';
import BadgeSourceElo, { classeElo } from '../BadgeSourceElo';
import InsightBadge from '../picks/InsightBadge';
import { usePoolGT } from '../picks/PoolGameTracker';
import { carte, pilleSelecteur } from '@/app/ui';
import type { SourceElo } from '@/db/elo';
import type { PlayerInsight } from '@/lib/insights';

/**
 * LE GRAND TABLEAU — tous les joueurs encore en lice, avec ce qu'il faut pour
 * décider : Elo, adversaire, chance de gagner, points projetés du match, puis
 * les points espérés à CHAQUE tour restant. Une case de tour se clique : elle
 * pose (ou retire) ce joueur sur le pick correspondant, et le plan se recalcule
 * tout de suite.
 */

export interface CelluleTour {
  /** E[points | pické à ce tour] — inconditionnelle. */
  e: number;
  /** P(être encore en lice à ce tour). */
  presence: number;
  /** Écart-type des points. */
  sigma: number;
}

export interface LigneTableau {
  idx: number;
  id: string;
  nom: string;
  rang: number | null;
  elo: number;
  sourceElo: SourceElo;
  taName: string | null;
  candidatsElo: string[];
  moitie: 'top' | 'bottom';
  adversaire: { nom: string; rang: number | null; elo: number } | null;
  /** Chance de gagner le duel du tour courant (1/0 s'il est joué). */
  pVictoire: number | null;
  /** Points projetés du duel (réels s'il est joué). */
  pointsMatch: number | null;
  resultat: 'gagne' | 'perdu' | null;
  parTour: Record<string, CelluleTour>;
  /** Déjà pické par ce participant à un autre tour. */
  utilise: boolean;
  /** Les autres participants qui l'ont déjà pické. */
  prisPar: { nom: string; round: string }[];
  insight: PlayerInsight | null;
}

export type EtatSlot = 'valide' | 'choisi' | 'plan' | 'vide';

export interface InfoSlot {
  joueur: number | null;
  etat: EtatSlot;
}

type Tri = 'tour' | 'elo' | 'rang' | 'tableau';

const f1 = (x: number) => x.toFixed(1);
const pct = (x: number) => `${Math.round(x * 100)}`;

export default function TableauJoueurs({
  lignes,
  rounds,
  premierTourLibre,
  tourCourant,
  cleDeCellule,
  infoSlots,
  onCellule,
}: {
  lignes: LigneTableau[];
  /** Tours affichés (du tour courant à la finale). */
  rounds: string[];
  /** Tour du prochain pick à poser (sert au tri par défaut et aux repères Game Tracker). */
  premierTourLibre: string | null;
  /** Tour dont les duels sont connus (affiché dans les colonnes de gauche). */
  tourCourant: string;
  cleDeCellule: (idx: number, round: string) => string | null;
  infoSlots: Map<string, InfoSlot>;
  onCellule: (idx: number, round: string) => void;
}) {
  const [tri, setTri] = useState<Tri>('tour');
  const [moitie, setMoitie] = useState<'tous' | 'top' | 'bottom'>('tous');
  const [masquerUtilises, setMasquerUtilises] = useState(false);
  const pool = usePoolGT();
  const poolActif = pool && premierTourLibre && pool.roundLocal === premierTourLibre ? pool : null;
  const tourTri = premierTourLibre ?? rounds[0];

  const affichees = useMemo(() => {
    const filtrees = lignes.filter(
      (l) => (moitie === 'tous' || l.moitie === moitie) && !(masquerUtilises && l.utilise),
    );
    const cle: Record<Tri, (l: LigneTableau) => number> = {
      tour: (l) => -(l.parTour[tourTri]?.e ?? 0),
      elo: (l) => -l.elo,
      rang: (l) => l.rang ?? 9999,
      tableau: (l) => l.idx,
    };
    return [...filtrees].sort((a, b) => cle[tri](a) - cle[tri](b) || a.idx - b.idx);
  }, [lignes, moitie, masquerUtilises, tri, tourTri]);

  return (
    <section className="space-y-2" aria-label="Tous les joueurs en lice">
      <div className="flex flex-wrap items-center gap-1.5">
        <h2 className="mr-2 text-sm font-semibold">Tous les joueurs</h2>
        {(
          [
            ['tous', 'Tous'],
            ['top', 'Moitié haute'],
            ['bottom', 'Moitié basse'],
          ] as const
        ).map(([v, label]) => (
          <button key={v} type="button" onClick={() => setMoitie(v)} className={pilleSelecteur(moitie === v)}>
            {label}
          </button>
        ))}
        <label className="ml-auto flex min-h-11 items-center gap-2 text-xs text-zinc-600">
          <input
            type="checkbox"
            checked={masquerUtilises}
            onChange={(e) => setMasquerUtilises(e.target.checked)}
            className="size-4 accent-blue-600"
          />
          Masquer ceux déjà pickés
        </label>
        <label className="flex min-h-11 items-center gap-2 text-xs text-zinc-600">
          Trier par
          <select
            value={tri}
            onChange={(e) => setTri(e.target.value as Tri)}
            className="min-h-11 rounded-xl bg-zinc-100 px-2 text-sm text-zinc-900"
          >
            <option value="tour">Points espérés {tourTri}</option>
            <option value="elo">Elo</option>
            <option value="rang">Classement</option>
            <option value="tableau">Ordre du tableau</option>
          </select>
        </label>
      </div>

      <div className={`${carte} overflow-x-auto`}>
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <th className="sticky left-0 z-10 bg-white px-3 py-2">Joueur</th>
              <th className="px-2 py-2 text-right">Elo</th>
              <th className="px-2 py-2">Adversaire {tourCourant}</th>
              <th className="px-2 py-2 text-right" title="Écart d'Elo, joueur − adversaire">
                Écart
              </th>
              <th className="px-2 py-2 text-right" title="Chance de gagner le duel">
                Victoire
              </th>
              <th className="px-2 py-2 text-right" title="Points projetés du duel (réels s'il est joué)">
                Pts du match
              </th>
              {rounds.map((r) => (
                <th
                  key={r}
                  className={`border-l border-zinc-100 px-2 py-2 text-center ${r === premierTourLibre ? 'bg-blue-50 text-blue-700' : ''}`}
                  title="Points espérés si pické à ce tour (et chance d'être encore en lice)"
                >
                  {r}
                </th>
              ))}
              <th className="border-l border-zinc-100 px-2 py-2">Déjà pris par</th>
            </tr>
          </thead>
          <tbody>
            {affichees.map((l) => {
              const etatGT = poolActif?.parJoueur[l.id];
              const horsPool = !!poolActif && !etatGT;
              const ecart = l.adversaire ? Math.round(l.elo - l.adversaire.elo) : null;
              return (
                <tr key={l.idx} className={`border-b border-zinc-50 last:border-0 ${l.utilise ? 'bg-zinc-50' : 'bg-white'}`}>
                  <td className="sticky left-0 z-10 bg-inherit px-3 py-2 align-top">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span
                        className={`font-semibold ${
                          l.resultat === 'gagne'
                            ? 'text-emerald-700'
                            : l.resultat === 'perdu'
                              ? 'text-zinc-500 line-through decoration-zinc-300'
                              : l.utilise
                                ? 'text-zinc-500'
                                : ''
                        }`}
                      >
                        {l.nom}
                      </span>
                      {l.rang ? <span className="text-xs text-zinc-500">#{l.rang}</span> : null}
                      <InsightBadge insight={l.insight} />
                      {horsPool && (
                        <span
                          className="rounded bg-amber-100 px-1 text-xs font-medium text-amber-800"
                          title="Pas dans ton pool Game Tracker pour ce tour : l'envoi serait refusé."
                        >
                          hors pool GT
                        </span>
                      )}
                      {etatGT?.dejaPicke && (
                        <span
                          className="rounded bg-red-100 px-1 text-xs font-medium text-red-800"
                          title="Déjà pické chez Game Tracker à un autre tour : l'envoi serait refusé."
                        >
                          déjà pické GT
                        </span>
                      )}
                      {etatGT?.enAttente && (
                        <span
                          className="rounded-md bg-zinc-100 px-1.5 text-xs font-medium text-zinc-700"
                          title="Son match du tour précédent n'est pas joué : s'il le perd, Game Tracker redirigera le pick."
                        >
                          en attente
                        </span>
                      )}
                      {l.utilise && <span className="text-xs italic text-zinc-500">déjà pické</span>}
                    </div>
                  </td>

                  <td className="px-2 py-2 text-right align-top">
                    <span
                      className={`font-mono tabular-nums ${classeElo(l.sourceElo)}`}
                      title="Elo effectif utilisé par le calcul (pondéré surface)"
                    >
                      {Math.round(l.elo)}
                    </span>
                    <div className="flex justify-end">
                      <BadgeSourceElo source={l.sourceElo} taName={l.taName} candidats={l.candidatsElo} nom={l.nom} />
                    </div>
                  </td>

                  <td className="px-2 py-2 align-top text-xs">
                    {l.adversaire ? (
                      <>
                        <span className={l.resultat === 'perdu' ? 'font-semibold text-emerald-700' : 'text-zinc-700'}>
                          {l.resultat === 'gagne' ? 'a battu ' : l.resultat === 'perdu' ? 'battu par ' : 'vs '}
                          {l.adversaire.nom}
                        </span>
                        <span className="ml-1 text-zinc-500">
                          {l.adversaire.rang ? `#${l.adversaire.rang} · ` : ''}
                          <span className="font-mono tabular-nums">{Math.round(l.adversaire.elo)}</span>
                        </span>
                      </>
                    ) : (
                      <span className="text-zinc-500">à venir</span>
                    )}
                  </td>

                  <td
                    className={`px-2 py-2 text-right align-top font-mono text-xs tabular-nums ${
                      ecart === null ? 'text-zinc-300' : ecart > 0 ? 'text-emerald-700' : ecart < 0 ? 'text-red-600' : 'text-zinc-500'
                    }`}
                  >
                    {ecart === null ? '—' : `${ecart > 0 ? '+' : ''}${ecart}`}
                  </td>

                  <td className="px-2 py-2 text-right align-top font-mono text-xs tabular-nums">
                    {l.pVictoire === null ? '—' : l.resultat ? (l.resultat === 'gagne' ? '✓' : '✗') : `${pct(l.pVictoire)} %`}
                  </td>

                  <td className="px-2 py-2 text-right align-top font-mono text-xs font-semibold tabular-nums">
                    {l.pointsMatch === null ? '—' : f1(l.pointsMatch)}
                    {l.resultat && <span className="ml-0.5 text-xs font-normal text-zinc-500">réel</span>}
                  </td>

                  {rounds.map((r) => {
                    const c = l.parTour[r];
                    const cle = cleDeCellule(l.idx, r);
                    const slot = cle ? infoSlots.get(cle) : undefined;
                    const surCeJoueur = slot?.joueur === l.idx;
                    const etat = surCeJoueur ? slot?.etat : undefined;
                    const cliquable = !!cle && !!c && c.presence > 0 && !l.utilise && slot?.etat !== 'valide';
                    const classes =
                      etat === 'valide'
                        ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-400'
                        : etat === 'choisi'
                          ? 'bg-blue-600 text-white'
                          : etat === 'plan'
                            ? 'bg-blue-50 text-blue-900 ring-1 ring-blue-300'
                            : cliquable
                              ? 'hover:bg-zinc-100'
                              : 'text-zinc-300';
                    return (
                      <td key={r} className="border-l border-zinc-100 p-0.5 align-top">
                        {c && c.presence > 0 ? (
                          <button
                            type="button"
                            disabled={!cliquable}
                            onClick={() => onCellule(l.idx, r)}
                            title={`${r} : ${f1(c.e)} pts espérés (± ${f1(c.sigma)}) · ${pct(c.presence)} % d'être en lice${
                              cliquable ? ' — clique pour le poser sur ce pick' : ''
                            }`}
                            className={`flex min-h-11 w-full min-w-14 flex-col items-center justify-center rounded-lg px-1 py-1 transition active:scale-[0.97] disabled:cursor-default ${classes}`}
                          >
                            <span className="font-mono text-sm font-semibold tabular-nums">{f1(c.e)}</span>
                            <span className={`text-xs ${etat === 'choisi' ? 'text-blue-100' : 'text-zinc-500'}`}>
                              {pct(c.presence)} %
                            </span>
                          </button>
                        ) : (
                          <span className="flex min-h-11 items-center justify-center text-zinc-200">·</span>
                        )}
                      </td>
                    );
                  })}

                  <td className="border-l border-zinc-100 px-2 py-2 align-top text-xs text-zinc-500">
                    {l.prisPar.map((p) => `${p.nom} (${p.round})`).join(', ')}
                  </td>
                </tr>
              );
            })}
            {affichees.length === 0 && (
              <tr>
                <td colSpan={7 + rounds.length} className="px-3 py-4 text-sm text-zinc-500">
                  Aucun joueur à afficher.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">
        Chaque case de tour : points espérés si tu piques ce joueur à ce tour (en petit, sa chance d&apos;être encore en
        lice). Bleu foncé = ton choix, bleu clair = le plan, vert = validé.
      </p>
    </section>
  );
}
