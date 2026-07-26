'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { importerExtrait, type ImportResult } from './actions';

export default function ImportForm() {
  const [json, setJson] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!json.trim()) return;
    startTransition(async () => {
      const r = await importerExtrait(json);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        placeholder='{ "tournament": {...}, "matches": [...] }'
        spellCheck={false}
        className="h-64 w-full rounded border border-zinc-300 bg-white p-3 font-mono text-xs leading-relaxed text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !json.trim()}
          className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {pending ? 'Import…' : 'Importer'}
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
      </div>

      {result && (
        <div
          className={`rounded border p-3 text-sm ${
            result.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
              : 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
          }`}
        >
          {result.ok ? (
            <div className="space-y-2">
              <p className="font-medium">
                Import réussi — {result.resume?.tournoi}
              </p>
              <p>
                {result.resume?.joueurs} joueurs · {result.resume?.matchs} matchs ·
                tours : {result.resume?.rounds.join(' → ')}
              </p>
              {result.avertissements.length > 0 && (
                <div>
                  <p className="font-medium text-amber-700 dark:text-amber-300">
                    Avertissements :
                  </p>
                  <ul className="ml-4 list-disc text-amber-700 dark:text-amber-300">
                    {result.avertissements.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <Link
                  href={`/tournoi/${result.tournamentId}`}
                  className="underline"
                >
                  Voir le tableau
                </Link>
                <Link
                  href={`/tournoi/${result.tournamentId}/picks`}
                  className="underline"
                >
                  Faire mes picks
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="font-medium">Échec de l&apos;import</p>
              <p>{result.error}</p>
              {result.avertissements.length > 0 && (
                <ul className="ml-4 list-disc">
                  {result.avertissements.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </form>
  );
}
