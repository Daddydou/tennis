'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Forme du résumé renvoyé par la route. Redéclarée ici plutôt qu'importée de
 * `supabase/elo-refresh` : ce module porte `server-only`, et un composant
 * client n'a pas à en dépendre, même pour un type.
 */
interface ResumeRefresh {
  ok: boolean;
  error?: string;
  tours: {
    tour: 'atp' | 'wta';
    lues: number;
    importees: number;
    homonymes: { cle: string; slugs: string[] }[];
    misAJourLe: string | null;
  }[];
}

/**
 * Collage de l'extrait produit par `public/extract-elo.js`.
 *
 * Même geste que l'import d'un tableau : une zone de texte, un bouton. Le
 * circuit (atp/wta) est lu dans le JSON, pas choisi ici — le snippet le déduit
 * de l'URL du rapport, ce qui évite de coller un extrait ATP en disant WTA.
 */
export default function ImportEloForm() {
  const [json, setJson] = useState('');
  const [result, setResult] = useState<ResumeRefresh | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!json.trim()) return;
    startTransition(async () => {
      try {
        // Le collage est envoyé tel quel : c'est le serveur qui le parse, et
        // qui sait dire si l'échec vient du JSON ou de son contenu.
        const res = await fetch('/api/elo/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: json,
        });
        const data = (await res.json()) as ResumeRefresh;
        setResult({ ...data, tours: data.tours ?? [] });
        if (data.ok) router.refresh();
      } catch (e) {
        setResult({ ok: false, error: (e as Error).message, tours: [] });
      }
    });
  }

  const homonymes = (result?.tours ?? []).flatMap((t) => t.homonymes);

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        placeholder='{ "tour": "atp", "updated": "2026-07-27", "players": [...] }'
        spellCheck={false}
        className="h-64 w-full rounded border border-zinc-300 bg-white p-3 font-mono text-xs leading-relaxed text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !json.trim()}
          className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {pending ? 'Import…' : 'Importer les Elo'}
        </button>
        {json.trim() && (
          <button
            type="button"
            onClick={() => {
              setJson('');
              setResult(null);
            }}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Effacer
          </button>
        )}
        <span className="text-xs text-zinc-500">
          {json.trim() ? `${Math.round(json.length / 1024)} Ko collés` : ''}
        </span>
      </div>

      {result && (
        <div
          className={`space-y-2 rounded border p-3 text-sm ${
            result.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
              : 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
          }`}
        >
          {result.ok ? (
            <>
              <p className="font-medium">Import réussi</p>
              <ul className="ml-4 list-disc">
                {result.tours.map((t) => (
                  <li key={t.tour}>
                    {t.tour.toUpperCase()} : {t.importees} joueurs écrits sur{' '}
                    {t.lues} lus
                    {t.misAJourLe ? ` (rapport du ${t.misAJourLe})` : ''}
                  </li>
                ))}
              </ul>
              <p className="text-xs">
                Cache des projections Monte Carlo et des équipes Fantasy vidé :
                chaque tour consulté sera resimulé au premier affichage.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Échec de l&apos;import</p>
              <p>{result.error}</p>
            </>
          )}
        </div>
      )}

      {homonymes.length > 0 && (
        <p className="text-xs text-violet-600 dark:text-violet-400">
          {homonymes.length} clé(s) portée(s) par plusieurs joueurs, toutes
          conservées — un tableau qui en contient un affichera « ambigu » tant
          qu&apos;aucune exception ne tranche :{' '}
          {homonymes.map((h) => h.slugs.join(' / ')).join(' · ')}
        </p>
      )}
    </form>
  );
}
