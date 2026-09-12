'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { importerExtrait, type ImportResult } from './actions';
import { boutonPrimaire, champTexte, Spinner, zoneTactile } from '@/app/ui';

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
        className={`h-64 w-full py-3 font-mono text-xs leading-relaxed ${champTexte}`}
      />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || !json.trim()} className={boutonPrimaire}>
          {pending && <Spinner />}
          {pending ? 'Import…' : 'Importer'}
        </button>
        {json.trim() && (
          <button
            type="button"
            onClick={() => {
              setJson('');
              setResult(null);
            }}
            className={`${zoneTactile} px-2 text-sm text-zinc-500 transition active:scale-[0.97] hover:text-zinc-900`}
          >
            Effacer
          </button>
        )}
      </div>

      {result && (
        <div
          className={`rounded-xl p-3 text-sm ${
            result.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'
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
                  <p className="font-medium text-amber-700">
                    Avertissements :
                  </p>
                  <ul className="ml-4 list-disc text-amber-700">
                    {result.avertissements.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="-ml-2 flex flex-wrap pt-1">
                <Link
                  href={`/tournoi/${result.tournamentId}/tableau`}
                  className={`${zoneTactile} px-2 underline`}
                >
                  Voir le tableau
                </Link>
                <Link href={`/tournoi/${result.tournamentId}/picks`} className={`${zoneTactile} px-2 underline`}>
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
