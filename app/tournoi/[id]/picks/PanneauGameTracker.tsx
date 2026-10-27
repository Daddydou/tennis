'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { envoyerGameTracker, lierGameTracker, lireGameTracker, type EnvoiGameTracker, type LectureGameTracker } from './gameTrackerActions';
import { boutonPrimaire, boutonSecondaire, carte, champTexte, Spinner } from '@/app/ui';
import { useDefinirPoolGT } from './PoolGameTracker';
import type { LigneEnvoi, PickGT } from '@/lib/gameTrackerPicks';

/**
 * Picks -> Game Tracker : lecture, puis envoi MANUEL. Rien ne part tout seul,
 * rien ne se charge à l'ouverture de la page (la doc de l'API demande de ne
 * pas appeler à chaque affichage) : c'est le bouton « Lire » qui interroge.
 * Affiché pour MES picks uniquement (la clé agit au nom d'un seul joueur).
 */

const heureParis = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' })
    : 'inconnue';

const nomPick = (p: PickGT | null) => (p ? [p.prenom, p.nom].filter(Boolean).join(' ') || `position ${p.position}` : '—');

const ORIGINE: Record<LigneEnvoi['origine'], string> = {
  local: 'ton pick',
  conserve: 'déjà chez Game Tracker, conservé',
  vide: 'aucun pick',
};

