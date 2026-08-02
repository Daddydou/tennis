'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Sport {
  key: string;
  title: string;
  description: string;
  active: boolean;
}

interface Resume {
  ok: boolean;
  error?: string;
  evenements?: number;
  appariees?: number;
  ecrites?: number;
  nonApparies?: { nom: string; raison: string }[];
  quotaRestant?: number | null;
  quotaUtilise?: number | null;
  coutAppel?: number | null;
}

/**
 * Déclenche l'unique appel à The Odds API.
 *
 * Le bouton reste explicite parce qu'il coûte un crédit sur les 500 du mois,
 * et parce que la fenêtre de capture est courte : passé le match, la cote
 * n'est plus récupérable sur le palier gratuit.
 */
export default function BoutonCotes({
  tournamentId,
  sports,
  sportSuggere,
}: {
  tournamentId: string;
  sports: Sport[];
  sportSuggere: string | null;
}) {
  const [sportKey, setSportKey] = useState(sportSuggere ?? sports[0]?.key ?? '');
  const [resume, setResume] = useState<Resume | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function recuperer() {
    if (!sportKey) return;
    setResume(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/cotes/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tournament_id: tournamentId, sport_key: sportKey }),
        });
        const data = (await res.json()) as Resume;
        setResume(data);
        if (data.ok) router.refresh();
      } catch (e) {
        setResume({ ok: false, error: (e as Error).message });
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={sportKey}
          onChange={(e) => setSportKey(e.target.value)}
          className="max-w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          {sports.length === 0 && <option value="">Aucun sport de tennis listé</option>}
          {sports.map((s) => (
            <option key={s.key} value={s.key}>
              {s.active ? '● ' : '○ '}
              {s.title} — {s.description} ({s.key})
            </option>
          ))}
        </select>
        <button
          onClick={recuperer}
          disabled={pending || !sportKey}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:border-zinc-500 disabled:opacity-50 dark:border-zinc-700"
          title="Consomme 1 crédit sur le quota mensuel"
        >
          {pending ? 'Récupération…' : 'Récupérer les cotes (1 crédit)'}
        </button>
      </div>

      {resume && (
        <div
          className={`rounded border p-2.5 text-xs ${
            resume.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
              : 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
          }`}
        >
          {resume.ok ? (
            <div className="space-y-1">
              <p>
                {resume.evenements} rencontre(s) renvoyée(s) · {resume.appariees} appariée(s)
                au tableau · {resume.ecrites} mise(s) en cache.
              </p>
              {resume.quotaRestant !== null && resume.quotaRestant !== undefined && (
                <p>
                  Quota : {resume.quotaRestant} crédit(s) restant(s)
                  {resume.quotaUtilise != null && ` · ${resume.quotaUtilise} utilisé(s)`}
                  {resume.coutAppel != null && ` · cet appel : ${resume.coutAppel}`}
                </p>
              )}
              {resume.nonApparies && resume.nonApparies.length > 0 && (
                <p className="text-amber-700 dark:text-amber-300">
                  Non appariés ({resume.nonApparies.length}) :{' '}
                  {resume.nonApparies.map((n) => `${n.nom} (${n.raison})`).join(', ')}
                </p>
              )}
            </div>
          ) : (
            <p>{resume.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
