'use client';

import { useState } from 'react';
import { boutonSecondaire } from '@/app/ui';

/**
 * Copie le snippet d'extraction dans le presse-papier.
 *
 * Le fichier est servi par l'app (`public/extract-elo.js`) : on le récupère au
 * clic plutôt que de le recopier dans le JSX — une seconde copie divergerait
 * du jour où l'une des deux serait corrigée.
 */
export default function SnippetElo() {
  const [etat, setEtat] = useState<'repos' | 'copie' | 'echec'>('repos');

  async function copier() {
    try {
      const res = await fetch('/extract-elo.js', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await navigator.clipboard.writeText(await res.text());
      setEtat('copie');
    } catch {
      setEtat('echec');
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={copier} className={boutonSecondaire}>
        Copier le snippet
      </button>
      {etat === 'copie' && (
        <span className="text-xs text-emerald-600">
          Copié — à coller dans la console de la page Tennis Abstract.
        </span>
      )}
      {etat === 'echec' && (
        <span className="text-xs text-red-600">
          Copie refusée —{' '}
          <a href="/extract-elo.js" target="_blank" rel="noreferrer" className="underline">
            ouvrir le fichier
          </a>{' '}
          et le copier à la main.
        </span>
      )}
    </span>
  );
}
