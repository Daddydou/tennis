'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { validerPick, supprimerPick } from './actions';
import BadgeSourceElo, { classeElo } from '../BadgeSourceElo';
import InsightBadge from './InsightBadge';
import InsightDetail from './InsightDetail';
import { usePoolGT } from './PoolGameTracker';
import { boutonPrimaire, boutonDanger, Spinner } from '@/app/ui';
import type { PlayerInsight } from '@/lib/insights';
import type { Half } from '@/lib/types';

export interface Candidat {
  playerId: string;
  nom: string;
  rang: number | null;
  adversaire: string | null;
  /**
   * Issue du duel de CE tour pour ce joueur, s'il est déjà joué : il l'a
   * gagné, ou perdu. null = pas encore joué (ou exemption).
   */
  resultat: 'gagne' | 'perdu' | null;
  ePoints: number;
  /** Elo effectif (pondéré surface) réellement utilisé par la simulation. */
  elo: number | null;
  /** D'où vient cet Elo : Tennis Abstract, repli maison/défaut, ou homonymie. */
  sourceElo: 'ta' | 'maison' | 'defaut' | 'ambigu';
  /** Nom Tennis Abstract retenu — révèle une correspondance douteuse. */
  taName: string | null;
  /** Homonymes non départagés (source `ambigu`) : « Nom (slug) ». */
  candidats: string[];
  /** Écart d'Elo effectif joueur − adversaire (indicateur de mismatch). */
  ecartElo: number | null;
  utilise: boolean;
  /**
   * Insight le plus récent (tn_player_insights), ou null. AFFICHAGE SEUL :
   * n'intervient jamais dans `utilise`, la sélection ni le tri.
   */
  insight: PlayerInsight | null;
}

export interface Colonne {
  half: Half | null;
  label: string;
  pickActuel: string | null;
  /**
   * Tous les survivants de cette moitié sont déjà pickés ailleurs : le slot ne
   * peut pas être rempli. État valide du jeu (un joueur ne sert qu'une fois),
   * pas une erreur — on n'attend donc plus de pick ici.
   */
  impossible: boolean;
  candidats: Candidat[];
}

