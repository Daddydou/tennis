'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { boutonSecondaire, noteInfo } from '@/app/ui';
import { lireGameTrackerMasters, type LectureMasters } from './mastersGTActions';

/**
 * « Lire Game Tracker » depuis le Dashboard d'un Masters : lit l'application de Thomas (Game Tracker) et recopie
 * chez nous les picks (les miens sur les tours modifiables, ceux de tous sur les tours verrouillés). LECTURE
 * SEULE : rien n'est envoyé à Game Tracker (l'envoi reste dans l'onglet Picks, sur clic). Même action serveur
 * que le panneau de l'onglet Picks : `lireGameTrackerMasters`, protégée par la session.
 */
export default function BoutonLireGTMasters({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [lecture, setLecture] = useState<LectureMasters | null>(null);

  const lire = () =>
    demarrer(async () => {
      const r = await lireGameTrackerMasters(tournamentId);
      setLecture(r);
      if (r.ok) router.refresh();
    });

  return (
    <div className="space-y-2" data-testid="lire-gt-masters">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={lire} disabled={enCours} className={boutonSecondaire}>
          {enCours ? 'Lecture…' : 'Lire Game Tracker'}
        </button>
        <span className="text-xs text-zinc-600">lit l&apos;application de Thomas ; rien n&apos;est envoyé</span>
      </div>

      {lecture && !lecture.ok && (
        <p role="status" className="text-sm text-red-700">
          {lecture.erreur}
        </p>
      )}

      {lecture?.ok && (
        <div role="status" className="space-y-1.5 text-sm text-zinc-800">
          {lecture.remplacements.length > 0 && <p className={noteInfo}>Remplaçante prise en compte : {lecture.remplacements.join(' ; ')}.</p>}
          {lecture.tours.map((t) => {
            const picks = t.picksAttendus === 1 ? (t.haut ?? '— (pas posé)') : `${t.haut ?? '— (pas posé)'} · ${t.bas ?? '— (pas posé)'}`;
            const verrou = t.lockAt ? new Date(t.lockAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : null;
            return (
              <p key={t.numero}>
                <span className="font-medium">{t.nom}</span>
                {verrou ? <span className="text-xs text-zinc-600"> (verrou {verrou})</span> : null} : mes picks chez Game Tracker : {picks}
              </p>
            );
          })}
          <p className="text-xs text-zinc-600">
            {lecture.alignement.ecrits + lecture.alignement.supprimes > 0
              ? `Picks recopiés chez nous : ${lecture.alignement.ecrits} ajouté${lecture.alignement.ecrits > 1 ? 's' : ''} ou mis à jour, ${lecture.alignement.supprimes} retiré${lecture.alignement.supprimes > 1 ? 's' : ''}.`
              : 'Nos picks sont déjà identiques à ceux de Game Tracker.'}
          </p>
        </div>
      )}
    </div>
  );
}