export default function PanneauGameTracker({ tournamentId }: { tournamentId: string }) {
  const [lecture, setLecture] = useState<LectureGameTracker | null>(null);
  const [envoi, setEnvoi] = useState<EnvoiGameTracker | null>(null);
  const [choixLien, setChoixLien] = useState('');
  const [erreurLien, setErreurLien] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const definirPool = useDefinirPoolGT();

  const router = useRouter();

  /** Affiche la lecture ET publie le pool pour la grille de picks (repères « hors pool »). */
  function appliquer(r: LectureGameTracker) {
    setLecture(r);
    definirPool(r.ok && r.lie ? r.pool : null);
    // Nos picks ont été alignés sur Game Tracker : la grille et les points se rechargent.
    if (r.ok && r.lie && r.alignement.ok && r.alignement.changements.length > 0) router.refresh();
  }

  function lire() {
    setEnvoi(null);
    startTransition(async () => appliquer(await lireGameTracker(tournamentId)));
  }

  function lier(gtId: string) {
    setErreurLien(null);
    startTransition(async () => {
      const r = await lierGameTracker(tournamentId, gtId);
      if (!r.ok) {
        setErreurLien(r.erreur);
        return;
      }
      // Lien posé : on relit tout de suite l'état chez Game Tracker.
      appliquer(await lireGameTracker(tournamentId));
    });
  }

  function envoyer(attendu: { tour: number; haut: number | null; bas: number | null }) {
    startTransition(async () => {
      setEnvoi(await envoyerGameTracker(tournamentId, attendu));
      // L'état affiché vieillit dès qu'on envoie : on le relit.
      appliquer(await lireGameTracker(tournamentId));
    });
  }

  const prep = lecture && lecture.ok && lecture.lie ? lecture.preparation : null;
  const etat = lecture && lecture.ok && lecture.lie ? lecture.etat : null;
  const to = etat?.tourOuvert ?? null;

  return (
    <details className={`${carte} px-3 py-2`}>
      <summary className="min-h-11 cursor-pointer select-none py-2 text-sm font-semibold">Game Tracker</summary>
      <div className="space-y-3 pb-2 text-sm">
        <p className="text-xs text-zinc-500">
          Lit ton état chez Game Tracker et y pose tes picks du tour ouvert, au nom de ton compte. Rien n&apos;est envoyé sans
          ton clic sur « Envoyer ». Un pick posé chez eux peut être redirigé automatiquement si un joueur « en attente »
          perd : relis avant le verrou. À chaque lecture, les tours déjà verrouillés chez Game Tracker sont recopiés chez nous
          pour Moi, Laki et Thomas : c&apos;est leur jeu qui compte.
        </p>

        <button onClick={lire} disabled={pending} className={boutonSecondaire}>
          {pending && <Spinner />}
          {lecture ? 'Relire Game Tracker' : 'Lire Game Tracker'}
        </button>

        {lecture && !lecture.ok && <p className="text-xs text-red-600">{lecture.erreur}</p>}
        {lecture && lecture.ok && !lecture.lie && (
          <div className="space-y-2 rounded-xl bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
            <p>{lecture.message}</p>
            {lecture.candidats.length === 0 ? (
              <p>
                Aucun tournoi Game Tracker ne correspond (même circuit, même année, même taille de tableau). Si le tournoi vient de
                commencer, réessaie dans un moment.
              </p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  value={choixLien || lecture.candidats[0].id}
                  onChange={(e) => setChoixLien(e.target.value)}
                  className={`w-full ${champTexte}`}
                  aria-label="Tournoi Game Tracker"
                >
                  {lecture.candidats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom} ({c.tour}, {c.statut}){c.suggere ? ' — suggéré' : ''}
                    </option>
                  ))}
                </select>
                <button onClick={() => lier(choixLien || lecture.candidats[0].id)} disabled={pending} className={boutonPrimaire}>
                  {pending && <Spinner />}
                  Relier
                </button>
              </div>
            )}
            {erreurLien && <p className="text-red-700">{erreurLien}</p>}
          </div>
        )}

        {lecture && lecture.ok && lecture.lie && (
          <div
            className={`rounded-xl px-2.5 py-2 text-xs ${
              lecture.alignement.ok ? 'bg-zinc-100 text-zinc-800' : 'bg-red-50 text-red-900'
            }`}
          >
            {!lecture.alignement.ok ? (
              <>
                <p className="font-medium">Tours terminés : alignement sur Game Tracker impossible, rien n&apos;a été modifié.</p>
                <ul className="ml-4 list-disc">
                  {lecture.alignement.raisons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </>
            ) : lecture.alignement.rounds.length === 0 ? (
              <p>Aucun tour verrouillé chez Game Tracker : rien à aligner.</p>
            ) : (
              <>
                <p className="font-medium">
                  Tours verrouillés ({lecture.alignement.rounds.join(', ')}) : nos picks suivent ceux de Game Tracker.{' '}
                  {lecture.alignement.changements.length === 0
                    ? 'Déjà identiques.'
                    : `${lecture.alignement.changements.length} changement(s) appliqué(s) :`}
                </p>
                {lecture.alignement.changements.length > 0 && (
                  <ul className="ml-4 list-disc">
                    {lecture.alignement.changements.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {lecture.alignement.ok && lecture.alignement.avertissements.length > 0 && (
              <ul className="ml-4 mt-1 list-disc text-amber-800">
                {lecture.alignement.avertissements.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {etat && !to && <p className="text-xs text-zinc-600">Aucun tour ouvert aux picks chez Game Tracker pour l&apos;instant.</p>}

        {etat && to && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-600">
              {etat.tournoi.nom} — tour ouvert : <strong>{to.nom}</strong> (n°{to.numero}) · verrou : {heureParis(to.lockAt)}
            </p>
            <p className="text-xs text-zinc-600">
              Chez Game Tracker aujourd&apos;hui —{' '}
              {to.picksAttendus === 1 ? (
                <>pick : {nomPick(to.monPick.haut)}</>
              ) : (
                <>
                  haut : {nomPick(to.monPick.haut)} · bas : {nomPick(to.monPick.bas)}
                </>
              )}{' '}
              ({to.monPick.etat})
            </p>

            {prep && !prep.ok && (
              <div className="rounded-xl bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                <p className="font-medium">Rien à envoyer pour l&apos;instant :</p>
                <ul className="ml-4 list-disc">
                  {prep.raisons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {prep && prep.ok && (
              <div className="space-y-2 rounded-xl bg-zinc-50 px-2.5 py-2 text-xs">
                <p className="font-medium">Ce qui serait envoyé (tour {prep.tour} = {prep.roundLocal}) :</p>
                <ul className="ml-4 list-disc">
                  {prep.lignes.map((l) => (
                    <li key={l.cote}>
                      {to.picksAttendus === 1 ? 'Pick' : l.cote === 'haut' ? 'Haut' : 'Bas'} : {l.nom ?? '—'}
                      {l.position !== null && <span className="text-zinc-500"> (position {l.position})</span>} —{' '}
                      <span className="text-zinc-500">{ORIGINE[l.origine]}</span>
                      {l.enAttente && <span className="text-amber-700"> · en attente</span>}
                    </li>
                  ))}
                </ul>
                {prep.avertissements.length > 0 && (
                  <ul className="ml-4 list-disc text-amber-800">
                    {prep.avertissements.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}
                {prep.dejaAJour ? (
                  <p className="text-emerald-700">Game Tracker a déjà exactement ces picks : rien à envoyer.</p>
                ) : (
                  <button
                    onClick={() => envoyer({ tour: prep.tour, haut: prep.haut, bas: prep.bas })}
                    disabled={pending}
                    className={boutonPrimaire}
                  >
                    {pending && <Spinner />}
                    Envoyer sur Game Tracker
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {envoi && !envoi.ok && <p className="text-xs text-red-600">{envoi.erreur}</p>}
        {envoi && envoi.ok && (
          <div className="rounded-xl bg-emerald-50 px-2.5 py-2 text-xs text-emerald-900">
            <p className="font-medium">{envoi.dejaAJour ? 'Déjà à jour chez Game Tracker.' : 'Envoyé. Pick réel relu chez Game Tracker :'}</p>
            <p>
              haut : {nomPick(envoi.reel.haut)} · bas : {nomPick(envoi.reel.bas)}
            </p>
            {envoi.ecarts.length > 0 && (
              <p className="mt-1 font-medium text-amber-800">
                ⚠ Game Tracker a modifié ton pick par rapport à ce qui a été envoyé (
                {envoi.ecarts.map((e) => `${e.cote} : ${e.envoye ?? '—'} → ${e.reel ?? '—'}`).join(' ; ')}).
              </p>
            )}
          </div>
        )}

        {etat && etat.classement.length > 0 && (
          <div className="text-xs text-zinc-600">
            <p className="font-medium">Classement Game Tracker</p>
            <ol className="ml-4 list-decimal">
              {etat.classement.map((c) => (
                <li key={c.pseudo} className={c.moi ? 'font-semibold' : undefined}>
                  {c.pseudo} — {c.points} pts
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </details>
  );
}
