'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function RecomputeButton({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function recompute() {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/recompute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tournament_id: tournamentId }),
        });
        const data = await res.json();
        if (data.ok) {
          setMsg(`${data.picksRecalcules} pick(s) recalculé(s)`);
          router.refresh();
        } else {
          setMsg(data.error ?? 'Erreur');
        }
      } catch (e) {
        setMsg((e as Error).message);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={recompute}
        disabled={pending}
        className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium hover:border-zinc-500 disabled:opacity-50 dark:border-zinc-700"
      >
        {pending ? 'Recalcul…' : 'Recalculer les points'}
      </button>
      {msg && <span className="text-xs text-zinc-500">{msg}</span>}
    </div>
  );
}