function ColonnePick({
  tournamentId,
  round,
  colonne,
  participantId,
}: {
  tournamentId: string;
  round: string;
  colonne: Colonne;
  /** null = mon pick (comportement historique) ; sinon celui d'un participant. */
  participantId: string | null;
}) {
  const [choix, setChoix] = useState<string | null>(colonne.pickActuel);
  const [erreur, setErreur] = useState<string | null>(null);
  /** Joueur dont le détail d'insight est déplié (un seul à la fois). */
  const [detailOuvert, setDetailOuvert] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pool = usePoolGT();
  // Le pool est celui de MON compte Game Tracker : jamais sur la vue d'un autre participant.
  const poolActif = participantId === null && pool && pool.roundLocal === round ? pool : null;

  const modifie = choix !== colonne.pickActuel;

  function valider() {
    if (!choix) return;
    const cand = colonne.candidats.find((c) => c.playerId === choix);
    setErreur(null);
    startTransition(async () => {
      const r = await validerPick(
        tournamentId,
        round,
        colonne.half,
        choix,
        cand?.ePoints ?? null,
        participantId,
      );
      if (r.ok) router.refresh();
      else setErreur(r.error ?? 'Erreur');
    });
  }

  function retirer() {
    setErreur(null);
    startTransition(async () => {
      const r = await supprimerPick(tournamentId, round, colonne.half, participantId);
      if (r.ok) {
        setChoix(null);
        router.refresh();
      } else setErreur(r.error ?? 'Erreur');
    });
  }

  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{colonne.label}</h2>
        {colonne.pickActuel ? (
          <span className="text-xs text-emerald-600">
            pické
          </span>
        ) : colonne.impossible ? (
          <span className="text-xs text-amber-600">
            sans pick possible
          </span>
        ) : null}
      </div>

      {colonne.impossible && (
        <p className="rounded-xl bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
          Tous les survivants de cette moitié ont déjà été pickés à un tour
          précédent (par ce participant). Un joueur ne pouvant servir
          qu&apos;une fois par tournoi et par participant, ce slot ne peut pas
          être rempli : il est neutralisé et ne bloque pas la progression.
        </p>
      )}

      <div className={`divide-y divide-zinc-100 overflow-hidden rounded-2xl bg-white shadow-card`}>
        {colonne.candidats.map((c) => {
          const selectionnable = !c.utilise;
          const selected = choix === c.playerId;
          // Le pick VALIDÉ pour ce slot (vérité serveur, colonne.pickActuel) —
          // distinct de `selected` (choix radio local, purement client) : un
          // clic d'exploration sur un autre candidat SANS confirmer change
          // `choix` mais jamais le vrai pick, et ne doit donc jamais faire
          // disparaître la surbrillance de celui réellement posé.
          const estPickActuel = c.playerId === colonne.pickActuel;
          // Détail dépliable seulement s'il y a quelque chose à lire.
          const aDetail =
            !!c.insight && (!!c.insight.summary || c.insight.facts.length > 0);
          const ouvert = aDetail && detailOuvert === c.playerId;
          // Repères Game Tracker : seulement après « Lire Game Tracker », et
          // seulement pour le tour qu'il a ouvert. INDICATIF : ne bloque rien.
          const etatGT = poolActif?.parJoueur[c.playerId];
          const horsPool = !!poolActif && !etatGT;
          return (
            <div key={c.playerId}>
            <label
              className={`flex min-h-11 cursor-pointer items-start gap-2.5 px-2.5 py-2 text-sm transition ${
                c.utilise
                  ? 'cursor-not-allowed bg-zinc-100 text-zinc-400'
                  : estPickActuel
                    ? 'bg-emerald-50'
                    : selected
                      ? 'bg-blue-50'
                      : 'hover:bg-zinc-50'
              }`}
            >
              <input
                type="radio"
                name={`slot-${round}-${colonne.half ?? 'x'}`}
                value={c.playerId}
                checked={selected}
                disabled={!selectionnable}
                onChange={() => setChoix(c.playerId)}
                className="mt-1 size-4 shrink-0 accent-blue-600"
              />

              {/* Ligne 1 : le joueur (en premier, nom ENTIER) ; ligne 2 : son
                  adversaire, lui aussi en entier, puis les chiffres. Plus de
                  colonnes fixes qui écrasaient le nom au téléphone. */}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span
                    className={`font-semibold ${
                      c.resultat === 'gagne'
                        ? 'text-emerald-700'
                        : c.resultat === 'perdu'
                          ? 'text-zinc-400 line-through decoration-zinc-300'
                          : ''
                    }`}
                  >
                    {c.nom}
                  </span>
                  {c.rang ? <span className="text-xs text-zinc-400">#{c.rang}</span> : null}
                  {c.resultat === 'gagne' && (
                    <span className="rounded bg-emerald-100 px-1 text-[10px] font-medium text-emerald-800">gagné</span>
                  )}
                  {c.resultat === 'perdu' && (
                    <span className="rounded bg-zinc-200 px-1 text-[10px] font-medium text-zinc-600">perdu</span>
                  )}
                  {estPickActuel && (
                    <span className="text-xs font-medium text-emerald-600">✓ validé</span>
                  )}
                  {c.utilise && <span className="text-xs italic">déjà pické</span>}
                  <InsightBadge insight={c.insight} />
                  {horsPool && (
                    <span
                      className="shrink-0 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800"
                      title="Pas dans ton pool Game Tracker pour ce tour : l'envoi serait refusé."
                    >
                      hors pool GT
                    </span>
                  )}
                  {etatGT?.dejaPicke && (
                    <span
                      className="shrink-0 rounded bg-red-100 px-1 text-[10px] font-medium text-red-800"
                      title="Déjà pické chez Game Tracker à un autre tour : l'envoi serait refusé."
                    >
                      déjà pické GT
                    </span>
                  )}
                  {etatGT?.enAttente && (
                    <span
                      className="shrink-0 rounded bg-sky-100 px-1 text-[10px] font-medium text-sky-800"
                      title="Son match du tour précédent n'est pas joué : s'il le perd, Game Tracker redirigera le pick."
                    >
                      en attente
                    </span>
                  )}
                  {aDetail && (
                    // Un bouton dans un <label> n'active pas le radio : ouvrir le
                    // détail ne change jamais le choix en cours.
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setDetailOuvert(ouvert ? null : c.playerId);
                      }}
                      aria-expanded={ouvert}
                      aria-label={`Infos sur ${c.nom}`}
                      title="Infos joueur"
                      className="-my-2 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                    >
                      <span className="flex size-4 items-center justify-center rounded-full border border-current text-[10px] font-semibold leading-none">
                        i
                      </span>
                    </button>
                  )}
                </span>

                <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-500">
                  {c.adversaire ? (
                    <span>
                      {c.resultat === 'gagne' ? 'a battu ' : c.resultat === 'perdu' ? 'battu par ' : 'vs '}
                      <span
                        className={
                          c.resultat === 'perdu' ? 'font-semibold text-emerald-700' : 'text-zinc-700'
                        }
                      >
                        {c.adversaire}
                      </span>
                    </span>
                  ) : (
                    <span>adversaire à venir</span>
                  )}
                  <span aria-hidden className="text-zinc-300">·</span>
                  <span
                    className={`font-mono tabular-nums ${classeElo(c.sourceElo)}`}
                    title="Elo effectif utilisé par la simulation (pondéré surface)"
                  >
                    Elo {c.elo ?? '—'}
                  </span>
                  <BadgeSourceElo source={c.sourceElo} taName={c.taName} candidats={c.candidats} />
                  {c.ecartElo != null && (
                    <span
                      className={`font-mono tabular-nums ${
                        c.ecartElo > 0 ? 'text-emerald-600' : c.ecartElo < 0 ? 'text-red-600' : 'text-zinc-400'
                      }`}
                      title="Écart d'Elo effectif (joueur − adversaire)"
                    >
                      {c.ecartElo > 0 ? '+' : ''}
                      {c.ecartElo}
                    </span>
                  )}
                </span>
              </span>

              <span className="shrink-0 text-right" title="Espérance de points">
                <span className="block font-mono text-sm font-semibold tabular-nums">{c.ePoints.toFixed(1)}</span>
                <span className="block text-[10px] text-zinc-400">pts esp.</span>
              </span>
            </label>
            {ouvert && c.insight && <InsightDetail insight={c.insight} />}
            </div>
          );
        })}
        {colonne.candidats.length === 0 && (
          <p className="px-2.5 py-2 text-xs text-zinc-500">Aucun candidat.</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={valider} disabled={pending || !choix || !modifie || colonne.impossible} className={boutonPrimaire}>
          {pending && <Spinner />}
          {pending ? 'Envoi…' : colonne.pickActuel ? 'Modifier' : 'Valider'}
        </button>
        {colonne.pickActuel && (
          <button onClick={retirer} disabled={pending} className={boutonDanger}>
            Retirer
          </button>
        )}
        {erreur && (
          <span className="text-xs text-red-600">{erreur}</span>
        )}
      </div>
    </div>
  );
}

export default function PickBoard({
  tournamentId,
  round,
  colonnes,
  participantId = null,
}: {
  tournamentId: string;
  round: string;
  colonnes: Colonne[];
  /** null = mes picks (comportement historique) ; sinon ceux d'un participant. */
  participantId?: string | null;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-zinc-500">
        Tour {round} — simulation Monte Carlo (20 000 runs) depuis les survivants
        réels de ce tour, triée par points espérés. Sous chaque joueur : son
        adversaire, son Elo effectif, la source de l&apos;Elo et l&apos;écart avec
        l&apos;adversaire. Les joueurs déjà utilisés par CE participant sont
        grisés (un autre participant peut toujours les prendre). Un Elo en{' '}
        <span className="text-amber-600">maison</span> ou en{' '}
        <span className="text-red-600">défaut</span> n&apos;a
        pas trouvé sa correspondance ;{' '}
        <span className="text-violet-600">ambigu</span>{' '}
        signale plusieurs homonymes possibles.
      </p>
      <div className="flex flex-col gap-6 sm:flex-row">
        {colonnes.map((c, i) => (
          <ColonnePick
            key={c.half ?? `slot-${i}`}
            tournamentId={tournamentId}
            round={round}
            colonne={c}
            participantId={participantId}
          />
        ))}
      </div>
    </div>
  );
}
